import {
  emptySearchResponse,
  publicSearchConfig,
  type PublicSearchProvider,
  type PublicSearchProviderName,
  type PublicSearchQuery
} from "@/lib/ppt-agent/public-search-provider";
import { bingProvider } from "@/lib/ppt-agent/search-providers/bing-provider";
import { braveProvider } from "@/lib/ppt-agent/search-providers/brave-provider";
import { serperProvider } from "@/lib/ppt-agent/search-providers/serper-provider";
import { tavilyProvider } from "@/lib/ppt-agent/search-providers/tavily-provider";

const providers: Partial<Record<PublicSearchProviderName, PublicSearchProvider>> = {
  tavily: tavilyProvider,
  serper: serperProvider,
  brave: braveProvider,
  bing: bingProvider
};

export function publicSearchProviderTier(name = publicSearchConfig().provider) {
  if (name === "tavily" || name === "serper" || name === "brave") return "official_provider";
  if (name === "bing") return "experimental_fallback";
  return "none";
}

export function getPublicSearchProvider(name = publicSearchConfig().provider): PublicSearchProvider | null {
  return providers[name as PublicSearchProviderName] || null;
}

export async function runPublicSearch(query: PublicSearchQuery) {
  const config = publicSearchConfig();
  const providerName = config.provider;
  const provider = getPublicSearchProvider(providerName);
  if (!config.enabled) {
    return emptySearchResponse("provider_unconfigured", providerName || "none", query.query, {
      warnings: ["REAL_SEARCH_ENABLED=false，未执行真实公开检索。"]
    });
  }
  if (!provider || providerName === "none") {
    return emptySearchResponse("provider_unconfigured", providerName || "none", query.query, {
      warnings: ["PUBLIC_SEARCH_PROVIDER 未配置为可用 provider。"]
    });
  }
  return provider.search({
    ...query,
    maxResults: query.maxResults || config.maxResults
  });
}
