import { ImageProvider, maskSecret, redactSecret } from "./ImageProvider.mjs";

function normalizeBaseUrl(value) {
  return String(value || "https://api.xcode.hk").replace(/\/$/, "");
}

function extractModels(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data.map(item => String(item?.id || item?.name || "")).filter(Boolean);
}

function parseSseBlock(block) {
  const data = block.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function readSseImage(response) {
  if (!response.body) throw new Error("image stream is empty");
  const decoder = new TextDecoder();
  let pending = "";
  let finalBase64 = "";

  const acceptBlock = block => {
    const event = parseSseBlock(block);
    if (!event) return;
    if (event.type === "error") throw new Error(event.error?.message || "image stream failed");
    if (event.type === "image_generation.completed" && typeof event.b64_json === "string") finalBase64 = event.b64_json;
  };

  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true });
    const blocks = pending.split(/\r?\n\r?\n/);
    pending = blocks.pop() || "";
    blocks.forEach(acceptBlock);
  }
  pending += decoder.decode();
  if (pending.trim()) acceptBlock(pending);
  if (!finalBase64) throw new Error("image stream completed without a final image");
  return finalBase64;
}

export class OpenAIImageProvider extends ImageProvider {
  constructor(options = {}) {
    super();
    this.provider = "openai-compatible";
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.apiKey = String(options.apiKey || "");
    this.model = String(options.model || "gpt-image-2");
    this.endpoint = String(options.endpoint || "/v1/images/generations");
    this.quality = String(options.quality || "low");
    this.timeoutMs = Number(options.timeoutMs || 240000);
  }

  get configured() {
    return Boolean(this.apiKey);
  }

  safeConfig() {
    return {
      provider: this.provider,
      base_url: this.baseUrl,
      key_present: Boolean(this.apiKey),
      key_mask: maskSecret(this.apiKey),
      endpoint: this.endpoint,
      model: this.model,
      transport: "sse"
    };
  }

  headers(accept = "application/json") {
    return { Accept: accept, Authorization: `Bearer ${this.apiKey}` };
  }

  async probe() {
    const result = {
      ...this.safeConfig(),
      generated_at: new Date().toISOString(),
      health: { attempted: false, ok: false },
      models: { attempted: false, available: false, model_ids: [] }
    };
    if (!this.apiKey) {
      result.error = "OPENAI_IMAGE_API_KEY is not configured";
      return result;
    }
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, { headers: this.headers(), signal: AbortSignal.timeout(Math.min(this.timeoutMs, 25000)) });
      const text = await response.text();
      const payload = response.ok ? JSON.parse(text) : null;
      const modelIds = extractModels(payload);
      const error = response.ok ? "" : redactSecret(text, this.apiKey).slice(0, 1000);
      result.health = { attempted: true, ok: response.ok, status: response.status };
      result.models = { attempted: true, available: response.ok, status: response.status, model_ids: modelIds, error };
    } catch (error) {
      const message = redactSecret(error?.message || String(error), this.apiKey);
      result.health = { attempted: true, ok: false, error: message };
      result.models = { attempted: true, available: false, model_ids: [], error: message };
    }
    return result;
  }

  async generateImage(request) {
    const model = String(request.model || this.model);
    const size = String(request.size || "1024x1024");
    const endpoint = String(request.endpoint || this.endpoint);
    const attempt = { endpoint, transport: "sse", status: 0, ok: false, error: "" };
    if (!this.apiKey) {
      return { ok: false, provider: this.provider, model, endpoint, size, images: [], attempts: [attempt], error: "OPENAI_IMAGE_API_KEY is not configured" };
    }
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: { ...this.headers("text/event-stream, application/json"), "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: request.prompt, size, quality: request.quality || this.quality, n: Number(request.n || 1), stream: true }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      attempt.status = response.status;
      attempt.ok = response.ok;
      if (!response.ok) {
        attempt.error = redactSecret((await response.text()).replace(/\s+/g, " ").slice(0, 1000), this.apiKey);
        return { ok: false, provider: this.provider, model, endpoint, size, images: [], attempts: [attempt], error: attempt.error };
      }
      const contentType = response.headers.get("content-type") || "";
      let images;
      if (contentType.includes("text/event-stream")) {
        images = [{ image_id: request.image_id || "generated_image_001", b64_json: await readSseImage(response), url: "", extension: "png", metadata: request.metadata || {} }];
      } else {
        const payload = await response.json();
        images = (Array.isArray(payload?.data) ? payload.data : []).map((item, index) => ({
          image_id: String(item?.id || request.image_id || `generated_image_${String(index + 1).padStart(3, "0")}`),
          b64_json: typeof item?.b64_json === "string" ? item.b64_json : "",
          url: typeof item?.url === "string" ? item.url : "",
          extension: "png",
          metadata: request.metadata || {}
        })).filter(item => item.b64_json || item.url);
      }
      if (!images.length) throw new Error("image response did not contain a usable image");
      return { ok: true, provider: this.provider, model, endpoint, size, images, attempts: [attempt] };
    } catch (error) {
      attempt.error = redactSecret(error?.message || String(error), this.apiKey);
      return { ok: false, provider: this.provider, model, endpoint, size, images: [], attempts: [attempt], error: attempt.error };
    }
  }
}
