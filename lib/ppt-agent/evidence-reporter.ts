import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import type { DeckEvidenceReport, EvidenceBlock, EvidenceBlockType, SlideEvidenceMap, SourceDocument, SourceDocumentType } from "@/lib/ppt-agent/evidence-types";
import { evidenceCriticalPptTypes } from "@/lib/ppt-agent/evidence-types";

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

function increment<K extends string>(record: Record<K, number>, key: K) {
  record[key] = (record[key] || 0) + 1;
}

export function buildDeckEvidenceReport(input: {
  contentPlan: ContentPlan;
  sourceDocuments: SourceDocument[];
  evidenceBlocks: EvidenceBlock[];
  slideEvidenceMaps: SlideEvidenceMap[];
}): DeckEvidenceReport {
  const maps = input.slideEvidenceMaps;
  const lowConfidenceSlides = maps
    .filter((map) => map.evidenceCoverage < 50 || map.sourceConfidence < 55 || map.lowConfidenceWarnings.length > 0)
    .map((map) => ({
      slideId: map.slideId,
      pagePlanId: map.pagePlanId,
      role: map.role,
      evidenceCoverage: map.evidenceCoverage,
      sourceConfidence: map.sourceConfidence
    }));
  const unsupportedClaims = maps
    .filter((map) => map.unsupportedClaims.length > 0)
    .map((map) => ({
      slideId: map.slideId,
      pagePlanId: map.pagePlanId,
      role: map.role,
      claims: map.unsupportedClaims
    }));
  const bySourceType = {} as Record<SourceDocumentType, number>;
  input.sourceDocuments.forEach((source) => increment(bySourceType, source.sourceType));
  const byBlockType = {} as Record<EvidenceBlockType, number>;
  input.evidenceBlocks.forEach((block) => increment(byBlockType, block.blockType));
  const critical = evidenceCriticalPptTypes.includes(input.contentPlan.pptType);
  const averageCoverage = average(maps.map((map) => map.evidenceCoverage));
  const externalSourceCount = input.sourceDocuments.filter((source) => source.sourceType === "uploaded_file" || source.sourceType === "search_result").length;
  const truePublicSourceCount = input.sourceDocuments.filter((source) => source.sourceType === "search_result" && Boolean(source.url) && source.providerTier !== "experimental_fallback" && source.provider !== "bing_html" && source.provider !== "bing").length;
  const experimentalSearchCount = input.sourceDocuments.filter((source) => source.sourceType === "search_result" && Boolean(source.url) && (source.providerTier === "experimental_fallback" || source.provider === "bing_html" || source.provider === "bing")).length;
  const uploadedParsedCount = input.sourceDocuments.filter((source) => source.sourceType === "uploaded_file" && source.parseStatus === "parsed").length;
  const blockingIssues = [
    critical && externalSourceCount === 0 && averageCoverage < 40 ? "关键 PPT 类型缺少上传资料或可追溯搜索来源，且整体证据覆盖不足。" : "",
    critical && truePublicSourceCount === 0 && uploadedParsedCount === 0 ? "关键 PPT 类型没有真实公开来源或已解析上传资料，不能把需求文本当作事实依据。" : "",
    critical && averageCoverage < 35 ? "关键 PPT 类型整体证据覆盖低于 35%。" : "",
    critical && unsupportedClaims.length >= Math.max(2, Math.ceil(maps.length * 0.25)) ? "多页存在未支撑核心主张。" : "",
    critical && lowConfidenceSlides.length >= Math.max(3, Math.ceil(maps.length * 0.35)) ? "多页来源置信度偏低。" : ""
  ].filter(Boolean);

  const warnings = [
    experimentalSearchCount > 0 ? "当前包含 bing_html experimental fallback 来源；摘要类证据需要复核原文，建议配置 Tavily / Serper / Brave。" : "",
    averageCoverage < 60 ? "证据覆盖还不稳定，建议继续补充资料或搜索结果。" : "",
    input.sourceDocuments.some((source) => source.sourceType === "system_fallback") ? "存在兜底来源，不能视为已验证事实。" : "",
    input.sourceDocuments.some((source) => source.sourceType === "test_fixture") ? "存在本地测试夹具，只能用于验收链路，不能视为真实公开来源。" : "",
    input.sourceDocuments.some((source) => source.parseStatus === "partial") ? "部分上传资料仅完成部分解析。" : "",
    unsupportedClaims.length ? "存在未支撑主张，Review Center 会给出扣分和修复建议。" : ""
  ].filter(Boolean);

  const suggestedFixes = [
    externalSourceCount === 0 ? "上传 PDF / Word / PPT / TXT 或执行公开检索，补齐外部来源。" : "",
    unsupportedClaims.length ? `优先补齐 ${unsupportedClaims.slice(0, 3).map((item) => item.role).join("、")} 的证据。` : "",
    lowConfidenceSlides.length ? "将低置信度页的确定性表述改为“建议 / 待确认 / 需要补充来源”。" : "",
    "导出前保留 DeckSpec / SlideSpec 证据追踪字段，但不要把内部 ID 写入可见 PPT 文案。"
  ].filter(Boolean);

  return {
    totalSlides: maps.length,
    slidesWithEvidence: maps.filter((map) => map.matchedEvidenceBlocks.length > 0).length,
    averageCoverage,
    lowConfidenceSlides,
    unsupportedClaims,
    sourceSummary: {
      totalSources: input.sourceDocuments.length,
      totalEvidenceBlocks: input.evidenceBlocks.length,
      bySourceType,
      byBlockType,
      verifiedOrTraceableSources: input.sourceDocuments.filter((source) => source.sourceType === "uploaded_file" && source.parseStatus === "parsed" || source.sourceType === "search_result" && Boolean(source.url) && source.providerTier !== "experimental_fallback" && source.provider !== "bing_html" && source.provider !== "bing").length,
      userInputOnlySlides: maps.filter((map) => map.matchedEvidenceBlocks.length > 0 && map.sourceConfidence < 55).length
    },
    blockingIssues,
    warnings,
    suggestedFixes
  };
}
