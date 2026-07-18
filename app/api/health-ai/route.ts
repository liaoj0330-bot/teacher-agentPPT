import { NextResponse } from "next/server";

function configured(value: string | undefined) {
  return Boolean(value && value.trim());
}

function hostLabel(value: string | undefined) {
  if (!value) return "未配置";
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, "").split("/")[0] || "自定义";
  }
}

function imageConfig() {
  const configuredLimit = Number(process.env.OPENAI_IMAGE_CONCURRENCY || "3");
  return {
    configured: configured(process.env.OPENAI_IMAGE_API_KEY),
    enabled: process.env.BETA_IMAGE_GENERATION_ENABLED !== "false",
    keyPoolSize: configured(process.env.OPENAI_IMAGE_API_KEY) ? 1 : 0,
    concurrencyLimit: Number.isFinite(configuredLimit) ? Math.min(3, Math.max(1, Math.floor(configuredLimit))) : 3,
    provider: configured(process.env.OPENAI_IMAGE_API_KEY) ? "openai-compatible" : "unconfigured",
    baseUrl: process.env.OPENAI_IMAGE_BASE_URL || "https://api.xcode.hk",
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    endpoint: process.env.OPENAI_IMAGE_ENDPOINT || "/v1/images/generations",
    transport: "sse"
  };
}
export async function GET() {
  const textBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const textModel = process.env.OPENAI_MODEL || "gpt-5.5";
  const hasApiKey = configured(process.env.OPENAI_API_KEY);
  const image = imageConfig();

  return NextResponse.json({
    text: {
      configured: hasApiKey,
      provider: hasApiKey ? "openai-compatible" : "local-fallback",
      host: hostLabel(textBaseUrl),
      model: textModel
    },
    image: {
      configured: image.configured,
      enabled: image.enabled,
      keyPoolSize: "keyPoolSize" in image ? image.keyPoolSize : 1,
      concurrencyLimit: "concurrencyLimit" in image ? image.concurrencyLimit : 1,
      provider: image.provider,
      host: hostLabel(image.baseUrl),
      model: image.model,
      endpoint: image.endpoint,
      transport: image.transport
    },
    upload: {
      parser: "local-python",
      endpoint: "/api/upload-ppt"
    },
    generatedAt: new Date().toISOString()
  });
}
