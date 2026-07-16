import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { emptyAnalysis, type DocumentAnalysis } from "@/lib/document-analysis";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseWithOfficeParser } from "@/lib/document-ingestion";
import { inspectPptxWithAutomizer } from "@/lib/pptx-automizer-adapter";

const execFileAsync = promisify(execFile);

const allowedExtensions = [".ppt", ".pptx", ".pdf", ".doc", ".docx", ".txt", ".md", ".html", ".htm", ".png", ".jpg", ".jpeg", ".webp"];
const pythonCandidates = [
  process.env.PYTHON_BIN,
  path.join(process.cwd(), ".venv-parser", "Scripts", "python.exe"),
  path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe"),
  "python",
  "python3"
].filter(Boolean) as string[];

function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 160) || "upload.bin";
}

function cleanText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function short(value: string, limit = 520) {
  const text = cleanText(value);
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}...`;
}

function blockType(text: string): "heading" | "text" | "list" | "table" {
  const value = cleanText(text);
  if (/^([*-]|\d+[.)])\s+/.test(value)) return "list";
  if (value.includes("\t") || value.split("|").length >= 3) return "table";
  if (value.length <= 32) return "heading";
  return "text";
}

function paragraphsFromText(text: string) {
  const clean = cleanText(text);
  if (!clean) return [];
  const parts = clean
    .split(/\n\s*\n|(?<=[銆傦紒锛?!?])\s+(?=[\u4e00-\u9fa5A-Za-z0-9])/g)
    .map((item) => short(item))
    .filter((item) => item.length >= 4);
  if (parts.length <= 1 && clean.length > 520) {
    return Array.from({ length: Math.ceil(clean.length / 520) }, (_, index) => short(clean.slice(index * 520, index * 520 + 520)));
  }
  return parts.slice(0, 80);
}

function stripHtml(value: string) {
  return cleanText(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
  );
}

function buildTextAnalysis(fileName: string, fileType: string, text: string, sourceKind: "text" | "image"): DocumentAnalysis {
  const paragraphs = paragraphsFromText(text);
  const idStem = safeFileName(fileName).replace(/[^a-zA-Z0-9_-]+/g, "-") || "upload";
  const blocks = paragraphs.map((paragraph, index) => ({
    id: `${idStem}-p1-b${index + 1}`,
    page: 1,
    type: sourceKind === "image" ? "image" as const : blockType(paragraph),
    text: paragraph,
    confidence: sourceKind === "image" ? 58 : 86,
    sourceRef: `p1/b${index + 1}`
  }));
  const pages = blocks.length
    ? [{
        page: 1,
        title: short(blocks.find((block) => block.type === "heading")?.text || blocks[0].text, 42),
        summary: short(blocks.slice(0, 3).map((block) => block.text).join(" "), 180),
        blockCount: blocks.length,
        imageCount: sourceKind === "image" ? 1 : 0,
        tableCount: blocks.filter((block) => block.type === "table").length,
        blocks: blocks.slice(0, 12)
      }]
    : [];
  return {
    fileName,
    fileType,
    pageCount: pages.length,
    blockCount: blocks.length,
    summary: blocks.length ? short(blocks.slice(0, 8).map((block) => block.text).join(" "), 420) : "No usable text was extracted.",
    outlineSuggestions: blocks.filter((block) => block.type === "heading").map((block) => short(block.text, 36)).slice(0, 10),
    pages,
    blocks,
    sourceKind,
    parseStatus: blocks.length ? "parsed" : "partial",
    warnings: sourceKind === "image" ? ["image_ocr_not_available"] : [],
    parser: "native"
  };
}

async function parseWithJs(filePath: string, fileName: string, fileType: string): Promise<DocumentAnalysis | null> {
  if (["txt", "md"].includes(fileType)) {
    const content = new TextDecoder("utf-8", { fatal: false }).decode(await readFile(filePath));
    return buildTextAnalysis(fileName, fileType, content, "text");
  }
  if (["html", "htm"].includes(fileType)) {
    const buffer = await readFile(filePath);
    const header = new TextDecoder("ascii").decode(buffer.subarray(0, 4096));
    const charset = header.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]?.toLowerCase();
    const decoder = charset && ["gb2312", "gbk", "gb18030"].includes(charset) ? new TextDecoder("gb18030") : new TextDecoder("utf-8", { fatal: false });
    const content = decoder.decode(buffer);
    return buildTextAnalysis(fileName, fileType, stripHtml(content), "text");
  }
  if (["png", "jpg", "jpeg", "webp"].includes(fileType)) {
    return buildTextAnalysis(fileName, fileType, `Image asset: ${fileName}. OCR is not installed in this release; the file is retained as visual reference material.`, "image");
  }
  return null;
}

function errorText(error: unknown) {
  if (!error || typeof error !== "object") return String(error);
  const record = error as Record<string, unknown>;
  return [record.message, record.stderr, record.stdout, record.code].map((item) => String(item || "")).filter(Boolean).join(" ");
}

function classifyParserFailure(error: string) {
  if (/ENOENT|not recognized|not found|cannot find|No such file/i.test(error)) return "parser_runtime_unavailable";
  if (/ModuleNotFoundError|No module named|ImportError/i.test(error)) return "parser_dependency_missing";
  return "parser_execution_failed";
}

function failedAnalysis(fileName: string, fileType: string, lastError: string): DocumentAnalysis {
  const reason = classifyParserFailure(lastError);
  return {
    ...emptyAnalysis(fileName, fileType),
    parseStatus: "failed",
    warnings: [
      reason,
      "run scripts/setup-parser-python.ps1 then npm run p1g:parser-check"
    ],
    summary: `File uploaded, but structured parsing failed (${reason}). Install parser dependencies with scripts/setup-parser-python.ps1. ${lastError.slice(0, 180)}`,
    parser: "python"
  };
}

async function parseDocument(filePath: string, fileName: string, fileType: string): Promise<DocumentAnalysis> {
  const jsParsed = await parseWithJs(filePath, fileName, fileType);
  if (jsParsed) return jsParsed;

  if (["pdf", "docx", "pptx"].includes(fileType)) {
    try {
      return await parseWithOfficeParser(filePath, fileName, fileType);
    } catch (error) {
      console.warn("[upload-ppt] officeparser failed, using compatibility parser", error);
    }
  }

  const script = path.join(process.cwd(), "scripts", "parse_document.py");
  let lastError = "";

  for (const python of pythonCandidates) {
    try {
      const { stdout } = await execFileAsync(python, [script, filePath, fileName], {
        encoding: "utf8",
        timeout: 60000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8"
        }
      });
      const parsed = JSON.parse(stdout) as DocumentAnalysis;
      return parsed?.fileName
        ? { ...parsed, parseStatus: parsed.blockCount > 0 ? "parsed" : "partial", warnings: parsed.warnings || [], parser: "python" }
        : { ...emptyAnalysis(fileName, fileType), parseStatus: "partial", warnings: ["parser_returned_empty_result"] };
    } catch (error) {
      lastError = errorText(error);
    }
  }

  return failedAnalysis(fileName, fileType, lastError);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "file is required" }, { status: 400 });
  }

  const lowerName = file.name.toLowerCase();
  const extension = path.extname(lowerName);
  const isAllowed = allowedExtensions.some((item) => lowerName.endsWith(item));

  if (!isAllowed) {
    return NextResponse.json({ message: "unsupported file type" }, { status: 415 });
  }

  const uploadDir = path.join(os.tmpdir(), "ai-ppt-agent-uploads");
  await mkdir(uploadDir, { recursive: true });
  const fileName = safeFileName(file.name);
  const tempPath = path.join(uploadDir, `${randomUUID()}-${fileName}`);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(tempPath, buffer);
    const fileType = extension.replace(".", "") || file.type || "unknown";
    const analysis = await parseDocument(tempPath, file.name, fileType);
    if (fileType === "pptx") {
      try {
        const templateManifest = await inspectPptxWithAutomizer(tempPath);
        analysis.metadata = { ...(analysis.metadata || {}), templateManifest };
      } catch (error) {
        analysis.warnings = [...(analysis.warnings || []), `pptx_automizer_inspection_failed: ${error instanceof Error ? error.message : String(error)}`];
      }
    }
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const user = await getCurrentUser();
    let assetId: string | undefined;
    let storageStatus: "persisted" | "temporary" = "temporary";

    if (user) {
      assetId = randomUUID();
      const assetDir = path.join(process.cwd(), "artifacts", "source-assets", user.id, assetId);
      await mkdir(assetDir, { recursive: true });
      const storagePath = path.join(assetDir, fileName);
      await writeFile(storagePath, buffer);
      await prisma.sourceAsset.create({
        data: {
          id: assetId,
          userId: user.id,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          fileType,
          byteSize: buffer.length,
          sha256,
          storagePath,
          parseStatus: analysis.parseStatus || (analysis.blockCount ? "parsed" : "partial"),
          parser: analysis.parser || "compatibility",
          analysisJson: JSON.stringify(analysis),
          metadataJson: JSON.stringify({ originalName: file.name, uploadedAt: new Date().toISOString() }),
        },
      });
      storageStatus = "persisted";
    }

    return NextResponse.json({
      fileName: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      status: "uploaded",
      analysis,
      assetId,
      sha256,
      storageStatus
    });
  } finally {
    void rm(tempPath, { force: true }).catch(() => undefined);
  }
}

