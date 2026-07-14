import fs from "node:fs";
import { ensureP1FDirs, reportPath, writeJson, postJson } from "./p1f-utils.mjs";

ensureP1FDirs();

const requireRealProvider = String(process.env.REQUIRE_REAL_PROVIDER || "").toLowerCase() === "true";
const config = {
  REAL_SEARCH_ENABLED: String(process.env.REAL_SEARCH_ENABLED || "false"),
  PUBLIC_SEARCH_PROVIDER: String(process.env.PUBLIC_SEARCH_PROVIDER || "none"),
  TAVILY_API_KEY: Boolean(process.env.TAVILY_API_KEY),
  SERPER_API_KEY: Boolean(process.env.SERPER_API_KEY),
  BRAVE_SEARCH_API_KEY: Boolean(process.env.BRAVE_SEARCH_API_KEY),
  BING_SEARCH_API_KEY: Boolean(process.env.BING_SEARCH_API_KEY),
  PUBLIC_SEARCH_TIMEOUT_MS: Number(process.env.PUBLIC_SEARCH_TIMEOUT_MS || 12000)
};

let result;
try {
  result = await postJson("/api/search-materials", {
    queries: ["P1-F provider diagnostics query"]
  }, { timeoutMs: config.PUBLIC_SEARCH_TIMEOUT_MS + 5000 });
} catch (error) {
  result = { ok: false, error: error instanceof Error ? error.message : String(error) };
}

const hasKey =
  config.TAVILY_API_KEY ||
  config.SERPER_API_KEY ||
  config.BRAVE_SEARCH_API_KEY ||
  config.BING_SEARCH_API_KEY;

const output = {
  config,
  hasKey,
  searchResponse: result.ok ? result.json : null,
  rawStatus: result.ok ? result.status : null,
  error: result.ok ? null : result.error || result.text,
  verdict: "SKIPPED_PROVIDER_UNCONFIGURED"
};

if (config.REAL_SEARCH_ENABLED === "true" && hasKey) {
  output.verdict = result.ok && result.json?.status === "ok" ? "REAL_PROVIDER_OK" : "REAL_PROVIDER_FAILED";
}

writeJson(reportPath("provider-diagnostics.json"), output);

if (config.REQUIRE_REAL_PROVIDER === "true" && config.REAL_SEARCH_ENABLED === "true" && !hasKey) {
  console.error("SKIPPED_PROVIDER_UNCONFIGURED");
  process.exit(1);
}

console.log(JSON.stringify(output, null, 2));
