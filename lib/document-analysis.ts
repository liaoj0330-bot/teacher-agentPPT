export type DocumentBlockType = "title" | "heading" | "text" | "list" | "table" | "image" | "quote" | "code";

export type DocumentBlock = {
  id: string;
  page: number;
  type: DocumentBlockType;
  text: string;
  confidence: number;
  bbox?: [number, number, number, number];
  sourceRef?: string;
};

export type DocumentPage = {
  page: number;
  title: string;
  summary: string;
  blockCount: number;
  imageCount: number;
  tableCount: number;
  blocks: DocumentBlock[];
};

export type DocumentChunk = {
  id: string;
  text: string;
  page?: number;
  slide?: number;
  heading?: string;
};

export type DocumentAnalysis = {
  fileName: string;
  fileType: string;
  pageCount: number;
  blockCount: number;
  summary: string;
  outlineSuggestions: string[];
  pages: DocumentPage[];
  blocks: DocumentBlock[];
  sourceKind: "pdf" | "docx" | "pptx" | "text" | "image" | "unknown";
  parseStatus?: "parsed" | "partial" | "failed" | "unsupported";
  warnings?: string[];
  parser?: "officeparser" | "python" | "native";
  chunks?: DocumentChunk[];
  metadata?: Record<string, unknown>;
};

export type UploadedArtifact = {
  name: string;
  size: number;
  status: "uploading" | "uploaded" | "error";
  mimeType?: string;
  analysis?: DocumentAnalysis;
  assetId?: string;
  sha256?: string;
  storageStatus?: "persisted" | "temporary";
};

export function emptyAnalysis(fileName: string, fileType = "unknown"): DocumentAnalysis {
  return {
    fileName,
    fileType,
    pageCount: 0,
    blockCount: 0,
    summary: "未解析到可用内容。",
    outlineSuggestions: [],
    pages: [],
    blocks: [],
    sourceKind: "unknown"
  };
}

export function compactAnalysisForPrompt(analysis: DocumentAnalysis | undefined, maxPages = 8, maxBlocksPerPage = 7) {
  if (!analysis) {
    return null;
  }

  return {
    fileName: analysis.fileName,
    fileType: analysis.fileType,
    pageCount: analysis.pageCount,
    blockCount: analysis.blockCount,
    summary: analysis.summary,
    outlineSuggestions: analysis.outlineSuggestions.slice(0, 10),
    parser: analysis.parser,
    chunks: (analysis.chunks || []).slice(0, 60),
    metadata: analysis.metadata,
    pages: analysis.pages.slice(0, maxPages).map((page) => ({
      page: page.page,
      title: page.title,
      summary: page.summary,
      blockCount: page.blockCount,
      imageCount: page.imageCount,
      tableCount: page.tableCount,
      blocks: page.blocks.slice(0, maxBlocksPerPage).map((block) => ({
        id: block.id,
        type: block.type,
        text: block.text,
        confidence: block.confidence
      }))
    })),
    blocks: analysis.blocks.slice(0, maxPages * maxBlocksPerPage).map((block) => ({
      id: block.id,
      page: block.page,
      type: block.type,
      text: block.text,
      confidence: block.confidence
    }))
  };
}
