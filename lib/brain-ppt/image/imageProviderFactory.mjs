import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PinchuanImageProvider } from "./PinchuanImageProvider.mjs";

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
  const provider = String(options.provider || process.env.SANDUN_IMAGE_PROVIDER || "pinchuan");
  if (provider !== "pinchuan") {
    throw new Error(`Unsupported image provider: ${provider}`);
  }
  return new PinchuanImageProvider({
    baseUrl: options.baseUrl || process.env.PINCHUAN_API_BASE_URL || "https://pinchuanapi.tech",
    apiKey: options.apiKey || process.env.PINCHUAN_API_KEY,
    model: options.model || process.env.SANDUN_IMAGE_MODEL || "",
    endpoint: options.endpoint || process.env.SANDUN_IMAGE_ENDPOINT || "/v1/images/generations",
    timeoutMs: options.timeoutMs
  });
}
