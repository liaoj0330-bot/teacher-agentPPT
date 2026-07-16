import type { ResearchItem, UploadedAsset } from "@/lib/canvas-data";
import type { DocumentAnalysis, DocumentBlock } from "@/lib/document-analysis";
import { cleanText } from "@/lib/text-sanitize";
import type { SourceDocument, SourceDocumentType, SourceFileType, SourceParseStatus } from "@/lib/ppt-agent/evidence-types";
import { clampEvidenceScore } from "@/lib/ppt-agent/evidence-types";

type ParseInput = {
  prompt: string;
  uploadedAssets?: unknown[];
  uploadedFile?: unknown;
  research?: ResearchItem[];
  pastedText?: unknown;
};

function safeId(prefix: string, index: number) {
  return `${prefix}-${index + 1}`;
}

function extensionToFileType(value: string | undefined): SourceFileType {
  const lower = cleanText(value).toLowerCase();
  if (lower.endsWith(".txt") || lower === "txt" || lower.includes("plain")) return "txt";
  if (lower.endsWith(".md") || lower === "md" || lower.includes("markdown")) return "md";
  if (lower.endsWith(".pdf") || lower === "pdf") return "pdf";
  if (lower.endsWith(".docx") || lower.endsWith(".doc") || lower === "docx" || lower.includes("word")) return "docx";
  if (lower.endsWith(".pptx") || lower.endsWith(".ppt") || lower === "pptx" || lower.includes("powerpoint")) return "pptx";
  if (lower.endsWith(".html") || lower.endsWith(".htm") || lower === "html") return "html";
  return "unknown";
}

function normalizedJoined(values: unknown[]) {
  return values.map((value) => cleanText(value)).filter(Boolean).join("\n");
}

function stripHtml(value: string) {
  return cleanText(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanBodyText(value: string, fileType: SourceFileType) {
  if (fileType === "html") return stripHtml(value);
  return cleanText(value);
}

function statusForAnalysis(analysis: DocumentAnalysis | undefined, fileType: SourceFileType): SourceParseStatus {
  if (!analysis) {
    return fileType === "unknown" ? "unsupported" : "partial";
  }
  if (analysis.blockCount > 0) return "parsed";
  if (["pdf", "docx", "pptx", "txt", "md"].includes(fileType)) return "partial";
  return "unsupported";
}

function textFromAnalysis(analysis: DocumentAnalysis | undefined) {
  if (!analysis) return "";
  const blockText = (analysis.blocks || [])
    .filter((block: DocumentBlock) => cleanText(block.text).length > 0)
    .slice(0, 140)
    .map((block) => `Page ${block.page} ${block.type}: ${cleanText(block.text)}`)
    .join("\n");
  return normalizedJoined([
    analysis.summary,
    ...(analysis.outlineSuggestions || []),
    ...(analysis.pages || []).map((page) => `${page.title}\n${page.summary}`),
    blockText
  ]);
}

function makeDocument(input: {
  sourceId: string;
  assetId?: string;
  sha256?: string;
  storageStatus?: SourceDocument["storageStatus"];
  sourceType: SourceDocumentType;
  fileType?: SourceFileType;
  title: string;
  fileName?: string;
  url?: string;
  provider?: string;
  providerTier?: SourceDocument["providerTier"];
  rawText?: string;
  confidence?: number;
  parseStatus?: SourceParseStatus;
  warnings?: string[];
  chunks?: SourceDocument["chunks"];
}): SourceDocument {
  const rawText = cleanBodyText(cleanText(input.rawText), input.fileType || "unknown");
  return {
    sourceId: input.sourceId,
    assetId: input.assetId,
    sha256: input.sha256,
    storageStatus: input.storageStatus,
    sourceType: input.sourceType,
    fileType: input.fileType || "unknown",
    title: cleanText(input.title, input.fileName || input.url || input.sourceId),
    fileName: cleanText(input.fileName),
    url: cleanText(input.url),
    provider: cleanText(input.provider),
    providerTier: input.providerTier,
    rawText,
    normalizedText: rawText.replace(/\s+/g, " ").trim(),
    extractedAt: new Date().toISOString(),
    confidence: clampEvidenceScore(input.confidence ?? 50),
    parseStatus: input.parseStatus || (rawText ? "parsed" : "partial"),
    warnings: (input.warnings || []).map((item) => cleanText(item)).filter(Boolean),
    chunks: input.chunks,
  };
}

function uploadedAssetToDocument(asset: unknown, index: number): SourceDocument | undefined {
  if (!asset || typeof asset !== "object") return undefined;
  const record = asset as UploadedAsset & Record<string, unknown>;
  const name = cleanText(record.name || record.fileName, `上传资料 ${index + 1}`);
  const mimeType = cleanText(record.mimeType || record.type);
  const fileType = extensionToFileType(name || mimeType);
  const analysis = record.analysis as DocumentAnalysis | undefined;
  const analysisText = textFromAnalysis(analysis);
  const directText = normalizedJoined([
    record.text,
    record.rawText,
    record.content,
    record.markdown,
    record.normalizedText,
    record.plainText,
    record.summary,
    record.snippet
  ]);
  const rawText = analysisText || directText;
  const analysisStatus = (analysis as (DocumentAnalysis & { parseStatus?: SourceParseStatus }) | undefined)?.parseStatus;
  const parseStatus = analysisStatus || (rawText ? statusForAnalysis(analysis, fileType) : fileType === "unknown" ? "unsupported" : "partial");
  const parserWarnings = ((analysis as (DocumentAnalysis & { warnings?: string[] }) | undefined)?.warnings || []).map((item) => cleanText(item)).filter(Boolean);
  const warnings = [
    ...parserWarnings,
    parseStatus === "partial" ? "文件仅完成部分解析，关键结论需要用户复核。" : "",
    parseStatus === "failed" ? "文件解析失败：请运行 scripts/setup-parser-python.ps1 并执行 npm run p1g:parser-check。" : "",
    parseStatus === "unsupported" ? "文件类型暂不支持完整解析，仅保留文件名和上传状态。" : "",
    !analysisText && !directText ? "未提取到正文，不能视为外部事实证据。" : "",
    fileType === "pdf" && parseStatus !== "parsed" ? "PDF 可能是扫描件或文本提取失败，本轮未做 OCR。" : "",
    fileType === "pptx" && parseStatus !== "parsed" ? "PPTX 未提取到可用文本，图片和图表识别不在本轮范围内。" : "",
    fileType === "docx" && parseStatus !== "parsed" ? "DOCX 未提取到可用段落，需重新上传或转为 TXT/MD。" : ""
  ].filter(Boolean);

  return makeDocument({
    sourceId: cleanText(record.assetId || record.id, safeId("uploaded-source", index)),
    assetId: cleanText(record.assetId),
    sha256: cleanText(record.sha256),
    storageStatus: record.storageStatus === "persisted" ? "persisted" : "temporary",
    sourceType: "uploaded_file",
    fileType,
    title: name,
    fileName: name,
    provider: "local-upload",
    rawText,
    confidence: parseStatus === "parsed" ? 86 : parseStatus === "partial" ? 58 : 34,
    parseStatus,
    warnings,
    chunks: analysis?.chunks,
  });
}

function researchToDocument(item: ResearchItem, index: number): SourceDocument {
  const hasUrl = Boolean(cleanText(item.url));
  const isFixture = /golden|fixture|test/i.test(cleanText(`${item.title} ${item.sourceName} ${item.source} ${item.url}`));
  const isFallback = item.status === "fallback" || item.sourceType === "local" || !hasUrl;
  const providerTier = item.providerTier || (/(^|:)bing_html$|^bing$/i.test(cleanText(item.sourceName || item.source)) ? "experimental_fallback" : isFallback ? "local_or_user" : "official_provider");
  return makeDocument({
    sourceId: item.id || safeId("search-source", index),
    sourceType: isFixture ? "test_fixture" : isFallback ? "system_fallback" : "search_result",
    fileType: "html",
    title: item.title,
    url: isFallback || isFixture ? "" : item.url,
    provider: item.sourceName || item.source || "public-search",
    providerTier,
    rawText: normalizedJoined([item.title, item.sourceName || item.source, item.summary, item.url]),
    confidence: providerTier === "experimental_fallback"
      ? Math.min(58, item.confidence || 54)
      : isFixture ? Math.min(44, item.confidence || 42) : isFallback ? Math.min(45, item.confidence || 42) : hasUrl ? Math.max(62, item.confidence || 68) : item.confidence || 56,
    parseStatus: item.summary || hasUrl ? "partial" : "failed",
    warnings: [
      providerTier === "experimental_fallback" ? "experimental_search_fallback" : "",
      providerTier === "experimental_fallback" ? "摘要类证据需复核原文。" : "",
      isFixture ? "该来源是本地测试夹具，不能视为真实公开检索结果。" : "",
      isFallback ? "该来源是兜底搜索入口，不能视为已验证外部事实。" : "",
      hasUrl ? "" : "搜索结果缺少 URL，追溯性较弱。"
    ].filter(Boolean)
  });
}

export function parseSourceDocuments(input: ParseInput): SourceDocument[] {
  const documents: SourceDocument[] = [];
  const prompt = cleanText(input.prompt);
  if (prompt) {
    documents.push(makeDocument({
      sourceId: "user-input-1",
      sourceType: "user_input",
      fileType: "txt",
      title: "用户原始需求",
      provider: "user",
      rawText: prompt,
      confidence: 58,
      parseStatus: "parsed",
      warnings: ["用户输入只能证明需求和偏好，不能证明外部事实。"]
    }));
  }

  const pastedText = cleanText(input.pastedText);
  if (pastedText && pastedText !== prompt) {
    documents.push(makeDocument({
      sourceId: "pasted-text-1",
      sourceType: "pasted_text",
      fileType: "txt",
      title: "用户粘贴资料",
      provider: "user",
      rawText: pastedText,
      confidence: 62,
      parseStatus: "parsed",
      warnings: ["粘贴文本需要用户确认来源和时效。"]
    }));
  }

  const uploadedCandidates = [
    ...(Array.isArray(input.uploadedAssets) ? input.uploadedAssets : []),
    ...(input.uploadedFile ? [input.uploadedFile] : [])
  ];
  const seenUploadIds = new Set<string>();
  uploadedCandidates.forEach((asset, index) => {
    const document = uploadedAssetToDocument(asset, index);
    if (document && !seenUploadIds.has(document.sourceId)) {
      seenUploadIds.add(document.sourceId);
      documents.push(document);
    }
  });

  (input.research || []).forEach((item, index) => {
    documents.push(researchToDocument(item, index));
  });

  return documents
    .filter((document) => document.title || document.normalizedText)
    .slice(0, 40);
}
