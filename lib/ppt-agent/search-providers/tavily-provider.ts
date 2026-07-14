import {
  dedupePublicSearchResults,
  emptySearchResponse,
  isAbortLike,
  publicSearchConfig,
  sanitizeSearchResult,
  type PublicSearchProvider,
  type PublicSearchQuery
} from "@/lib/ppt-agent/public-search-provider";
import { cleanText } from "@/lib/text-sanitize";

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
  score?: number;
  published_date?: string;
};

type TavilyResponse = {
  results?: TavilyResult[];
  answer?: string;
  query?: string;
};

export const tavilyProvider: PublicSearchProvider = {
  name: "tavily",
  async search(query: PublicSearchQuery) {
    const config = publicSearchConfig();
    const apiKey = cleanText(process.env.TAVILY_API_KEY);
    const q = cleanText(query.query);
    if (!apiKey) {
      return emptySearchResponse("provider_unconfigured", "tavily", q, {
        warnings: ["TAVILY_API_KEY 未配置，未执行真实公开检索。"]
      });
    }
    if (!q) {
      return emptySearchResponse("empty", "tavily", q, { warnings: ["搜索词为空。"] });
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({
          query: q,
          search_depth: "advanced",
          topic: "general",
          include_answer: false,
          include_raw_content: true,
          max_results: Math.max(1, Math.min(query.maxResults || config.maxResults, config.maxResults))
        })
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return emptySearchResponse("failed", "tavily", q, {
          error: `Tavily request failed: ${response.status} ${detail.slice(0, 220)}`
        });
      }
      const payload = (await response.json()) as TavilyResponse;
      const retrievedAt = new Date().toISOString();
      const results = dedupePublicSearchResults(
        (payload.results || [])
          .map((item, index) =>
            sanitizeSearchResult(
              {
                provider: "tavily",
                title: item.title,
                url: item.url,
                snippet: item.content,
                content: item.raw_content || item.content,
                publishedAt: item.published_date,
                retrievedAt,
                confidence: item.score ? 58 + Number(item.score) * 34 : item.raw_content ? 78 : 66,
                warnings: item.raw_content ? [] : ["Provider 只返回摘要，未返回全文内容。"]
              },
              index
            )
          )
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
      ).slice(0, query.maxResults || config.maxResults);
      if (!results.length) {
        return emptySearchResponse("empty", "tavily", q, {
          warnings: ["Tavily 未返回可追溯 URL 结果。"]
        });
      }
      return { status: "ok", provider: "tavily", providerTier: "official_provider", query: q, results, warnings: [] };
    } catch (error) {
      return emptySearchResponse(isAbortLike(error) ? "timeout" : "failed", "tavily", q, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
};
