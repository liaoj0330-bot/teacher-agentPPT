import { basename } from "node:path";
import { ImageProvider, maskSecret, redactSecret } from "./ImageProvider.mjs";

function normalizeBaseUrl(value) {
  return String(value || "https://pinchuanapi.tech").replace(/\/$/, "");
}

async function readResponse(response, apiKey) {
  const text = await response.text().catch(() => "");
  const redacted = redactSecret(text, apiKey);
  try {
    return { json: JSON.parse(text), text: redacted.slice(0, 2000) };
  } catch {
    return { json: null, text: redacted.slice(0, 2000) };
  }
}

function extractModels(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return data.map(item => typeof item === "string" ? item : String(item?.id || item?.name || "")).filter(Boolean);
}

function pickImageModel(models, configuredModel) {
  if (configuredModel) return configuredModel;
  return models.find(id => /image|gpt-image|dall|flux|stable|sd/i.test(id)) || "gpt-image-1";
}

function imageExtensionFromUrl(url) {
  const name = basename(String(url || "").split("?")[0] || "");
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return ["png", "jpg", "jpeg", "webp"].includes(ext) ? ext : "png";
}

export class PinchuanImageProvider extends ImageProvider {
  constructor(options = {}) {
    super();
    this.provider = "pinchuan";
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.apiKey = String(options.apiKey || "");
    this.model = String(options.model || "");
    this.endpoint = String(options.endpoint || "/v1/images/generations");
    this.timeoutMs = Number(options.timeoutMs || 120000);
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
      model: this.model
    };
  }

  headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "x-api-key": this.apiKey
    };
  }

  async probe() {
    const result = {
      ...this.safeConfig(),
      generated_at: new Date().toISOString(),
      health: { attempted: false, ok: false },
      models: { attempted: false, available: false, model_ids: [] }
    };

    if (!this.apiKey) {
      result.error = "PINCHUAN_API_KEY is not configured";
      return result;
    }

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(15000)
      });
      const body = await readResponse(response, this.apiKey);
      result.health = {
        attempted: true,
        ok: response.ok,
        status: response.status,
        body: body.json || body.text
      };
    } catch (error) {
      result.health = {
        attempted: true,
        ok: false,
        error: redactSecret(error?.message || String(error), this.apiKey)
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(25000)
      });
      const body = await readResponse(response, this.apiKey);
      const ids = extractModels(body.json);
      result.models = {
        attempted: true,
        available: response.ok,
        status: response.status,
        model_ids: ids,
        error: response.ok ? "" : body.text
      };
      if (!this.model) this.model = pickImageModel(ids, this.model);
      result.model = this.model;
    } catch (error) {
      result.models = {
        attempted: true,
        available: false,
        model_ids: [],
        error: redactSecret(error?.message || String(error), this.apiKey)
      };
    }

    return result;
  }

  async generateImage(request) {
    if (!this.apiKey) {
      return { ok: false, images: [], error: "PINCHUAN_API_KEY is not configured" };
    }

    const model = String(request.model || this.model || "gpt-image-1");
    const size = String(request.size || "1536x1024");
    const n = Number(request.n || 1);
    const allowFallbacks = request.allowFallbacks !== false && request.skipFallbacks !== true;
    const primaryEndpoint = String(request.endpoint || this.endpoint || "/v1/images/generations");
    const endpoints = allowFallbacks
      ? Array.from(new Set([primaryEndpoint, "/v1/images/generations", "/images/generations"]))
      : [primaryEndpoint];
    const responseFormats = allowFallbacks
      ? (request.response_format ? [request.response_format] : [undefined, "b64_json"])
      : [request.response_format || "b64_json"];
    const attempts = [];

    for (const endpoint of endpoints) {
      for (const responseFormat of responseFormats) {
        const body = {
          model,
          prompt: request.prompt,
          size,
          n
        };
        if (responseFormat) body.response_format = responseFormat;
        try {
          const response = await fetch(`${this.baseUrl}${endpoint}`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeoutMs)
          });
          const payload = await readResponse(response, this.apiKey);
          const attempt = {
            endpoint,
            response_format: responseFormat || "omitted",
            status: response.status,
            ok: response.ok,
            error: response.ok ? "" : payload.text
          };
          attempts.push(attempt);
          if (!response.ok) continue;
          const data = Array.isArray(payload.json?.data) ? payload.json.data : [];
          const images = data.map((item, index) => ({
            image_id: String(item?.id || request.image_id || `generated_image_${String(index + 1).padStart(3, "0")}`),
            b64_json: typeof item?.b64_json === "string" ? item.b64_json : "",
            url: typeof item?.url === "string" ? item.url : "",
            extension: item?.url ? imageExtensionFromUrl(item.url) : "png",
            metadata: request.metadata || {}
          })).filter(item => item.b64_json || item.url);
          if (images.length) {
            return { ok: true, provider: this.provider, model, endpoint, size, images, attempts };
          }
          attempts.push({ endpoint, status: response.status, ok: false, error: "empty image response" });
        } catch (error) {
          attempts.push({
            endpoint,
            response_format: responseFormat || "omitted",
            status: 0,
            ok: false,
            error: redactSecret(error?.message || String(error), this.apiKey)
          });
        }
      }
    }

    return {
      ok: false,
      provider: this.provider,
      model,
      endpoint: endpoints[0],
      size,
      images: [],
      attempts,
      error: attempts[attempts.length - 1]?.error || "image generation failed"
    };
  }
}
