import { NextResponse } from "next/server";
import { runPublicSearch } from "@/lib/ppt-agent/search-providers/provider-registry";
import { publicSearchConfig } from "@/lib/ppt-agent/public-search-provider";
import type { SearchGroup, SearchResult } from "@/lib/canvas-data";
import { cleanText } from "@/lib/text-sanitize";

function toSearchResult(result: Awaited<ReturnType<typeof runPublicSearch>>["results"][number]): SearchResult {
  return {
    title: result.title,
    url: result.url,
    snippet: result.content || result.snippet,
    confidence: result.confidence,
    sourceName: result.provider,
    sourceType: result.sourceType || "search",
    providerTier: result.providerTier,
    status: "search-result"
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const queries = Array.isArray(body?.queries)
    ? body.queries.map((query: unknown) => cleanText(String(query || ""))).filter(Boolean)
    : [cleanText(String(body?.query || ""))].filter(Boolean);

  if (queries.length === 0) {
    return NextResponse.json({ message: "query is required" }, { status: 400 });
  }

  const config = publicSearchConfig();
  const groups: SearchGroup[] = [];
  const responses = [];

  const searched = await Promise.all(queries.slice(0, 6).map(async (query: string) => {
    const response = await runPublicSearch({
      query,
      maxResults: Math.min(4, config.maxResults),
      language: body?.language || "zh-cn",
      region: body?.region || "cn"
    });
    return { query, response };
  }));

  for (const { query, response } of searched) {
    responses.push(response);
    groups.push({
      query,
      provider: response.provider,
      providerTier: response.providerTier,
      status: response.status,
      error: response.error,
      warnings: response.warnings,
      results: response.status === "ok" ? response.results.map(toSearchResult) : []
    });
  }

  const status =
    responses.find((item) => item.status === "ok")?.status ||
    responses.find((item) => item.status === "provider_unconfigured")?.status ||
    responses.find((item) => item.status === "timeout")?.status ||
    responses.find((item) => item.status === "failed")?.status ||
    responses.find((item) => item.status === "empty")?.status ||
    "empty";

  return NextResponse.json({
    status,
    searchEnabled: config.enabled,
    provider: config.provider || "none",
    providerTier: responses.find((item) => item.status === "ok")?.providerTier || (config.provider === "bing" ? "experimental_fallback" : config.provider === "none" ? "none" : "official_provider"),
    groups,
    warnings: [...new Set(responses.flatMap((item) => item.warnings))],
    errors: responses.map((item) => item.error).filter(Boolean)
  });
}
