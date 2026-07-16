import { parseOffice, type OfficeContentNode, type OfficeChunk } from "officeparser";
import type { DocumentAnalysis, DocumentBlock, DocumentBlockType, DocumentChunk, DocumentPage } from "@/lib/document-analysis";

const MAX_BLOCKS = 160;
const MAX_BLOCK_CHARS = 900;

function clean(value: unknown) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function short(value: unknown, limit = MAX_BLOCK_CHARS) {
  const text = clean(value);
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}...`;
}

function blockType(node: OfficeContentNode): DocumentBlockType {
  if (node.type === "heading") return "heading";
  if (node.type === "list") return "list";
  if (node.type === "table") return "table";
  if (node.type === "image" || node.type === "chart" || node.type === "drawing") return "image";
  if (node.type === "code") return "code";
  return "text";
}

function meaningfulNodes(nodes: OfficeContentNode[], output: OfficeContentNode[] = []) {
  for (const node of nodes) {
    const text = clean(node.text);
    const isContent = ["heading", "paragraph", "list", "table", "image", "chart", "drawing", "code"].includes(node.type);
    if (isContent && (text || ["image", "chart", "drawing"].includes(node.type))) {
      output.push(node);
      continue;
    }
    if (node.children?.length) meaningfulNodes(node.children, output);
  }
  return output;
}

function pageNumberFor(node: OfficeContentNode, fallback: number) {
  if (node.type === "slide") return Number(node.metadata?.slideNumber) || fallback;
  if (node.type === "page") return Number(node.metadata?.pageNumber) || fallback;
  return fallback;
}

function blocksForPage(nodes: OfficeContentNode[], page: number, fileStem: string) {
  return meaningfulNodes(nodes).map((node, index): DocumentBlock => ({
    id: `${fileStem}-p${page}-b${index + 1}`,
    page,
    type: index === 0 && blockType(node) === "text" && clean(node.text).length <= 54 ? "title" : blockType(node),
    text: short(node.text || (node.type === "chart" ? "图表对象" : node.type === "image" ? "图片对象" : "绘图对象")),
    confidence: node.type === "image" || node.type === "chart" || node.type === "drawing" ? 72 : 90,
    sourceRef: `p${page}/b${index + 1}`,
  })).filter((block) => block.text).slice(0, 24);
}

function pageFromBlocks(page: number, blocks: DocumentBlock[]): DocumentPage {
  const title = blocks.find((block) => block.type === "title" || block.type === "heading")?.text || blocks[0]?.text || `第 ${page} 页`;
  return {
    page,
    title: short(title, 64),
    summary: short(blocks.slice(0, 4).map((block) => block.text).join(" "), 260),
    blockCount: blocks.length,
    imageCount: blocks.filter((block) => block.type === "image").length,
    tableCount: blocks.filter((block) => block.type === "table").length,
    blocks,
  };
}

function issueText(issue: unknown) {
  if (!issue || typeof issue !== "object") return clean(issue);
  const record = issue as Record<string, unknown>;
  return clean([record.code, record.message].filter(Boolean).join(": "));
}

function sourceKind(fileType: string): DocumentAnalysis["sourceKind"] {
  if (fileType === "pdf" || fileType === "docx" || fileType === "pptx") return fileType;
  if (fileType === "md" || fileType === "html") return "text";
  return "unknown";
}

export async function parseWithOfficeParser(filePath: string, fileName: string, fileType: string): Promise<DocumentAnalysis> {
  const warnings: string[] = [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);
  try {
    const ocrEnabled = process.env.DOCUMENT_OCR_ENABLED === "true" && fileType === "pdf";
    const ast = await parseOffice(filePath, {
      fileType: fileType === "doc" || fileType === "ppt" ? undefined : fileType as never,
      ignoreSlideMasters: true,
      ignoreNotes: false,
      extractAttachments: false,
      ocr: ocrEnabled,
      ocrConfig: ocrEnabled ? {
        language: process.env.DOCUMENT_OCR_LANGUAGES || "chi_sim+eng",
        timeout: { workerLoad: 30_000, recognition: 20_000, autoTerminate: 5_000 },
      } : undefined,
      abortSignal: controller.signal,
      onWarning: (issue) => warnings.push(issueText(issue)),
    });

    const stem = fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-") || "upload";
    const containers = ast.content.filter((node) => node.type === "slide" || node.type === "page");
    const pages = (containers.length ? containers : [{ type: "page", children: ast.content, metadata: { pageNumber: 1 } } as OfficeContentNode])
      .map((container, index) => {
        const page = pageNumberFor(container, index + 1);
        return pageFromBlocks(page, blocksForPage(container.children || [], page, stem));
      })
      .filter((page) => page.blockCount > 0);
    const blocks = pages.flatMap((page) => page.blocks).slice(0, MAX_BLOCKS);

    let chunks: DocumentChunk[] = [];
    try {
      const splitBy = ast.type === "pptx" || ast.type === "odp" ? "slide" : ast.type === "pdf" ? "page" : "heading";
      const generated = await ast.to("chunks", { chunksConfig: { strategy: "document-structure", splitBy, maxChunkSize: 1200, tableSplitStrategy: "row" } });
      chunks = ((generated.value || []) as OfficeChunk[]).map((chunk, index) => ({
        id: `${stem}-chunk-${index + 1}`,
        text: short(chunk.text, 1600),
        page: chunk.metadata.pageNumber,
        slide: chunk.metadata.slideNumber,
        heading: clean(chunk.metadata.closestHeading),
      })).filter((chunk) => chunk.text).slice(0, 120);
      warnings.push(...generated.messages.map(issueText).filter(Boolean));
    } catch (error) {
      warnings.push(`rag_chunking_failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const summary = short(blocks.filter((block) => block.type !== "image").slice(0, 10).map((block) => block.text).join(" "), 520);
    return {
      fileName,
      fileType,
      pageCount: pages.length,
      blockCount: blocks.length,
      summary: summary || "未提取到可用正文。",
      outlineSuggestions: blocks.filter((block) => block.type === "title" || block.type === "heading").map((block) => short(block.text, 48)).slice(0, 16),
      pages,
      blocks,
      chunks,
      sourceKind: sourceKind(ast.type),
      parseStatus: blocks.length ? "parsed" : "partial",
      warnings: [...new Set([...warnings, ...ast.warnings.map(issueText)].filter(Boolean))],
      parser: "officeparser",
      metadata: JSON.parse(JSON.stringify(ast.metadata || {})) as Record<string, unknown>,
    };
  } finally {
    clearTimeout(timeout);
  }
}
