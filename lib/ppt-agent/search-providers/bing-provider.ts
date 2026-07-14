import {
  dedupePublicSearchResults,
  emptySearchResponse,
  hostnameForUrl,
  isAbortLike,
  publicSearchConfig,
  sanitizeSearchResult,
  type PublicSearchResult,
  type PublicSearchProvider,
  type PublicSearchQuery
} from "@/lib/ppt-agent/public-search-provider";
import type { SourceType } from "@/lib/canvas-data";
import { cleanText } from "@/lib/text-sanitize";

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&#0*160;/g, " ")
    .replace(/&#0*0183;/g, "·")
    .replace(/&ensp;/g, " ")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function unwrapBingUrl(value: string) {
  const raw = decodeHtmlEntities(value);
  try {
    const parsed = new URL(raw);
    const target = parsed.searchParams.get("u") || parsed.searchParams.get("url");
    if (target && /^https?:\/\//i.test(target)) return target;
    return raw;
  } catch {
    return raw;
  }
}

function classifySourceType(input: { url: string; title: string; snippet?: string; query?: string }): SourceType {
  const host = hostnameForUrl(input.url).toLowerCase();
  const text = `${input.title} ${input.snippet || ""} ${input.query || ""}`.toLowerCase();
  if (/wikipedia|baike|百科/.test(`${host} ${text}`)) return "encyclopedia";
  if (/news|36kr|sina|sohu|qq\.com|163\.com|thepaper|财新|新闻/.test(`${host} ${text}`)) return "news";
  if (/zhihu|csdn|juejin|jianshu|reddit|stackoverflow|medium|blog|博客|社区|论坛/.test(`${host} ${text}`)) return "community";
  if (/(\.gov\.cn$|\.edu\.cn$|\.ac\.cn$|gov\.cn$|edu\.cn$)/i.test(host) || /政府|人民政府|官方|官网|official/.test(text)) return "official";
  const hostStem = host.split(".").filter(Boolean).at(-2) || "";
  if (hostStem.length >= 4 && new RegExp(`\\b${hostStem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) return "official";
  if (/docs?\.|documentation|developer|manual|help|support|github\.com|gitbook|readthedocs|文档|指南/.test(`${host} ${text}`)) return "encyclopedia";
  if (/ctrip|trip|mafengwo|travel|tour|文旅|旅游|景区/.test(`${host} ${text}`)) return "travel";
  return "search";
}

function confidenceForSourceType(sourceType: SourceType, hasContent: boolean) {
  const base = sourceType === "official" ? 78 : sourceType === "encyclopedia" ? 72 : sourceType === "news" ? 68 : sourceType === "community" ? 58 : 64;
  return Math.min(92, base + (hasContent ? 8 : 0));
}

function readableHtml(value: string) {
  return stripHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
  );
}

async function fetchReadableContent(result: PublicSearchResult) {
  const config = publicSearchConfig();
  try {
    const response = await fetch(result.url, {
      method: "GET",
      headers: {
        Accept: "text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.4",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
      },
      signal: AbortSignal.timeout(Math.max(2500, Math.min(9000, Math.floor(config.timeoutMs * 0.7))))
    });
    if (!response.ok) {
      return { content: "", warning: `正文抓取失败：HTTP ${response.status}` };
    }
    const contentType = response.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|application\/xhtml\+xml/i.test(contentType)) {
      return { content: "", warning: `正文抓取跳过：非文本内容 ${contentType || "unknown"}` };
    }
    const raw = await response.text();
    const text = readableHtml(raw).slice(0, config.maxContentChars);
    if (text.length < 240) {
      return { content: "", warning: "正文抓取结果过短，保留搜索摘要。" };
    }
    return { content: text, warning: "" };
  } catch (error) {
    return { content: "", warning: `正文抓取失败：${error instanceof Error ? error.message : String(error)}` };
  }
}

function sourcePriority(result: PublicSearchResult) {
  const typeScore: Record<SourceType, number> = {
    official: 34,
    encyclopedia: 18,
    travel: 15,
    news: 12,
    search: 8,
    document: 8,
    community: 0,
    local: 0
  };
  const contentBonus = (result.content || "").length >= 700 ? 8 : 0;
  return (typeScore[result.sourceType || "search"] || 0) + contentBonus + result.confidence * 0.2;
}

function parseBingResults(html: string, provider: string, retrievedAt: string) {
  const blocks = html.split(/<li\s+class="b_algo"[^>]*>/i).slice(1);
  return blocks
    .map((block, index) => {
      const heading = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!heading) return null;
      const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const dateMatch = block.match(/<span[^>]*class="news_dt"[^>]*>([\s\S]*?)<\/span>/i) || block.match(/(\d{4}年\d{1,2}月\d{1,2}日)/);
      const title = stripHtml(heading[2]);
      const url = unwrapBingUrl(heading[1]);
      const cleanSnippet = snippet ? stripHtml(snippet[1]) : "";
      const sourceType = classifySourceType({ url, title, snippet: cleanSnippet });
      return sanitizeSearchResult(
        {
          provider,
          title,
          url,
          snippet: cleanSnippet,
          content: cleanSnippet,
          publishedAt: dateMatch ? stripHtml(dateMatch[1]) : "",
          retrievedAt,
          sourceType,
          confidence: confidenceForSourceType(sourceType, false),
          warnings: ["Bing HTML 结果基于公开搜索摘要，关键数据仍建议二次核验。"]
        },
        index
      );
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export const bingProvider: PublicSearchProvider = {
  name: "bing",
  async search(query: PublicSearchQuery) {
    const config = publicSearchConfig();
    const q = cleanText(query.query);
    if (!q) {
      return emptySearchResponse("empty", "bing_html", q, { warnings: ["搜索词为空。"] });
    }

    try {
      const url = new URL("https://www.bing.com/search");
      url.searchParams.set("q", q);
      url.searchParams.set("setlang", query.language || "zh-CN");
      url.searchParams.set("cc", query.region || "CN");
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36"
        },
        signal: AbortSignal.timeout(config.timeoutMs)
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        return emptySearchResponse("failed", "bing_html", q, {
          error: `Bing HTML request failed: ${response.status} ${detail.slice(0, 220)}`
        });
      }
      const html = await response.text();
      const retrievedAt = new Date().toISOString();
      const parsedResults = dedupePublicSearchResults(parseBingResults(html, "bing_html", retrievedAt)).slice(0, query.maxResults || config.maxResults);
      const enrichCount = Math.min(3, parsedResults.length);
      const results: PublicSearchResult[] = [];
      for (let index = 0; index < parsedResults.length; index += 1) {
        const result = parsedResults[index];
        if (index < enrichCount) {
          const enriched = await fetchReadableContent(result);
          const sourceType = result.sourceType || classifySourceType({ url: result.url, title: result.title, snippet: result.snippet, query: q });
          results.push({
            ...result,
            sourceType,
            content: enriched.content || result.content,
            confidence: confidenceForSourceType(sourceType, Boolean(enriched.content)),
            warnings: [
              ...result.warnings,
              enriched.content ? "已抓取公开网页正文片段，用于增强证据链。" : enriched.warning
            ].filter(Boolean)
          });
        } else {
          const sourceType = result.sourceType || classifySourceType({ url: result.url, title: result.title, snippet: result.snippet, query: q });
          results.push({ ...result, sourceType, confidence: confidenceForSourceType(sourceType, Boolean(result.content)) });
        }
      }
      results.sort((a, b) => sourcePriority(b) - sourcePriority(a));
      if (!results.length) {
        return emptySearchResponse("empty", "bing_html", q, {
          warnings: ["Bing HTML 未解析到可追溯 URL 结果，未使用任何伪造来源。"]
        });
      }
      return {
        status: "ok",
        provider: "bing_html",
        providerTier: "experimental_fallback",
        query: q,
        results: results.map((result) => ({
          ...result,
          confidence: Math.min(result.confidence, 68),
          warnings: [
            ...result.warnings,
            "experimental_search_fallback",
            "摘要类证据需复核原文"
          ].filter(Boolean)
        })),
        warnings: [
          "experimental_search_fallback",
          "Bing HTML 公开搜索仅作为实验性降级；摘要类证据需要在关键结论处复核来源原文。"
        ]
      };
    } catch (error) {
      return emptySearchResponse(isAbortLike(error) ? "timeout" : "failed", "bing_html", q, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
};
