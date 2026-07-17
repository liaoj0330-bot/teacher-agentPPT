import fs from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-full-lesson-samples/visual-assets");
const size = process.env.IMAGE_SIZE || "1024x1024";
const quality = process.env.IMAGE_QUALITY || "low";
const concurrency = Math.max(1, Math.min(3, Number(process.env.IMAGE_CONCURRENCY || "3")));

const providers = [
  { name: "primary", baseUrl: process.env.IMAGE_PRIMARY_BASE_URL, apiKey: process.env.IMAGE_PRIMARY_API_KEY },
  { name: "fallback", baseUrl: process.env.IMAGE_FALLBACK_BASE_URL, apiKey: process.env.IMAGE_FALLBACK_API_KEY },
].filter((item) => item.baseUrl && item.apiKey);

if (!providers.length) throw new Error("No image provider is configured");

const assets = [
  {
    id: "physics-cover-lab",
    subject: "physics",
    slide: 1,
    prompt: "Use case: scientific-educational. Asset type: 16:9 high school physics PPT key visual. A bright Chinese high school physics laboratory, a bar magnet, copper coil and sensitive galvanometer arranged clearly on a clean demonstration table, realistic educational photography, calm blue and neutral palette, strong depth, generous clean space on the left for slide title. No readable text, no labels, no formulas, no arrows, no watermark, no logo.",
  },
  {
    id: "physics-apparatus-closeup",
    subject: "physics",
    slide: 3,
    prompt: "Use case: scientific-educational. Asset type: classroom observation visual. Close-up of a real electromagnetic induction experiment: bar magnet aligned with a copper coil connected to an analog galvanometer, hands just outside the apparatus, crisp components and natural classroom light, documentary educational photography, horizontal composition. Show only observable equipment; no directional arrows, no labels, no formulas, no text, no watermark, no logo.",
  },
  {
    id: "physics-student-inquiry",
    subject: "physics",
    slide: 10,
    prompt: "Use case: photorealistic-natural. Asset type: high school physics PPT classroom activity visual. Four Chinese high school students collaborating around a magnet, coil and galvanometer experiment, one student operates the magnet while others observe and record, authentic modern classroom, focused expressions, realistic educational photography, wide horizontal framing. No readable writing, no formulas, no text, no watermark, no logo.",
  },
  {
    id: "physics-transfer-braking",
    subject: "physics",
    slide: 15,
    prompt: "Use case: scientific-educational. Asset type: physics transfer application visual. A modern train braking system inspection scene highlighting metal wheel and electromagnetic braking hardware, realistic industrial educational photography, safe clean composition, subtle motion context, horizontal 16:9 framing. No labels, no arrows, no diagrams, no text, no watermark, no logo.",
  },
  {
    id: "chinese-cover-station",
    subject: "chinese",
    slide: 1,
    prompt: "Use case: historical-scene. Asset type: 16:9 Chinese literature PPT key visual. A historically plausible early twentieth-century Chinese railway station platform in winter, a departing steam train, an older father and young son seen from behind at a respectful distance, restrained emotion, documentary cinematic realism, muted charcoal with warm amber accents, generous clean space for title. No text, no signs with readable writing, no watermark, no logo.",
  },
  {
    id: "chinese-father-platform",
    subject: "chinese",
    slide: 8,
    prompt: "Use case: historical-scene. Asset type: close reading visual for Zhu Ziqing's Back View. An older Chinese father in a dark cotton robe and black cloth cap carefully climbing from the railway tracks toward a platform while carrying a small bag of oranges, viewed mainly from behind, early twentieth-century setting, physically believable effort, restrained and humane cinematic realism, horizontal framing. No text, no watermark, no logo.",
  },
  {
    id: "chinese-detail-oranges",
    subject: "chinese",
    slide: 11,
    prompt: "Use case: illustration-story. Asset type: Chinese literature detail-reading visual. Close cinematic detail of weathered hands holding several oranges against the sleeve of a dark cotton robe on an old railway platform, tactile cloth and fruit textures, quiet fatherly care, shallow depth of field, restrained historical realism, horizontal composition. No face close-up, no text, no watermark, no logo.",
  },
  {
    id: "chinese-life-transfer",
    subject: "chinese",
    slide: 16,
    prompt: "Use case: photorealistic-natural. Asset type: Chinese writing-transfer classroom visual. A contemporary Chinese teenager at a station quietly watching a parent's back as the parent carries luggage ahead, an ordinary small act of care, natural evening light, emotionally restrained documentary photography, wide horizontal composition with clean space. No readable signs, no text, no watermark, no logo.",
  },
];

async function requestImage(provider, asset) {
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/v1/images/generations`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${provider.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "gpt-image-2", prompt: asset.prompt, size, quality, n: 1 }),
    signal: AbortSignal.timeout(360_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.data?.[0]) {
    const message = payload?.error?.message || `HTTP ${response.status}`;
    throw new Error(`${provider.name}: ${message}`);
  }
  const item = payload.data[0];
  if (item.b64_json) return { bytes: Buffer.from(item.b64_json, "base64"), provider: provider.name };
  if (item.url) {
    const download = await fetch(item.url, { signal: AbortSignal.timeout(120_000) });
    if (!download.ok) throw new Error(`${provider.name}: image download HTTP ${download.status}`);
    return { bytes: Buffer.from(await download.arrayBuffer()), provider: provider.name };
  }
  throw new Error(`${provider.name}: response contained no image`);
}

async function generate(asset) {
  const target = path.join(outputDir, asset.subject, `${asset.id}.png`);
  try {
    const existing = await fs.stat(target);
    if (existing.size > 10_000) return { ...asset, target, bytes: existing.size, provider: "existing", skipped: true };
  } catch {}

  const errors = [];
  for (const provider of providers) {
    try {
      const result = await requestImage(provider, asset);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, result.bytes);
      return { ...asset, target, bytes: result.bytes.length, provider: result.provider, skipped: false };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`${asset.id}: ${errors.join(" | ")}`);
}

await fs.mkdir(outputDir, { recursive: true });
const results = [];
let cursor = 0;
async function worker() {
  while (cursor < assets.length) {
    const asset = assets[cursor];
    cursor += 1;
    const result = await generate(asset);
    results.push(result);
    console.log(JSON.stringify({ id: result.id, provider: result.provider, bytes: result.bytes, skipped: result.skipped }));
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
results.sort((a, b) => assets.findIndex((item) => item.id === a.id) - assets.findIndex((item) => item.id === b.id));
await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), size, quality, results }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ pass: true, outputDir, count: results.length, providers: [...new Set(results.map((item) => item.provider))] }, null, 2));
