import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(
  process.env.OUTPUT_DIR || "D:/tmp/sandun-replica/teacher-image2-acceptance",
);
const prompts = [
  {
    id: "cover",
    title: "10以内加减法",
    slideRole: "cover",
    prompt:
      "小学一年级数学课堂，明亮现代教室，桌面上整齐摆放十个彩色计数方块，孩子们正在用方块探索加法，真实教育摄影感，16:9构图，不要文字、数字、公式、水印或Logo",
  },
  {
    id: "lead-in",
    title: "生活中的加减法",
    slideRole: "lead_in",
    prompt:
      "儿童文具商店场景，两组颜色不同的铅笔和橡皮整齐陈列，物品数量清楚可数，适合小学数学课堂观察，不要文字、数字、价格标签、公式、水印或Logo",
  },
  {
    id: "practice",
    title: "动手摆一摆",
    slideRole: "practice",
    prompt:
      "俯拍儿童双手操作彩色积木和圆形计数片，浅色桌面，分组关系清晰，适合小学一年级课堂练习，不要文字、数字、公式、答案、水印或Logo",
  },
];

fs.mkdirSync(outputDir, { recursive: true });

function decodeImage(dataUrl) {
  const match = /^data:image\/(png|jpeg);base64,(.+)$/s.exec(dataUrl || "");
  if (!match) throw new Error("response is not an inline PNG/JPEG image");
  return { extension: match[1] === "jpeg" ? "jpg" : "png", bytes: Buffer.from(match[2], "base64") };
}

async function generate(item) {
  const startedAt = Date.now();
  const response = await fetch(`${base}/api/generate-image`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      context: "teacher_courseware",
      title: item.title,
      slideRole: item.slideRole,
      prompt: item.prompt,
      size: "1024x1024",
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      id: item.id,
      ok: false,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      error: payload?.message || payload?.error || "unknown image error",
    };
  }
  const image = decodeImage(payload?.image);
  if (image.bytes.length < 20_000) throw new Error(`${item.id} image is unexpectedly small`);
  const signatureOk = image.extension === "png"
    ? image.bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : image.bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (!signatureOk) throw new Error(`${item.id} image signature is invalid`);
  const fileName = `${item.id}.${image.extension}`;
  fs.writeFileSync(path.join(outputDir, fileName), image.bytes);
  return {
    id: item.id,
    ok: true,
    status: response.status,
    model: payload.model,
    provider: payload.provider,
    transport: payload.transport,
    upstreamElapsedMs: payload.elapsedMs,
    totalElapsedMs: Date.now() - startedAt,
    attempts: payload.attempts,
    bytes: image.bytes.length,
    fileName,
  };
}

const startedAt = Date.now();
const results = await Promise.all(prompts.map((item) => generate(item)));
const succeeded = results.filter((item) => item.ok).length;
const report = {
  pass:
    succeeded === prompts.length &&
    results.every(
      (item) =>
        item.model === "gpt-image-2" &&
        item.provider === "openai-compatible" &&
        item.transport === "sse",
    ),
  checkedAt: new Date().toISOString(),
  base,
  concurrency: prompts.length,
  succeeded,
  failed: prompts.length - succeeded,
  successRate: `${Math.round((succeeded / prompts.length) * 100)}%`,
  wallClockMs: Date.now() - startedAt,
  results,
};
fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
