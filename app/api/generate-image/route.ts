import { NextResponse } from "next/server";
import { createTopicVisualDataUri } from "@/lib/visual-assets";

const keyCooldowns = new Map<string, number>();
let activeImageRequests = 0;
const imageRequestWaiters: Array<() => void> = [];

function parseApiKeys(...values: Array<string | undefined>) {
  return [...new Set(values.flatMap((value) => (value || "").split(/[;,\r\n]+/)).map((value) => value.trim()).filter(Boolean))];
}

async function withImageConcurrency<T>(task: () => Promise<T>) {
  const limit = Math.min(2, Math.max(1, Math.floor(Number(process.env.SANDUN_IMAGE_CONCURRENCY || "1") || 1)));
  if (activeImageRequests >= limit) await new Promise<void>((resolve) => imageRequestWaiters.push(resolve));
  activeImageRequests += 1;
  try {
    return await task();
  } finally {
    activeImageRequests -= 1;
    imageRequestWaiters.shift()?.();
  }
}

function imagesEndpoint(baseUrl: string, endpoint?: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  if (endpoint) {
    return `${normalized}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  }
  return normalized.endsWith("/v1") ? `${normalized}/images/generations` : `${normalized}/v1/images/generations`;
}

function extractImageData(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const data = Array.isArray(record.data) ? record.data : [];
  const first = data[0] as Record<string, unknown> | undefined;

  if (typeof first?.b64_json === "string" && first.b64_json.trim()) {
    return `data:image/png;base64,${first.b64_json}`;
  }

  if (typeof first?.url === "string" && first.url.trim()) {
    return first.url;
  }

  return "";
}

async function requestImage({
  apiKey,
  baseUrl,
  model,
  endpoint,
  prompt,
  size,
  includeResponseFormat,
  includeApiKeyHeader
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
  endpoint?: string;
  prompt: string;
  size: string;
  includeResponseFormat: boolean;
  includeApiKeyHeader: boolean;
}) {
  const isArk = baseUrl.includes("volces.com");
  const body: Record<string, unknown> = isArk
    ? { model, prompt, sequential_image_generation: "disabled", response_format: "url", size: size === "1024x1024" ? "2K" : size, stream: false, watermark: true }
    : { model, prompt, size, n: 1 };
  if (includeResponseFormat) {
    body.response_format = "b64_json";
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
  if (includeApiKeyHeader) {
    headers["x-api-key"] = apiKey;
  }

  return fetch(imagesEndpoint(baseUrl, endpoint), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000)
  });
}

function imageApiConfig() {
  const arkKey = process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY;
  if (arkKey) return {
    provider: "volcengine",
    apiKeys: parseApiKeys(process.env.ARK_API_KEYS, arkKey),
    baseUrl: process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
    model: process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128",
    endpoint: "/images/generations",
    includeApiKeyHeader: false,
  };
  const provider = process.env.SANDUN_IMAGE_PROVIDER || "";
  const usePinchuan = provider.toLowerCase() === "pinchuan" || Boolean(process.env.PINCHUAN_API_KEY);
  return {
    apiKeys: usePinchuan
      ? parseApiKeys(process.env.PINCHUAN_API_KEYS, process.env.PINCHUAN_API_KEY, process.env.OPENAI_API_KEY)
      : parseApiKeys(process.env.OPENAI_IMAGE_API_KEYS, process.env.OPENAI_API_KEY),
    baseUrl: usePinchuan
      ? process.env.PINCHUAN_API_BASE_URL || process.env.OPENAI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://pinchuanapi.tech"
      : process.env.OPENAI_IMAGE_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com",
    model: usePinchuan ? process.env.SANDUN_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2" : process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    endpoint: usePinchuan ? process.env.SANDUN_IMAGE_ENDPOINT || "/v1/images/generations" : undefined,
    includeApiKeyHeader: usePinchuan
  };
}

async function generateWithImageApi(prompt: string, size: string) {
  const { apiKeys, baseUrl, model, endpoint, includeApiKeyHeader, provider } = imageApiConfig();

  if (!apiKeys.length) {
    throw new Error("image API key is not configured");
  }

  const failures: string[] = [];
  for (const [index, apiKey] of apiKeys.entries()) {
    if ((keyCooldowns.get(apiKey) || 0) > Date.now()) continue;
    try {
      let response = await requestImage({ apiKey, baseUrl, model, endpoint, prompt, size, includeResponseFormat: provider !== "volcengine", includeApiKeyHeader });
      if (response.status === 404 && endpoint === "/v1/images/generations") {
        response = await requestImage({ apiKey, baseUrl, model, endpoint: "/images/generations", prompt, size, includeResponseFormat: provider !== "volcengine", includeApiKeyHeader });
      }
      if (!response.ok && [400, 404, 422].includes(response.status)) {
        response = await requestImage({ apiKey, baseUrl, model, endpoint, prompt, size, includeResponseFormat: false, includeApiKeyHeader });
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        if ([401, 403, 429].includes(response.status) || response.status >= 500) keyCooldowns.set(apiKey, Date.now() + 30_000);
        failures.push(`key#${index + 1} HTTP ${response.status}: ${detail.replace(/\s+/g, " ").slice(0, 120)}`);
        continue;
      }
      const image = extractImageData(await response.json());
      if (image) {
        keyCooldowns.delete(apiKey);
        return image;
      }
      failures.push(`key#${index + 1} returned no image`);
    } catch (error) {
      keyCooldowns.set(apiKey, Date.now() + 30_000);
      failures.push(`key#${index + 1} ${error instanceof Error ? error.message : "request failed"}`);
    }
  }
  throw new Error(`all image keys failed: ${failures.join("; ").slice(0, 360)}`);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : "AI PPT Agent";
  const requestedPrompt =
    typeof body?.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim()
      : `生成一张高级干净的 PPT 视觉图，主题：${title}。浅色商务风，真实场景质感，适合作为 16:9 PPT 背景，不要文字，不要水印。`;
  const teacherRole = body?.context === "teacher_courseware" ? String(body?.slideRole || "") : "";
  const prompt = teacherRole === "cover"
    ? `真实课堂主视觉：${requestedPrompt}。教师在明亮现代教室的白板前授课，学生和教材作为背景，教育摄影或高质量教育插画，蓝色与暖色点缀，标题安全留白。禁止坐标轴、函数曲线、公式、数字、图表、流程图、文字、Logo、UI截图和水印。`
    : teacherRole === "lead_in"
      ? `数学课堂真实情境图：${requestedPrompt}。必须是学生熟悉的生活场景，能观察到两个量共同变化，构图清晰，适合16:9课堂投影右侧配图。不要公式、坐标轴、图表、文字、Logo、UI截图和水印。`
      : teacherRole === "inquiry"
        ? `课堂探究活动图：${requestedPrompt}。3至4名中学生围绕桌面材料讨论、记录和比较，教师在旁引导，真实教育摄影，高亮学生合作与证据讨论，适合16:9课件。不要可读文字、公式、Logo、UI截图和水印。`
        : teacherRole === "textbook"
          ? `教材研读场景图：${requestedPrompt}。打开的数学教材、便签和教师备课笔记，俯拍构图，页面文字不可读但要有真实教材质感，适合16:9课件。不要Logo、UI截图和水印。`
          : requestedPrompt;
  const size = typeof body?.size === "string" && body.size.trim() ? body.size.trim() : process.env.OPENAI_IMAGE_SIZE || "1024x1024";

  try {
    const image = await withImageConcurrency(() => generateWithImageApi(prompt, size));
    return NextResponse.json({ image, provider: imageApiConfig().provider });
  } catch (error) {
    console.warn("[generate-image] Image API failed, using local visual fallback.", error);
    const message = error instanceof Error ? error.message : "image api failed";
    const fallbackSubtitle = /产品|解决方案|Agent|RAG|知识库|工作流|API/i.test(`${title} ${prompt}`)
      ? "产品定位 · 工作流 · 架构 · 场景"
      : /旅行|旅游|攻略|北京|杭州|景点/.test(`${title} ${prompt}`)
        ? "路线 · 景点 · 美食 · 预算"
        : "Research · Outline · Planning · Design";
    return NextResponse.json({
      image: createTopicVisualDataUri({ title, subtitle: fallbackSubtitle, index: 0, topic: title }),
      provider: "local",
      message
    });
  }
}
