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
  if (activeImageRequests >= imageConcurrencyLimit()) await new Promise<void>((resolve) => imageRequestWaiters.push(resolve));
  activeImageRequests += 1;
  try {
    return await task();
  } finally {
    activeImageRequests -= 1;
    imageRequestWaiters.shift()?.();
  }
}

function config() {
  const timeout = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS || "240000");
  return {
    apiKey: process.env.OPENAI_IMAGE_API_KEY?.trim() || "",
    baseUrl: (process.env.OPENAI_IMAGE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL,
    endpoint: process.env.OPENAI_IMAGE_ENDPOINT || DEFAULT_ENDPOINT,
    quality: process.env.OPENAI_IMAGE_QUALITY || "low",
    timeoutMs: Number.isFinite(timeout) ? Math.min(300_000, Math.max(30_000, timeout)) : 240_000
  };
}

function parseSseBlock(block: string) {
  const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
  if (!data || data === "[DONE]") return null;
  try { return JSON.parse(data) as Record<string, unknown>; } catch { return null; }
}

async function extractStreamImage(response: Response) {
  if (!response.body) throw new Error("image stream is empty");
  const decoder = new TextDecoder();
  let pending = "";
  let finalBase64 = "";
  const accept = (block: string) => {
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
    blocks.forEach(accept);
  }
  pending += decoder.decode();
  if (pending.trim()) accept(pending);
  if (!finalBase64) throw new Error("image stream completed without a final image");
  return `data:image/png;base64,${finalBase64}`;
}

function extractJsonImage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = Array.isArray((payload as Record<string, unknown>).data) ? (payload as { data: unknown[] }).data : [];
  const first = data[0] as Record<string, unknown> | undefined;
  if (typeof first?.b64_json === "string" && first.b64_json.trim()) return `data:image/png;base64,${first.b64_json}`;
  return typeof first?.url === "string" ? first.url.trim() : "";
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
  if (!contentType.startsWith("image/") || (!isPng && !isJpeg)) throw new Error("downloaded response is not a PNG or JPEG image");
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function generateWithImageApi(prompt: string, size: string) {
  const imageConfig = config();
  const useStream = process.env.OPENAI_IMAGE_STREAM === "1";
  if (!imageConfig.apiKey) throw new Error("OPENAI_IMAGE_API_KEY is not configured");
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetch(`${imageConfig.baseUrl}${imageConfig.endpoint.startsWith("/") ? imageConfig.endpoint : `/${imageConfig.endpoint}`}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: useStream ? "text/event-stream, application/json" : "application/json", Authorization: `Bearer ${imageConfig.apiKey}` },
        body: JSON.stringify({ model: imageConfig.model, prompt, size, quality: imageConfig.quality, n: 1, ...(useStream ? { stream: true } : {}) }),
        signal: AbortSignal.timeout(imageConfig.timeoutMs)
      });
      if (!response.ok) {
        const payload = await response.text().catch(() => "");
        const error = new Error(`image request failed ${response.status}: ${payload.replace(/\s+/g, " ").slice(0, 180)}`);
        if (![408, 425, 429, 500, 502, 503, 504].includes(response.status) || attempt === 3) throw error;
        lastError = error;
      } else {
        const contentType = response.headers.get("content-type") || "";
        const raw = contentType.includes("text/event-stream") ? await extractStreamImage(response) : extractJsonImage(await response.json());
        const image = await normalizeImageData(raw, imageConfig.timeoutMs);
        if (!image) throw new Error("image response did not contain a usable image");
        return { image, model: imageConfig.model, transport: contentType.includes("text/event-stream") ? "sse" : "json", elapsedMs: Date.now() - started, requestId: response.headers.get("x-request-id") || undefined, attempts: attempt };
      }
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
  }
  throw lastError instanceof Error ? lastError : new Error("image generation failed");
}

export async function generateImageForRequest(prompt: string, size: string) {
  return withImageConcurrency(() => generateWithImageApi(prompt, size));
}
