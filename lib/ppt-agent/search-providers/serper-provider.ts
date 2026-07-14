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

type SerperOrganicResult = {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  source?: string;
};

type SerperResponse = {
  organic?: SerperOrganicResult[];
  answerBox?: { title?: string; snippet?: string; link?: string };
};

export const serperProvider: PublicSearchProvider = {
  name: "serper",
  async search(query: PublicSearchQuery) {
    const config = publicSearchConfig();
    const apiKey = cleanText(process.env.SERPER_API_KEY);
    const q = cleanText(query.query);
    if (!apiKey) {
      return emptySearchResponse("provider_unconfigured", "serper", q, {
        warnings: ["SERPER_API_KEY 未配置，未执行真实公开检索。"]
      });
    }
    if (!q) {
      return emptySearchResponse("empty", "serper", q, { warnings: ["搜索词为空。"] });
    }

    try {
      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey
        },
        signal: AbortSignal.timeout(config.timeoutMs),
        body: JSON.stringify({
          q,
          gl: query.region || "cn",
          hl: query.language || "zh-cn",
          num: Math.max(1, Math.min(query.maxResults || config.maxResults, config.maxResults))
        })
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return emptySearchResponse("failed", "serper", q, {
          error: `Serper request failed: ${response.status} ${detail.slice(0, 220)}`
        });
      }
      const payload = (await response.json()) as SerperResponse;
      const retrievedAt = new Date().toISOString();
      const organic = payload.organic || [];
      const answer = payload.answerBox?.link
        ? [payload.answerBox as SerperOrganicResult]
        : [];
      const results = dedupePublicSearchResults(
        [...answer, ...organic]
          .map((item, index) =>
            sanitizeSearchResult(
              {
                provider: "serper",
                title: item.title,
                url: item.link,
                snippet: item.snippet,
                content: item.snippet,
                publishedAt: item.date,
                retrievedAt,
                confidence: item.source ? 70 : 64,
                warnings: ["Provider 返回搜索摘要，未抓取网页全文。"]
              },
              index
            )
          )
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
      ).slice(0, query.maxResults || config.maxResults);
      if (!results.length) {
        return emptySearchResponse("empty", "serper", q, {
          warnings: ["Serper 未返回可追溯 URL 结果。"]
        });
      }
      return { status: "ok", provider: "serper", providerTier: "official_provider", query: q, results, warnings: ["Serper 结果基于搜索摘要，关键数据仍建议二次核验。"] };
    } catch (error) {
      return emptySearchResponse(isAbortLike(error) ? "timeout" : "failed", "serper", q, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
};
