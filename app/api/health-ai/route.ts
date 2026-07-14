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
  const arkKey = process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY;
  if (configured(arkKey)) {
    return {
      configured: true,
      provider: "volcengine",
      baseUrl: process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
      model: process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128",
      endpoint: "/images/generations"
    };
  }
  const provider = process.env.SANDUN_IMAGE_PROVIDER || "";
  const usePinchuan = provider.toLowerCase() === "pinchuan" || configured(process.env.PINCHUAN_API_KEY);
  return {
    configured: usePinchuan ? configured(process.env.PINCHUAN_API_KEY || process.env.OPENAI_API_KEY) : configured(process.env.OPENAI_API_KEY),
    provider: usePinchuan ? "pinchuan" : configured(process.env.OPENAI_API_KEY) ? "openai-compatible" : "local-fallback",
    baseUrl: usePinchuan
      ? process.env.PINCHUAN_API_BASE_URL || process.env.OPENAI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://pinchuanapi.tech"
      : process.env.OPENAI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com",
    model: usePinchuan ? process.env.SANDUN_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2" : process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    endpoint: usePinchuan ? process.env.SANDUN_IMAGE_ENDPOINT || "/v1/images/generations" : "/v1/images/generations"
  };
}
export async function GET() {
  const textViaPinchuan = !configured(process.env.OPENAI_API_KEY) && configured(process.env.PINCHUAN_API_KEY);
  const textBaseUrl = textViaPinchuan
    ? process.env.PINCHUAN_API_BASE_URL || "https://pinchuanapi.tech"
    : process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const textModel = textViaPinchuan ? process.env.SANDUN_TEXT_MODEL || process.env.OPENAI_MODEL || "gpt-5.5" : process.env.OPENAI_MODEL || "gpt-5.5";
  const hasApiKey = configured(process.env.OPENAI_API_KEY) || configured(process.env.PINCHUAN_API_KEY);
  const image = imageConfig();

  return NextResponse.json({
    text: {
      configured: hasApiKey,
      provider: hasApiKey ? textViaPinchuan ? "pinchuan-compatible" : "openai-compatible" : "local-fallback",
      host: hostLabel(textBaseUrl),
      model: textModel
    },
    image: {
      configured: image.configured,
      provider: image.provider,
      host: hostLabel(image.baseUrl),
      model: image.model,
      endpoint: image.endpoint
    },
    upload: {
      parser: "local-python",
      endpoint: "/api/upload-ppt"
    },
    generatedAt: new Date().toISOString()
  });
}
