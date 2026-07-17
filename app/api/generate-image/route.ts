import { NextResponse } from "next/server";

const DEFAULT_BASE_URL = "https://api.xcode.hk";
const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_ENDPOINT = "/v1/images/generations";

let activeImageRequests = 0;
const imageRequestWaiters: Array<() => void> = [];

function imageConcurrencyLimit() {
  const configured = Number(process.env.OPENAI_IMAGE_CONCURRENCY || "3");
  return Number.isFinite(configured) ? Math.min(3, Math.max(1, Math.floor(configured))) : 3;
}

async function withImageConcurrency<T>(task: () => Promise<T>) {
  if (activeImageRequests >= imageConcurrencyLimit()) {
    await new Promise<void>((resolve) => imageRequestWaiters.push(resolve));
  }
  activeImageRequests += 1;
  try {
    return await task();
  } finally {
    activeImageRequests -= 1;
    const next = imageRequestWaiters.shift();
    if (next) next();
  }
}

function imagesEndpoint(baseUrl: string, endpoint: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  return `${normalized}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
}

function extractJsonImage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const data = Array.isArray(record.data) ? record.data : [];
  const first = data[0] as Record<string, unknown> | undefined;
  if (typeof first?.b64_json === "string" && first.b64_json.trim()) return `data:image/png;base64,${first.b64_json}`;
  if (typeof first?.url === "string" && first.url.trim()) return first.url;
  return "";
}

function imageApiConfig() {
  const timeout = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || "240000");
  return {
    apiKey: process.env.OPENAI_IMAGE_API_KEY?.trim() || "",
    baseUrl: process.env.OPENAI_IMAGE_BASE_URL || DEFAULT_BASE_URL,
    model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL,
    endpoint: process.env.OPENAI_IMAGE_ENDPOINT || DEFAULT_ENDPOINT,
    quality: process.env.OPENAI_IMAGE_QUALITY || "low",
    timeoutMs: Number.isFinite(timeout) ? Math.min(300_000, Math.max(30_000, timeout)) : 240_000
  };
}

function teacherRoleKind(value: string) {
  if (/cover|封面/.test(value)) return "cover";
  if (/目标|评价/.test(value)) return "objectives";
  if (/导入|情境|前置|已有/.test(value)) return "lead_in";
  if (/例题|示范|推导/.test(value)) return "example";
  if (/纠错|错因|易错|再练习/.test(value)) return "misconception";
  if (/练习|互动|探究|操作|反馈/.test(value)) return "practice";
  if (/总结|作业|回顾|迁移/.test(value)) return "summary";
  if (/教材|定义|概念|讲解|算理/.test(value)) return "concept";
  return "content";
}

function parseSseBlock(block: string) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function extractStreamImage(response: Response) {
  if (!response.body) throw new Error("image stream is empty");
  const decoder = new TextDecoder();
  let pending = "";
  let finalBase64 = "";

  const acceptBlock = (block: string) => {
    const event = parseSseBlock(block);
    if (!event) return;
    if (event.type === "error") {
      const detail = event.error && typeof event.error === "object" ? event.error as Record<string, unknown> : {};
      throw new Error(typeof detail.message === "string" ? detail.message : "image stream failed");
    }
    if (event.type === "image_generation.completed" && typeof event.b64_json === "string") finalBase64 = event.b64_json;
  };

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const blocks = pending.split(/\r?\n\r?\n/);
    pending = blocks.pop() || "";
    blocks.forEach(acceptBlock);
  }
  pending += decoder.decode();
  if (pending.trim()) acceptBlock(pending);
  if (!finalBase64) throw new Error("image stream completed without a final image");
  return `data:image/png;base64,${finalBase64}`;
}

async function normalizeImageData(image: string, timeoutMs: number) {
  if (image.startsWith("data:image/")) return image;
  if (!/^https?:\/\//i.test(image)) return "";
  const response = await fetch(image, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`image download failed ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() || "";
  const bytes = Buffer.from(await response.arrayBuffer());
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (!contentType.startsWith("image/") || (!isPng && !isJpeg)) {
    throw new Error("downloaded response is not a PNG or JPEG image");
  }
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function generateWithImageApi(prompt: string, size: string) {
  const config = imageApiConfig();
  const useStream = process.env.OPENAI_IMAGE_STREAM === "1";
  if (!config.apiKey) throw new Error("OPENAI_IMAGE_API_KEY is not configured");

  // The upstream image gateway occasionally returns transient 502/503/504 or
  // aborts a stream before emitting the final image. Retry those failures a
  // small, bounded number of times so one flaky request does not lose a page.
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetch(imagesEndpoint(config.baseUrl, config.endpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: useStream ? "text/event-stream, application/json" : "application/json",
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({ model: config.model, prompt, size, quality: config.quality, n: 1, ...(useStream ? { stream: true } : {}) }),
        signal: AbortSignal.timeout(config.timeoutMs)
      });
      if (!response.ok) {
        const payload = await response.text().catch(() => "");
        const error = new Error(`image request failed ${response.status}: ${payload.replace(/\s+/g, " ").slice(0, 180)}`);
        if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === maxAttempts) throw error;
        lastError = error;
      } else {
        const contentType = response.headers.get("content-type") || "";
        const rawImage = contentType.includes("text/event-stream")
          ? await extractStreamImage(response)
          : extractJsonImage(await response.json());
        const image = await normalizeImageData(rawImage, config.timeoutMs);
        if (!image) throw new Error("image response did not contain a usable image");
        return {
          image,
          model: config.model,
          transport: contentType.includes("text/event-stream") ? "sse" : "json",
          elapsedMs: Date.now() - started,
          requestId: response.headers.get("x-request-id") || undefined,
          attempts: attempt
        };
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  throw lastError instanceof Error ? lastError : new Error("image generation failed");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : "AI PPT Agent";
  const requestedPrompt =
    typeof body?.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim()
      : `生成一张高级干净的 PPT 视觉图，主题：${title}。浅色商务风，真实场景质感，适合作为 16:9 PPT 背景，不要文字，不要水印。`;
  const teacherRole = body?.context === "teacher_courseware" ? teacherRoleKind(String(body?.slideRole || "")) : "";
  const prompt = teacherRole === "cover"
    ? `真实课堂主视觉：${requestedPrompt}。教师在明亮现代教室的白板前授课，学生和教材作为背景，教育摄影或高质量教育插画，蓝色与暖色点缀，标题安全留白。禁止坐标轴、函数曲线、公式、数字、图表、流程图、文字、Logo、UI截图和水印。`
    : teacherRole === "objectives"
      ? `学习目标视觉：${requestedPrompt}。使用清晰的学习材料、路线或课堂成果意象，构图简洁，保留大片留白。禁止任何可读文字、数字、算式、表格、卡片界面、Logo和水印。`
    : teacherRole === "lead_in"
      ? `数学课堂真实情境图：${requestedPrompt}。必须是学生熟悉的生活场景，能观察到两个量共同变化，构图清晰，适合16:9课堂投影右侧配图。不要公式、坐标轴、图表、文字、Logo、UI截图和水印。`
      : teacherRole === "example"
        ? `例题实物图：${requestedPrompt}。只表现数量、分组、移动或比较的实物关系，物体个数清楚且可数。不要生成数字、算式、等号、答案框、文字、Logo、UI截图和水印；算式由PPT原生对象另行叠加。`
      : teacherRole === "practice"
        ? `课堂操作活动图：${requestedPrompt}。突出学生可操作的学具、分类、组合或拿取过程，画面只承担情境和观察证据。不要生成数字、公式、答案框、可读文字、Logo、UI截图和水印。`
      : teacherRole === "misconception"
        ? `纠错观察图：${requestedPrompt}。用两种清楚的实物状态呈现可比较的错误线索与修正结果，但不直接写答案。不要生成数字、公式、文字、Logo、UI截图和水印。`
      : teacherRole === "summary"
        ? `课堂总结记忆图：${requestedPrompt}。使用简洁的学具、生活物品或知识迁移场景形成单一记忆锚点。不要生成数字、公式、可读文字、Logo、UI截图和水印。`
      : teacherRole === "concept"
        ? `概念直观图：${requestedPrompt}。使用真实学具或清晰科学插画表达关系和变化，只画可观察对象，不在图片内写定义或结论。不要生成数字、公式、文字、Logo、UI截图和水印。`
          : requestedPrompt;
  const size = typeof body?.size === "string" && body.size.trim() ? body.size.trim() : process.env.OPENAI_IMAGE_SIZE || "1024x1024";

  try {
    const result = await withImageConcurrency(() => generateWithImageApi(prompt, size));
    return NextResponse.json({ ...result, provider: "openai-compatible" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "image generation failed";
    console.error("[generate-image] OpenAI-compatible image request failed.", message);
    return NextResponse.json({ error: "image_generation_failed", message }, { status: 502 });
  }
}
