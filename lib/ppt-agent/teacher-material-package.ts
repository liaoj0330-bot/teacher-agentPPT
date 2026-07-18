import { resolveTextbookCatalog, type TextbookCatalogResolution } from "./textbook-catalog.ts";

export const teacherMaterialPackageSchema = "teacher-material-package/v1" as const;

export type TeacherMaterialRole =
  | "textbook"
  | "teacher_guide"
  | "lesson_plan"
  | "exercise"
  | "assessment"
  | "existing_deck"
  | "reference_image"
  | "other";

export type TeacherMaterialFileType =
  | "pdf"
  | "docx"
  | "pptx"
  | "txt"
  | "md"
  | "image"
  | "unknown";

export type TeacherMaterialParseStatus = "parsed" | "partial" | "failed" | "unsupported";

export type TextbookLocator = {
  displayName: string;
  schoolStage?: string;
  grade?: string;
  subject?: string;
  publisher?: string;
  editionYear?: string;
  volume?: string;
  isbn?: string;
};

export type ChapterLocator = {
  unit?: string;
  chapter?: string;
  lesson?: string;
  pageStart?: number;
  pageEnd?: number;
};

export type TeacherMaterialItem = {
  materialId: string;
  assetId?: string;
  sha256?: string;
  name: string;
  fileType: TeacherMaterialFileType;
  role: TeacherMaterialRole;
  roleSource: "teacher" | "metadata" | "inferred";
  parseStatus: TeacherMaterialParseStatus;
  usableForPlanning: boolean;
  usableForCitation: boolean;
  pageCount?: number;
  blockCount?: number;
  warnings: string[];
};

export type TextbookMatchStatus =
  | "catalog_verified"
  | "asset_verified"
  | "teacher_confirmed"
  | "ambiguous"
  | "unmatched";

export type TextbookMatch = {
  status: TextbookMatchStatus;
  confidence: number;
  matchedMaterialId?: string;
  matchedFields: string[];
  missingFields: string[];
  conflicts: string[];
  requiresTeacherConfirmation: boolean;
  catalogResolution?: TextbookCatalogResolution;
};

export type TeacherMaterialPackageReadiness = {
  status: "ready" | "needs_confirmation" | "blocked";
  canPlan: boolean;
  canCite: boolean;
  canOptimizeExisting: boolean;
  hasMultipleSources: boolean;
  blockingIssues: string[];
  warnings: string[];
};

export type TeacherMaterialPackage = {
  schemaVersion: typeof teacherMaterialPackageSchema;
  packageId: string;
  textbook: TextbookLocator;
  chapter: ChapterLocator;
  sourcePolicy: "uploaded_only" | "trusted_catalog" | "web_supplement";
  items: TeacherMaterialItem[];
  textbookMatch: TextbookMatch;
  readiness: TeacherMaterialPackageReadiness;
};

type MaterialPackageTask = {
  generationMode?: "chapter_prep" | "lesson_plan" | "optimize_existing";
  schoolStage?: unknown;
  grade?: unknown;
  subject?: unknown;
  textbook?: unknown;
  chapter?: unknown;
  pastedMaterials?: unknown;
  sourcePolicy?: unknown;
  textbookIdentity?: Record<string, unknown>;
  chapterIdentity?: Record<string, unknown>;
  uploadedFiles?: unknown[];
};

type MaterialPackageInput = {
  task: MaterialPackageTask;
  uploadedFiles?: unknown[];
  packageId?: string;
};

const materialRoles: TeacherMaterialRole[] = [
  "textbook",
  "teacher_guide",
  "lesson_plan",
  "exercise",
  "assessment",
  "existing_deck",
  "reference_image",
  "other",
];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function canonical(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]【】._-]/g, "")
    .replace(/人民教育出版社|人教版|部编版|统编版/g, "pe")
    .replace(/北京师范大学出版社|北师大版/g, "bnu")
    .replace(/江苏凤凰教育出版社|苏教版/g, "js")
    .replace(/外语教学与研究出版社|外研版/g, "fltrp")
    .replace(/山东教育出版社|鲁教版/g, "sde");
}

function fileTypeFor(name: string, mimeType: string): TeacherMaterialFileType {
  const lower = `${name} ${mimeType}`.toLowerCase();
  if (/\.pdf\b|application\/pdf/.test(lower)) return "pdf";
  if (/\.docx?\b|wordprocessingml|msword/.test(lower)) return "docx";
  if (/\.pptx?\b|presentationml|powerpoint/.test(lower)) return "pptx";
  if (/\.md\b|markdown/.test(lower)) return "md";
  if (/\.txt\b|text\/plain/.test(lower)) return "txt";
  if (/\.(png|jpe?g|webp|gif|bmp)\b|image\//.test(lower)) return "image";
  return "unknown";
}

function explicitRole(record: Record<string, unknown>) {
  const role = text(record.materialRole || record.documentRole || record.role) as TeacherMaterialRole;
  return materialRoles.includes(role) ? role : undefined;
}

function inferRole(name: string, fileType: TeacherMaterialFileType): TeacherMaterialRole {
  const lower = name.toLowerCase();
  if (/教师(?:教学)?用书|教学参考|教参|教师指导用书|teacher.?guide/.test(lower)) return "teacher_guide";
  if (/教案|教学设计|导学案|课时学案|lesson.?plan/.test(lower)) return "lesson_plan";
  if (/练习册|同步(?:练习|训练)|课时作业|课后练习|作业|习题|exercise|workbook/.test(lower)) return "exercise";
  if (/试卷|测试卷|单元检测|期[中末](?:检测|考试)?|测验|考试|assessment|quiz|exam/.test(lower)) return "assessment";
  if (/教材|课本|教科书|textbook/.test(lower)) return "textbook";
  if (/(?:人教|部编|统编|北师大|苏教|外研|译林|鲁教|沪教|湘教|浙教|教科|粤教|华师大)版/.test(lower)
    && /(?:[一二三四五六七八九]年级|高[一二三]|必修|选择性必修|上册|下册)/.test(lower)) return "textbook";
  if (fileType === "pptx") return "existing_deck";
  if (fileType === "image") return "reference_image";
  return "other";
}

function parseStatusFor(record: Record<string, unknown>, fileType: TeacherMaterialFileType): TeacherMaterialParseStatus {
  if (record.status === "error") return "failed";
  const analysis = record.analysis && typeof record.analysis === "object"
    ? record.analysis as Record<string, unknown>
    : undefined;
  const reported = text(analysis?.parseStatus || record.parseStatus) as TeacherMaterialParseStatus;
  if (["parsed", "partial", "failed", "unsupported"].includes(reported)) return reported;
  if (numberValue(analysis?.blockCount) || text(record.text || record.rawText || record.content)) return "parsed";
  if (fileType === "unknown") return "unsupported";
  return "partial";
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizeMaterial(value: unknown, index: number): TeacherMaterialItem | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const analysis = record.analysis && typeof record.analysis === "object"
    ? record.analysis as Record<string, unknown>
    : undefined;
  const name = text(record.name || record.fileName || analysis?.fileName) || `material-${index + 1}`;
  const fileType = fileTypeFor(name, text(record.mimeType || record.type || analysis?.fileType));
  const declaredRole = explicitRole(record);
  const recordMetadataRole = !declaredRole && record.metadata && typeof record.metadata === "object"
    ? explicitRole(record.metadata as Record<string, unknown>)
    : undefined;
  const analysisMetadataRole = !declaredRole && !recordMetadataRole && analysis?.metadata && typeof analysis.metadata === "object"
    ? explicitRole(analysis.metadata as Record<string, unknown>)
    : undefined;
  const metadataRole = recordMetadataRole || analysisMetadataRole;
  const role = declaredRole || metadataRole || inferRole(name, fileType);
  const parseStatus = parseStatusFor(record, fileType);
  const blockCount = numberValue(analysis?.blockCount);
  const directTextAvailable = Boolean(text(record.text || record.rawText || record.content));
  const usableForPlanning = parseStatus === "parsed" && Boolean(blockCount || directTextAvailable);
  const warnings = Array.isArray(analysis?.warnings)
    ? analysis.warnings.map(text).filter(Boolean)
    : [];
  if (parseStatus === "partial") warnings.push("material_parse_partial");
  if (fileType === "image" && !usableForPlanning) warnings.push("image_ocr_required");
  if (parseStatus === "failed" || parseStatus === "unsupported") warnings.push("material_not_usable");
  const assetId = text(record.assetId);
  const sha256 = text(record.sha256);
  return {
    materialId: assetId || (sha256 ? `sha-${sha256.slice(0, 16)}` : `material-${stableHash(`${name}:${record.size || 0}`)}`),
    assetId: assetId || undefined,
    sha256: sha256 || undefined,
    name,
    fileType,
    role,
    roleSource: declaredRole ? "teacher" : metadataRole ? "metadata" : "inferred",
    parseStatus,
    usableForPlanning,
    usableForCitation: usableForPlanning && Boolean(assetId || sha256),
    pageCount: numberValue(analysis?.pageCount),
    blockCount,
    warnings: [...new Set(warnings)],
  };
}

function uniqueMaterials(values: unknown[]) {
  const seen = new Set<string>();
  return values
    .map(normalizeMaterial)
    .filter((item): item is TeacherMaterialItem => Boolean(item))
    .filter((item) => {
      const key = item.assetId || item.sha256 || `${canonical(item.name)}:${item.fileType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function textbookLocator(task: MaterialPackageTask, catalogResolution: TextbookCatalogResolution): TextbookLocator {
  const identity = task.textbookIdentity || {};
  return {
    displayName: catalogResolution.normalized.displayName || text(identity.displayName || task.textbook),
    schoolStage: catalogResolution.normalized.schoolStage || text(task.schoolStage) || undefined,
    grade: catalogResolution.normalized.grade || text(task.grade) || undefined,
    subject: catalogResolution.normalized.subject || text(task.subject) || undefined,
    publisher: catalogResolution.normalized.publisher || text(identity.publisher) || undefined,
    editionYear: catalogResolution.normalized.editionYear || text(identity.editionYear) || undefined,
    volume: catalogResolution.normalized.volume || text(identity.volume) || undefined,
    isbn: text(identity.isbn) || undefined,
  };
}

function chapterLocator(task: MaterialPackageTask): ChapterLocator {
  const identity = task.chapterIdentity || {};
  return {
    unit: text(identity.unit) || undefined,
    chapter: text(identity.chapter || task.chapter) || undefined,
    lesson: text(identity.lesson) || undefined,
    pageStart: numberValue(identity.pageStart),
    pageEnd: numberValue(identity.pageEnd),
  };
}

function materialEvidence(material: TeacherMaterialItem, original: unknown) {
  const record = original && typeof original === "object" ? original as Record<string, unknown> : {};
  const analysis = record.analysis && typeof record.analysis === "object" ? record.analysis as Record<string, unknown> : {};
  const metadata = analysis.metadata && typeof analysis.metadata === "object" ? analysis.metadata as Record<string, unknown> : {};
  return canonical([
    analysis.summary,
    metadata.title,
    metadata.publisher,
    metadata.editionYear,
    metadata.volume,
    metadata.isbn,
  ].map(text).filter(Boolean).join(" "));
}

function matchTextbook(task: MaterialPackageTask, locator: TextbookLocator, items: TeacherMaterialItem[], originals: unknown[], catalogResolution: TextbookCatalogResolution): TextbookMatch {
  const identity = task.textbookIdentity || {};
  const verificationStatus = text(identity.verificationStatus);
  const requestedAssetId = text(identity.sourceAssetId);
  const textbookItems = items.filter((item) => item.role === "textbook");
  const matchedByAsset = requestedAssetId
    ? textbookItems.find((item) => item.assetId === requestedAssetId)
    : undefined;
  if (requestedAssetId && !matchedByAsset) {
    return {
      status: "unmatched",
      confidence: 20,
      matchedFields: [],
      missingFields: ["verified_textbook_source"],
      conflicts: ["source_asset_is_not_a_textbook"],
      requiresTeacherConfirmation: true,
      catalogResolution,
    };
  }
  if (verificationStatus === "catalog_verified") {
    if (catalogResolution.status === "exact") {
      return { status: "catalog_verified", confidence: 98, matchedFields: ["catalog", ...catalogResolution.matchedFields], missingFields: [], conflicts: [], requiresTeacherConfirmation: false, catalogResolution };
    }
    return {
      status: "ambiguous",
      confidence: catalogResolution.confidence,
      matchedFields: catalogResolution.matchedFields,
      missingFields: catalogResolution.missingFields,
      conflicts: [...catalogResolution.conflicts, "invalid_catalog_verification"],
      requiresTeacherConfirmation: true,
      catalogResolution,
    };
  }
  if (matchedByAsset) {
    return { status: "asset_verified", confidence: 95, matchedMaterialId: matchedByAsset.materialId, matchedFields: ["sourceAssetId"], missingFields: [], conflicts: [], requiresTeacherConfirmation: false, catalogResolution };
  }
  const fields = ["displayName", "publisher", "editionYear", "volume", "isbn"] as const;
  let best: { item: TeacherMaterialItem; fields: string[]; score: number } | undefined;
  for (const item of textbookItems) {
    const original = originals.find((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      const record = candidate as Record<string, unknown>;
      return text(record.assetId) === item.assetId || text(record.sha256) === item.sha256 || text(record.name || record.fileName) === item.name;
    });
    const evidence = materialEvidence(item, original);
    const matchedFields = fields.filter((field) => {
      const requested = canonical(locator[field]);
      return Boolean(requested && evidence.includes(requested));
    });
    const score = matchedFields.reduce((total, field) => total + (field === "isbn" ? 35 : field === "displayName" ? 30 : 12), 0);
    if (!best || score > best.score) best = { item, fields: matchedFields, score };
  }
  if (best && best.score >= 30) {
    return {
      status: best.score >= 54 ? "asset_verified" : "ambiguous",
      confidence: Math.min(92, 46 + best.score),
      matchedMaterialId: best.item.materialId,
      matchedFields: best.fields,
      missingFields: fields.filter((field) => Boolean(locator[field]) && !best?.fields.includes(field)),
      conflicts: [],
      requiresTeacherConfirmation: best.score < 54,
      catalogResolution,
    };
  }
  if (verificationStatus === "teacher_confirmed" && locator.displayName && (task.chapter || task.chapterIdentity?.chapter)) {
    return {
      status: "teacher_confirmed",
      confidence: 72,
      matchedFields: ["teacher_confirmation"],
      missingFields: textbookItems.length ? ["asset_identity"] : ["textbook_asset"],
      conflicts: requestedAssetId && !matchedByAsset ? ["source_asset_is_not_a_textbook"] : [],
      requiresTeacherConfirmation: false,
      catalogResolution,
    };
  }
  if (catalogResolution.status === "exact") {
    if (textbookItems.length > 0) {
      return {
        status: "ambiguous",
        confidence: 64,
        matchedFields: catalogResolution.matchedFields,
        missingFields: ["source_asset_identity"],
        conflicts: ["source_asset_identity_required"],
        requiresTeacherConfirmation: true,
        catalogResolution,
      };
    }
    return {
      status: "catalog_verified",
      confidence: 96,
      matchedFields: ["catalog", ...catalogResolution.matchedFields],
      missingFields: [],
      conflicts: [],
      requiresTeacherConfirmation: false,
      catalogResolution,
    };
  }
  if (catalogResolution.status === "ambiguous") {
    return {
      status: "ambiguous",
      confidence: catalogResolution.confidence,
      matchedFields: catalogResolution.matchedFields,
      missingFields: catalogResolution.missingFields,
      conflicts: catalogResolution.conflicts,
      requiresTeacherConfirmation: true,
      catalogResolution,
    };
  }
  return {
    status: textbookItems.length ? "ambiguous" : "unmatched",
    confidence: textbookItems.length ? 42 : 20,
    matchedFields: [],
    missingFields: [!locator.displayName ? "displayName" : "verified_textbook_source"],
    conflicts: requestedAssetId && !matchedByAsset ? ["source_asset_is_not_a_textbook"] : [],
    requiresTeacherConfirmation: true,
    catalogResolution,
  };
}

function readinessFor(task: MaterialPackageTask, items: TeacherMaterialItem[], match: TextbookMatch, locator: TextbookLocator, chapter: ChapterLocator): TeacherMaterialPackageReadiness {
  const mode = task.generationMode || "chapter_prep";
  const sourcePolicy = text(task.sourcePolicy) || "web_supplement";
  const usable = items.filter((item) => item.usableForPlanning);
  const hasUsableTextbook = items.some((item) => item.role === "textbook" && item.usableForCitation);
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  if (items.some((item) => item.parseStatus === "failed" || item.parseStatus === "unsupported")) warnings.push("some_materials_unusable");
  if (items.some((item) => item.parseStatus === "partial")) warnings.push("some_materials_partially_parsed");
  if (items.length > 0 && usable.length === 0) blockingIssues.push("no_parseable_material");
  if (sourcePolicy === "uploaded_only" && usable.length === 0) blockingIssues.push("uploaded_source_required_by_policy");
  if (sourcePolicy === "trusted_catalog" && match.status !== "catalog_verified") blockingIssues.push("trusted_catalog_match_required");
  if (sourcePolicy === "trusted_catalog" && !hasUsableTextbook) blockingIssues.push("trusted_catalog_source_text_required");

  if (mode === "optimize_existing" && !usable.some((item) => item.role === "existing_deck" && item.fileType === "pptx")) {
    blockingIssues.push("parsed_existing_ppt_required");
  }
  if (mode === "lesson_plan" && usable.length === 0 && !text(task.pastedMaterials)) {
    blockingIssues.push("lesson_material_required");
  }
  if (mode === "chapter_prep") {
    if (!locator.displayName) blockingIssues.push("textbook_identity_required");
    if (!chapter.chapter && !chapter.unit && !chapter.lesson) blockingIssues.push("chapter_identity_required");
    if (match.requiresTeacherConfirmation && match.status !== "teacher_confirmed" && !hasUsableTextbook) {
      blockingIssues.push("textbook_match_confirmation_required");
    }
    if (match.status === "unmatched") warnings.push("textbook_not_verified");
    if (match.status === "ambiguous") warnings.push("textbook_match_ambiguous");
    if (!hasUsableTextbook) {
      warnings.push("no_citable_textbook_source");
    }
  }

  const canPlan = blockingIssues.length === 0;
  const canCite = items.some((item) => item.usableForCitation);
  const needsConfirmation = match.requiresTeacherConfirmation || warnings.includes("textbook_match_ambiguous") || warnings.includes("no_citable_textbook_source");
  return {
    status: !canPlan ? "blocked" : needsConfirmation ? "needs_confirmation" : "ready",
    canPlan,
    canCite,
    canOptimizeExisting: usable.some((item) => item.role === "existing_deck" && item.fileType === "pptx"),
    hasMultipleSources: usable.length > 1,
    blockingIssues: [...new Set(blockingIssues)],
    warnings: [...new Set(warnings)],
  };
}

export function buildTeacherMaterialPackage(input: MaterialPackageInput): TeacherMaterialPackage {
  const originals = [
    ...(Array.isArray(input.task.uploadedFiles) ? input.task.uploadedFiles : []),
    ...(Array.isArray(input.uploadedFiles) ? input.uploadedFiles : []),
  ];
  const items = uniqueMaterials(originals);
  const identity = input.task.textbookIdentity || {};
  const catalogResolution = resolveTextbookCatalog({
    displayName: identity.displayName || input.task.textbook,
    schoolStage: input.task.schoolStage,
    grade: input.task.grade,
    subject: input.task.subject,
    publisher: identity.publisher,
    editionYear: identity.editionYear,
    volume: identity.volume,
  });
  const textbook = textbookLocator(input.task, catalogResolution);
  const chapter = chapterLocator(input.task);
  const textbookMatch = matchTextbook(input.task, textbook, items, originals, catalogResolution);
  const sourcePolicy = ["uploaded_only", "trusted_catalog", "web_supplement"].includes(text(input.task.sourcePolicy))
    ? text(input.task.sourcePolicy) as TeacherMaterialPackage["sourcePolicy"]
    : "web_supplement";
  const packageId = input.packageId || `materials-${stableHash([textbook.displayName, chapter.chapter, ...items.map((item) => item.materialId)].join("|"))}`;
  return {
    schemaVersion: teacherMaterialPackageSchema,
    packageId,
    textbook,
    chapter,
    sourcePolicy,
    items,
    textbookMatch,
    readiness: readinessFor(input.task, items, textbookMatch, textbook, chapter),
  };
}
