import type { CanvasProject } from "@/lib/canvas-data";
import type { SourceDocumentType } from "@/lib/ppt-agent/evidence-types";

export type EvidenceAuthenticityStatus = "verified" | "traceable" | "partial" | "needs_sources" | "unverified";

export type EvidenceTone = "good" | "warn" | "risk" | "neutral";

export type EvidenceAuthenticitySummary = {
  status: EvidenceAuthenticityStatus;
  tone: EvidenceTone;
  label: string;
  headline: string;
  score: number;
  totalSources: number;
  totalEvidenceBlocks: number;
  publicSearchSources: number;
  parsedUploadSources: number;
  pastedTextSources: number;
  userInputSources: number;
  fallbackSources: number;
  fixtureSources: number;
  verifiedOrTraceableSources: number;
  userInputOnlySlides: number;
  providerUnconfigured: boolean;
  fallbackUsed: boolean;
  hasRealSources: boolean;
  hasOnlyWeakSources: boolean;
  badges: Array<{ label: string; count: number; tone: EvidenceTone }>;
  blockers: string[];
  warnings: string[];
  suggestedFixes: string[];
};

const sourceTypes: SourceDocumentType[] = ["uploaded_file", "pasted_text", "search_result", "test_fixture", "system_fallback", "user_input"];

function emptyCounts(): Record<SourceDocumentType, number> {
  return sourceTypes.reduce(
    (acc, type) => {
      acc[type] = 0;
      return acc;
    },
    {} as Record<SourceDocumentType, number>
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniq(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export function summarizeEvidenceAuthenticity(project: CanvasProject): EvidenceAuthenticitySummary {
  const report = project.evidenceReport;
  const acquisition = project.acquisitionReport;
  const documents = project.sourceDocuments || [];
  const bySourceType = { ...emptyCounts(), ...(report?.sourceSummary.bySourceType || {}) };

  if (!report) {
    documents.forEach((source) => {
      bySourceType[source.sourceType] = (bySourceType[source.sourceType] || 0) + 1;
    });
  }

  const publicSearchSources = documents.filter((source) => source.sourceType === "search_result" && Boolean(source.url)).length || bySourceType.search_result || 0;
  const parsedUploadSources = documents.filter((source) => source.sourceType === "uploaded_file" && source.parseStatus === "parsed").length || acquisition?.uploadedParsedCount || 0;
  const pastedTextSources = bySourceType.pasted_text || 0;
  const userInputSources = bySourceType.user_input || 0;
  const fallbackSources = (bySourceType.system_fallback || 0) + documents.filter((source) => source.sourceType === "system_fallback").length * 0;
  const fixtureSources = bySourceType.test_fixture || 0;
  const verifiedOrTraceableSources = report?.sourceSummary.verifiedOrTraceableSources || publicSearchSources + parsedUploadSources;
  const totalSources = report?.sourceSummary.totalSources || documents.length;
  const totalEvidenceBlocks = report?.sourceSummary.totalEvidenceBlocks || project.evidenceBlocks?.length || 0;
  const userInputOnlySlides = report?.sourceSummary.userInputOnlySlides || 0;
  const providerUnconfigured = Boolean(
    acquisition?.searchEnabled &&
      (acquisition.searchStatus === "provider_unconfigured" ||
        acquisition.warnings.some((warning) => /provider|API Key|未配置|真实搜索/.test(warning)) ||
        acquisition.searchQueries.some((query) => query.status === "provider_unconfigured"))
  );
  const fallbackUsed = Boolean(acquisition?.fallbackUsed || fallbackSources || fixtureSources);
  const hasRealSources = publicSearchSources + parsedUploadSources > 0;
  const hasOnlyWeakSources = totalSources > 0 && !hasRealSources;

  const sourceScore = hasRealSources ? Math.min(70, 35 + (publicSearchSources + parsedUploadSources) * 12) : 12;
  const coverageScore = report ? Math.min(20, report.averageCoverage * 0.2) : totalEvidenceBlocks ? 10 : 0;
  const penalty = (fallbackUsed ? 12 : 0) + (providerUnconfigured ? 10 : 0) + Math.min(14, userInputOnlySlides * 4);
  const score = clamp(sourceScore + coverageScore - penalty);

  const status: EvidenceAuthenticityStatus = hasRealSources && !report?.blockingIssues.length && score >= 82
    ? "verified"
    : hasRealSources && score >= 66
      ? "traceable"
      : hasRealSources
        ? "partial"
        : providerUnconfigured || totalSources === 0
          ? "needs_sources"
          : "unverified";

  const tone: EvidenceTone = status === "verified" || status === "traceable" ? "good" : status === "partial" ? "warn" : "risk";
  const label =
    status === "verified"
      ? "真实来源充分"
      : status === "traceable"
        ? "来源可追溯"
        : status === "partial"
          ? "来源不完整"
          : status === "needs_sources"
            ? "需要补真实来源"
            : "来源未验证";
  const headline =
    status === "verified"
      ? "这份稿件已有可追溯来源，适合进入导出复核。"
      : status === "traceable"
        ? "已有真实来源，但仍建议补齐低置信页面。"
        : status === "partial"
          ? "部分页面有真实来源，正式交付前还要补证据。"
          : providerUnconfigured
            ? "真实搜索未配置，当前不能把生成内容当作已核验事实。"
            : "当前主要依赖用户输入、兜底或测试资料，需要上传文件或接入公开搜索。";

  const blockers = uniq([...(report?.blockingIssues || []), providerUnconfigured ? "真实搜索 provider 未配置或未返回可追溯 URL。" : "", hasOnlyWeakSources ? "当前来源主要来自用户输入、兜底或测试夹具，不能作为市场交付依据。" : ""]);
  const warnings = uniq([...(report?.warnings || []), ...(acquisition?.warnings || []), userInputOnlySlides ? `${userInputOnlySlides} 页主要依赖用户输入或低置信来源。` : ""]);
  const suggestedFixes = uniq([
    ...(report?.suggestedFixes || []),
    providerUnconfigured ? "配置真实搜索 provider/API Key，或上传 PDF/Word/PPT/TXT 作为可解析资料。" : "",
    hasRealSources ? "把真实来源映射到低置信页面，并在页面备注保留来源口径。" : "先补公开 URL 或上传资料，再重新生成/重新评分。"
  ]);

  return {
    status,
    tone,
    label,
    headline,
    score,
    totalSources,
    totalEvidenceBlocks,
    publicSearchSources,
    parsedUploadSources,
    pastedTextSources,
    userInputSources,
    fallbackSources,
    fixtureSources,
    verifiedOrTraceableSources,
    userInputOnlySlides,
    providerUnconfigured,
    fallbackUsed,
    hasRealSources,
    hasOnlyWeakSources,
    badges: [
      { label: "公开来源", count: publicSearchSources, tone: publicSearchSources ? "good" : "neutral" },
      { label: "已解析上传", count: parsedUploadSources, tone: parsedUploadSources ? "good" : "neutral" },
      { label: "粘贴文本", count: pastedTextSources, tone: pastedTextSources ? "warn" : "neutral" },
      { label: "用户输入", count: userInputSources, tone: userInputSources ? "warn" : "neutral" },
      { label: "兜底/测试", count: fallbackSources + fixtureSources, tone: fallbackSources + fixtureSources ? "risk" : "neutral" }
    ],
    blockers,
    warnings,
    suggestedFixes
  };
}

export function summarizeSlideEvidence(project: CanvasProject, slideId?: string, page?: number) {
  const map = project.slideEvidenceMaps?.find((item) => item.slideId === slideId || item.pagePlanId === slideId);
  const fallbackMap = !map && typeof page === "number" ? project.slideEvidenceMaps?.[page - 1] : map;
  if (!fallbackMap) return null;
  const weak = fallbackMap.evidenceCoverage < 55 || fallbackMap.sourceConfidence < 58 || fallbackMap.lowConfidenceWarnings.length > 0;
  return {
    role: fallbackMap.role,
    coverage: fallbackMap.evidenceCoverage,
    confidence: fallbackMap.sourceConfidence,
    weak,
    unsupportedClaims: fallbackMap.unsupportedClaims,
    warnings: fallbackMap.lowConfidenceWarnings,
    confirmationNeeded: fallbackMap.userConfirmationNeeded
  };
}
