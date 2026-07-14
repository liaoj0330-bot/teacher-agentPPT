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

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
  page_age?: string;
};

type BraveResponse = {
  web?: {
    results?: BraveWebResult[];
  };
};

export const braveProvider: PublicSearchProvider = {
  name: "brave",
  async search(query: PublicSearchQuery) {
    const config = publicSearchConfig();
    const apiKey = cleanText(process.env.BRAVE_SEARCH_API_KEY);
    const q = cleanText(query.query);
    if (!apiKey) {
      return emptySearchResponse("provider_unconfigured", "brave", q, {
        warnings: ["BRAVE_SEARCH_API_KEY 未配置，未执行真实公开检索。"]
      });
    }
    if (!q) {
      return emptySearchResponse("empty", "brave", q, { warnings: ["搜索词为空。"] });
    }

    try {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", q);
      url.searchParams.set("count", String(Math.max(1, Math.min(query.maxResults || config.maxResults, config.maxResults))));
      url.searchParams.set("search_lang", query.language || "zh");
      url.searchParams.set("country", query.region || "CN");
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey
        },
        signal: AbortSignal.timeout(config.timeoutMs)
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return emptySearchResponse("failed", "brave", q, {
          error: `Brave Search request failed: ${response.status} ${detail.slice(0, 220)}`
        });
      }
      const payload = (await response.json()) as BraveResponse;
      const retrievedAt = new Date().toISOString();
      const results = dedupePublicSearchResults(
        (payload.web?.results || [])
          .map((item, index) =>
            sanitizeSearchResult(
              {
                provider: "brave",
                title: item.title,
                url: item.url,
                snippet: item.description,
                content: item.description,
                publishedAt: item.page_age,
                retrievedAt,
                confidence: 66,
                warnings: ["Provider 返回搜索摘要，未抓取网页全文。"]
              },
              index
            )
          )
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
      ).slice(0, query.maxResults || config.maxResults);
      if (!results.length) {
        return emptySearchResponse("empty", "brave", q, {
          warnings: ["Brave Search 未返回可追溯 URL 结果。"]
        });
      }
      return { status: "ok", provider: "brave", providerTier: "official_provider", query: q, results, warnings: ["Brave Search 结果基于搜索摘要，关键事实仍需核验。"] };
    } catch (error) {
      return emptySearchResponse(isAbortLike(error) ? "timeout" : "failed", "brave", q, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
};
