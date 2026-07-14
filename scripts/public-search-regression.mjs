const BASE_URL = process.env.PUBLIC_SEARCH_BASE_URL || "http://127.0.0.1:3002";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function postJson(pathname, body) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(`${pathname} ${response.status}: ${text}`);
  }
  return data;
}

const payload = await postJson("/api/search-materials", {
  queries: [
    "Dify official documentation RAG workflow",
    "Beijing tourism official reservation guide"
  ],
  language: "zh-CN",
  region: "CN"
});

assert(payload.searchEnabled === true, "real search should be enabled in local env");
assert(payload.provider === "bing", `expected provider bing, got ${payload.provider}`);
assert(["ok", "empty", "failed", "timeout"].includes(payload.status), `invalid status ${payload.status}`);

const results = (payload.groups || []).flatMap((group) => group.results || []);
if (payload.status === "ok") {
  assert(results.length > 0, "status ok but no results returned");
  assert(results.every((item) => /^https?:\/\//.test(item.url || "")), "all results must have traceable http(s) URLs");
  assert(results.every((item) => item.sourceName === "bing"), "all results must be marked as bing provider results");
  assert(results.some((item) => item.sourceType === "official"), "expected at least one official source classification");
  assert(results.some((item) => String(item.snippet || "").length >= 700), "expected at least one enriched readable content snippet");
  for (const group of payload.groups || []) {
    const groupResults = group.results || [];
    if (groupResults.some((item) => item.sourceType === "official")) {
      assert(groupResults[0]?.sourceType === "official", `official result should be prioritized for query: ${group.query}`);
    }
  }
  assert(!results.some((item) => /example\.com\/golden|mock|placeholder|duckduckgo\.com\/\?q=/i.test(`${item.url} ${item.snippet}`)), "fake or placeholder search result detected");
} else {
  assert(results.length === 0, "failed/empty search must not return fallback fake results");
}

console.log(JSON.stringify({
  passed: true,
  checkedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  status: payload.status,
  provider: payload.provider,
  groups: payload.groups?.length || 0,
  results: results.length,
  officialResults: results.filter((item) => item.sourceType === "official").length,
  enrichedResults: results.filter((item) => String(item.snippet || "").length >= 700).length,
  firstResults: results.slice(0, 3).map((item) => ({ title: item.title, url: item.url, sourceType: item.sourceType, confidence: item.confidence, snippetLength: String(item.snippet || "").length }))
}, null, 2));
