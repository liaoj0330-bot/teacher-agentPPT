import type { ResearchItem, SearchGroup, SearchResult, SourceType } from "@/lib/canvas-data";
import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import { buildEvidenceNeeds } from "@/lib/ppt-agent/evidence-need-builder";
import type { EvidenceNeed, SourceDocument } from "@/lib/ppt-agent/evidence-types";
import { parseSourceDocuments } from "@/lib/ppt-agent/source-document-parser";
import { publicSearchConfig, type PublicSearchResponse, type PublicSearchStatus } from "@/lib/ppt-agent/public-search-provider";
import { createSearchQueryPlan, type SearchQueryPlan } from "@/lib/ppt-agent/search-query-planner";
import { runPublicSearch } from "@/lib/ppt-agent/search-providers/provider-registry";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import { cleanText } from "@/lib/text-sanitize";

export type AcquisitionReport = {
  usedSources: Array<{ sourceId: string; title: string; sourceType: string; url?: string; confidence: number; parseStatus: string; provider?: string; providerTier?: string }>;
  searchEnabled: boolean;
  searchProvider: string;
  searchProviderTier?: "official_provider" | "experimental_fallback" | "none";
  searchStatus: PublicSearchStatus | "disabled";
  searchQueries: Array<{ query: string; status: PublicSearchStatus | "disabled"; provider: string; providerTier?: string; resultCount: number; reason?: string }>;
  uploadedParsedCount: number;
  uploadedFailedCount: number;
  pastedTextUsed: boolean;
  fallbackUsed: boolean;
  warnings: string[];
  errors: string[];
  queryPlan?: SearchQueryPlan;
};

type SourceAcquisitionInput = {
  prompt: string;
  uploadedAssets?: unknown[];
  uploadedFile?: unknown;
  searchMaterials?: unknown;
  researchSources?: unknown;
  contentPlan: ContentPlan;
  slidePagePlans: SlidePagePlan[];
  evidenceNeeds?: EvidenceNeed[];
  mode?: string;
  pastedText?: unknown;
  disablePublicSearch?: boolean;
};

function flattenGroups(value: unknown): SearchGroup[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[])
    .map((group): SearchGroup | null => {
      if (!group || typeof group !== "object") return null;
      const record = group as Record<string, unknown>;
      const query = cleanText(record.query);
      const provider = cleanText(record.provider, "external");
      const results = Array.isArray(record.results) ? record.results : [];
      return {
        query,
        provider,
        results: results
          .map((item): SearchResult | null => {
            if (!item || typeof item !== "object") return null;
            const result = item as Record<string, unknown>;
            const title = cleanText(result.title);
            const url = cleanText(result.url);
            const snippet = cleanText(result.snippet || result.summary || result.content);
            if (!title && !snippet) return null;
            return {
              title: title || url || "资料",
              url,
              snippet,
              confidence: Math.max(20, Math.min(96, Number(result.confidence) || 50)),
              sourceName: cleanText(result.sourceName || result.source || result.provider),
              sourceType: normalizeSourceType(cleanText(result.sourceType)),
              status: normalizeStatus(cleanText(result.status))
            };
          })
          .filter((item): item is SearchResult => Boolean(item))
      };
    })
    .filter((group): group is SearchGroup => Boolean(group))
    .slice(0, 8);
}

function normalizeStatus(value: string): SearchResult["status"] {
  if (value === "verified" || value === "search-result" || value === "fallback") return value;
  return "search-result";
}

function normalizeSourceType(value: string): SourceType | undefined {
  const allowed: SourceType[] = ["official", "encyclopedia", "travel", "news", "community", "search", "local", "document"];
  return allowed.includes(value as SourceType) ? value as SourceType : undefined;
}

function researchFromGroups(groups: SearchGroup[]): ResearchItem[] {
  return groups.flatMap((group, groupIndex) =>
    group.results.slice(0, 4).map((result, resultIndex): ResearchItem => {
      const provider = cleanText(group.provider);
      const looksFixture = /fixture|golden|test/i.test(provider) || /example\.com\/golden/i.test(result.url || "");
      const hasRealUrl = /^https?:\/\//i.test(result.url || "") && !looksFixture;
      return {
        id: `acquired-research-${groupIndex + 1}-${resultIndex + 1}`,
        title: cleanText(result.title, group.query || `资料 ${groupIndex + 1}`),
        source: cleanText(result.sourceName || result.url || provider || "资料来源"),
        sourceName: cleanText(result.sourceName || provider || result.url || "资料来源"),
        providerTier: result.providerTier || (provider === "bing_html" || provider === "bing" ? "experimental_fallback" : hasRealUrl ? "official_provider" : "local_or_user"),
        sourceType: looksFixture ? "local" : result.sourceType || "search",
        status: looksFixture ? "fallback" : hasRealUrl ? result.status || "search-result" : "fallback",
        url: hasRealUrl ? cleanText(result.url) : "",
        summary: cleanText(result.snippet, "资料摘要为空。"),
        confidence: looksFixture ? Math.min(48, Number(result.confidence) || 42) : hasRealUrl ? Math.max(50, Math.min(96, Number(result.confidence) || 66)) : Math.min(45, Number(result.confidence) || 38)
      };
    })
  ).slice(0, 24);
}

function groupsFromPublicResponses(responses: PublicSearchResponse[]): SearchGroup[] {
  return responses
    .filter((response) => response.status === "ok")
    .map((response): SearchGroup => ({
      query: response.query,
      provider: response.provider,
      results: response.results.map((result): SearchResult => ({
        title: result.title,
        url: result.url,
        snippet: result.content || result.snippet,
        confidence: result.confidence,
        sourceName: result.provider,
        providerTier: result.providerTier,
        sourceType: result.sourceType || "search",
        status: "search-result"
      }))
    }));
}

function summarizeSource(document: SourceDocument) {
  return {
    sourceId: document.sourceId,
    title: document.title,
    sourceType: document.sourceType,
    url: document.url,
    provider: document.provider,
    providerTier: document.providerTier,
    confidence: document.confidence,
    parseStatus: document.parseStatus
  };
}

function hasUsefulExternalSources(documents: SourceDocument[]) {
  return documents.some((document) =>
    (document.sourceType === "uploaded_file" && document.parseStatus === "parsed") ||
    (document.sourceType === "search_result" && Boolean(document.url))
  );
}

function highRiskPlan(plan: ContentPlan) {
  return ["project_report", "financial_report", "policy_interpretation", "proposal", "business_plan"].includes(plan.pptType);
}

export async function acquireSourceDocuments(input: SourceAcquisitionInput): Promise<{
  sourceDocuments: SourceDocument[];
  acquisitionReport: AcquisitionReport;
  researchSources: ResearchItem[];
}> {
  const config = publicSearchConfig();
  const searchEnabled = config.enabled && !input.disablePublicSearch;
  const evidenceNeeds = input.evidenceNeeds?.length ? input.evidenceNeeds : buildEvidenceNeeds(input.contentPlan, input.slidePagePlans);
  const searchGroups = [
    ...flattenGroups(input.researchSources),
    ...flattenGroups(input.searchMaterials)
  ];
  const existingResearch = researchFromGroups(searchGroups);
  const initialDocuments = parseSourceDocuments({
    prompt: input.prompt,
    uploadedAssets: input.uploadedAssets,
    uploadedFile: input.uploadedFile,
    research: existingResearch,
    pastedText: input.pastedText
  });

  const queryPlan = createSearchQueryPlan({
    contentPlan: input.contentPlan,
    slidePagePlans: input.slidePagePlans,
    evidenceNeeds,
    userPrompt: input.prompt
  });

  const warnings: string[] = [];
  const errors: string[] = [];
  let searchStatus: AcquisitionReport["searchStatus"] = searchEnabled ? "provider_unconfigured" : "disabled";
  const searchQueries: AcquisitionReport["searchQueries"] = [];
  let publicResponses: PublicSearchResponse[] = [];

  const needsExternalEvidence = !hasUsefulExternalSources(initialDocuments) || highRiskPlan(input.contentPlan);
  if (!searchEnabled) {
    warnings.push(input.disablePublicSearch ? "本次生成显式关闭真实公开检索，用于固定测试或离线生成；系统不会伪造搜索结果。" : "REAL_SEARCH_ENABLED=false，系统未执行真实公开检索，也不会伪造搜索结果。");
    searchQueries.push({ query: "", status: "disabled", provider: config.provider || "none", providerTier: "none", resultCount: 0, reason: input.disablePublicSearch ? "本次请求关闭真实搜索" : "真实搜索关闭" });
  } else if (needsExternalEvidence) {
    const plannedQueries = [...queryPlan.deckQueries, ...queryPlan.slideQueries].slice(0, config.maxResults > 4 ? 6 : 4);
    const plannedResponses = await Promise.all(plannedQueries.map(async (planned) => {
      const response = await runPublicSearch({
        query: planned.query,
        pptType: input.contentPlan.pptType,
        audience: input.contentPlan.audience,
        evidenceNeed: planned.evidenceNeedIds[0] || planned.queryReason,
        maxResults: Math.min(4, config.maxResults),
        language: "zh-cn",
        region: "cn"
      });
      return { planned, response };
    }));

    for (const { planned, response } of plannedResponses) {
      publicResponses.push(response);
      searchQueries.push({
        query: planned.query,
        status: response.status,
        provider: response.provider,
        providerTier: response.providerTier,
        resultCount: response.results.length,
        reason: planned.queryReason
      });
      if (response.error) errors.push(response.error);
      warnings.push(...response.warnings);
      if (response.status === "provider_unconfigured") break;
    }
    searchStatus = publicResponses.find((item) => item.status === "ok")?.status ||
      publicResponses.find((item) => item.status === "provider_unconfigured")?.status ||
      publicResponses.find((item) => item.status === "timeout")?.status ||
      publicResponses.find((item) => item.status === "failed")?.status ||
      publicResponses.find((item) => item.status === "empty")?.status ||
      "provider_unconfigured";
  } else {
    searchStatus = "empty";
    warnings.push("上传或粘贴资料已提供可用证据，本轮未额外触发公开检索。");
  }

  const publicResearch = researchFromGroups(groupsFromPublicResponses(publicResponses));
  const sourceDocuments = parseSourceDocuments({
    prompt: input.prompt,
    uploadedAssets: input.uploadedAssets,
    uploadedFile: input.uploadedFile,
    research: [...existingResearch, ...publicResearch],
    pastedText: input.pastedText
  });

  const uploadedDocuments = sourceDocuments.filter((document) => document.sourceType === "uploaded_file");
  const acquisitionReport: AcquisitionReport = {
    usedSources: sourceDocuments.map(summarizeSource),
    searchEnabled,
    searchProvider: config.provider || "none",
    searchProviderTier: publicResponses.find((item) => item.status === "ok")?.providerTier || (config.provider === "bing" ? "experimental_fallback" : config.provider === "none" ? "none" : "official_provider"),
    searchStatus,
    searchQueries,
    uploadedParsedCount: uploadedDocuments.filter((document) => document.parseStatus === "parsed").length,
    uploadedFailedCount: uploadedDocuments.filter((document) => document.parseStatus === "failed" || document.parseStatus === "unsupported").length,
    pastedTextUsed: sourceDocuments.some((document) => document.sourceType === "pasted_text"),
    fallbackUsed: sourceDocuments.some((document) => document.sourceType === "system_fallback" || document.sourceType === "test_fixture"),
    warnings: [...new Set(warnings.filter(Boolean))],
    errors: [...new Set(errors.filter(Boolean))],
    queryPlan
  };

  if (searchEnabled && searchStatus === "provider_unconfigured") {
    acquisitionReport.warnings.push("真实搜索已开启但 provider 或 API Key 未配置，未返回任何 search_result。");
  }
  if (sourceDocuments.some((document) => document.providerTier === "experimental_fallback")) {
    acquisitionReport.warnings.push("当前使用 experimental fallback 搜索来源（bing_html）；建议配置 Tavily / Serper / Brave key，并复核来源原文。");
  }
  if (highRiskPlan(input.contentPlan) && !sourceDocuments.some((document) => document.sourceType === "search_result" || document.sourceType === "uploaded_file")) {
    acquisitionReport.warnings.push("高风险 PPT 类型缺少可追溯公开来源或上传资料，质量闸门可能阻断导出。");
  }

  return {
    sourceDocuments,
    acquisitionReport,
    researchSources: [...existingResearch, ...publicResearch].slice(0, 24)
  };
}
