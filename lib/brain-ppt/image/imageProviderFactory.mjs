import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OpenAIImageProvider } from "./OpenAIImageProvider.mjs";

export function loadEnvFile(envPath = ".env.local") {
  const fullPath = resolve(envPath);
  if (!existsSync(fullPath)) return;
  for (const line of readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    process.env[match[1]] = match[2];
  }
}

export function createImageProvider(options = {}) {
  if (options.loadEnv !== false) loadEnvFile(options.envPath || ".env.local");
  const provider = String(options.provider || "openai-compatible");
  if (!["openai", "openai-compatible"].includes(provider)) {
    throw new Error(`Unsupported image provider: ${provider}`);
  }
  return new OpenAIImageProvider({
    baseUrl: options.baseUrl || process.env.OPENAI_IMAGE_BASE_URL || "https://api.xcode.hk",
    apiKey: options.apiKey || process.env.OPENAI_IMAGE_API_KEY,
    model: options.model || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    endpoint: options.endpoint || process.env.OPENAI_IMAGE_ENDPOINT || "/v1/images/generations",
    quality: options.quality || process.env.OPENAI_IMAGE_QUALITY || "low",
    timeoutMs: options.timeoutMs || process.env.OPENAI_IMAGE_TIMEOUT_MS
  });
}
