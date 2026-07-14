import { cleanText } from "@/lib/text-sanitize";
import type { SourceType } from "@/lib/canvas-data";
import type { ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import type { EvidenceNeed } from "@/lib/ppt-agent/evidence-types";

export type PublicSearchStatus = "ok" | "provider_unconfigured" | "failed" | "timeout" | "empty";

export type PublicSearchProviderName = "none" | "tavily" | "serper" | "brave" | "bing";

export type PublicSearchProviderTier = "official_provider" | "experimental_fallback";

export type PublicSearchQuery = {
  query: string;
  pptType?: ContentPlanPPTType | string;
  audience?: string;
  evidenceNeed?: EvidenceNeed | string;
  maxResults?: number;
  language?: string;
  region?: string;
};

export type PublicSearchResult = {
  resultId: string;
  title: string;
  url: string;
  snippet: string;
  content?: string;
  provider: string;
  providerTier: PublicSearchProviderTier;
  sourceType?: SourceType;
  publishedAt?: string;
  retrievedAt: string;
  confidence: number;
  warnings: string[];
};

export type PublicSearchResponse = {
  status: PublicSearchStatus;
  provider: string;
  providerTier: PublicSearchProviderTier | "none";
  query: string;
  results: PublicSearchResult[];
  error?: string;
  warnings: string[];
};

export type PublicSearchProvider = {
  name: PublicSearchProviderName;
  search: (query: PublicSearchQuery) => Promise<PublicSearchResponse>;
};

export function publicSearchConfig() {
  const provider = cleanText(process.env.PUBLIC_SEARCH_PROVIDER || "none").toLowerCase() as PublicSearchProviderName;
  const enabled = cleanText(process.env.REAL_SEARCH_ENABLED || "false").toLowerCase() === "true";
  const timeoutMs = Math.max(1500, Math.min(30000, Number(process.env.PUBLIC_SEARCH_TIMEOUT_MS) || 12000));
  const maxResults = Math.max(1, Math.min(12, Number(process.env.PUBLIC_SEARCH_MAX_RESULTS) || 8));
  const maxContentChars = Math.max(800, Math.min(50000, Number(process.env.PUBLIC_SEARCH_MAX_CONTENT_CHARS) || 12000));
  const requireUrl = cleanText(process.env.PUBLIC_SEARCH_REQUIRE_URL || "true").toLowerCase() !== "false";
  return { enabled, provider, timeoutMs, maxResults, maxContentChars, requireUrl };
}

export function emptySearchResponse(
  status: PublicSearchStatus,
  provider: string,
  query: string,
  options: { error?: string; warnings?: string[] } = {}
): PublicSearchResponse {
  return {
    status,
    provider: cleanText(provider, "none"),
    providerTier: provider === "bing_html" || provider === "bing" ? "experimental_fallback" : provider === "none" ? "none" : "official_provider",
    query: cleanText(query),
    results: [],
    error: cleanText(options.error),
    warnings: (options.warnings || []).map((item) => cleanText(item)).filter(Boolean)
  };
}

export function isAbortLike(error: unknown) {
  return (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError");
}

export function normalizeUrl(value: unknown) {
  const clean = cleanText(value);
  if (!clean) return "";
  try {
    const parsed = new URL(clean);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

export function hostnameForUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function clampSearchConfidence(value: unknown, fallback = 62) {
  return Math.max(20, Math.min(96, Math.round(Number(value) || fallback)));
}

export function makeResultId(provider: string, url: string, index: number) {
  const host = hostnameForUrl(url) || provider;
  const suffix = Math.abs([...url].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 999999, 7));
  return `${provider}-${host}-${index + 1}-${suffix}`.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 96);
}

export function sanitizeSearchResult(input: {
  provider: string;
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
  content?: unknown;
  publishedAt?: unknown;
  retrievedAt?: string;
  confidence?: unknown;
  sourceType?: SourceType;
  warnings?: string[];
}, index: number): PublicSearchResult | null {
  const url = normalizeUrl(input.url);
  const config = publicSearchConfig();
  if (config.requireUrl && !url) {
    return null;
  }
  const title = cleanText(input.title, hostnameForUrl(url) || `搜索结果 ${index + 1}`);
  const snippet = cleanText(input.snippet || input.content, "搜索结果未返回摘要。").slice(0, 600);
  const content = cleanText(input.content).slice(0, config.maxContentChars);
  return {
    resultId: makeResultId(input.provider, url || title, index),
    title,
    url,
    snippet,
    content,
    provider: cleanText(input.provider),
    providerTier: input.provider === "bing_html" || input.provider === "bing" ? "experimental_fallback" : "official_provider",
    sourceType: input.sourceType,
    publishedAt: cleanText(input.publishedAt),
    retrievedAt: input.retrievedAt || new Date().toISOString(),
    confidence: clampSearchConfidence(input.confidence, content ? 74 : 62),
    warnings: (input.warnings || []).map((item) => cleanText(item)).filter(Boolean)
  };
}

export function dedupePublicSearchResults(results: PublicSearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = (result.url || result.title).replace(/\/$/, "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
