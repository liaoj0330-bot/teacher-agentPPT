const BASE_URL = process.env.VISUAL_EXPORT_BASE_URL || "http://127.0.0.1:3002";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function postJson(pathname, body) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { response, text, data };
}

function visualDataUri(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e9f5ff"/>
        <stop offset="0.55" stop-color="#f7fbf5"/>
        <stop offset="1" stop-color="#e9e7ff"/>
      </linearGradient>
    </defs>
    <rect width="1024" height="1024" fill="url(#g)"/>
    <circle cx="760" cy="260" r="155" fill="#9fd3ff" opacity="0.55"/>
    <circle cx="330" cy="700" r="210" fill="#b8f1d5" opacity="0.62"/>
    <rect x="180" y="260" width="640" height="420" rx="54" fill="#ffffff" opacity="0.72"/>
    <path d="M245 585 C390 420 470 682 614 496 C700 386 772 440 842 342" fill="none" stroke="#2563eb" stroke-width="28" stroke-linecap="round" opacity="0.72"/>
    <text x="512" y="780" text-anchor="middle" font-family="Arial" font-size="42" fill="#101828">${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

const health = await fetch(`${BASE_URL}/api/health-ai`).then((response) => response.json());
assert(health?.image?.configured === true, "image API is not configured in health endpoint");

const generated = await postJson("/api/generate-ppt", {
  prompt: "帮我做一份北京 5 日深度游攻略 PPT，包含每日路线、预约避坑、交通建议、美食和预算。",
  mode: "agent",
  forceLocal: true
});
assert(generated.response.ok, `generate failed ${generated.response.status}: ${generated.text}`);
const project = generated.data?.project;
assert(project?.slides?.length >= 8, "travel project did not generate enough slides");

const visuals = {
  cover: visualDataUri("cover visual"),
  slides: {
    1: visualDataUri("route visual"),
    [project.slides[1]?.id || "slide-1"]: visualDataUri("route visual")
  }
};

const exported = await fetch(`${BASE_URL}/api/export-pptx`, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ project, visuals })
});
const buffer = Buffer.from(await exported.arrayBuffer());
assert(exported.ok, `export with visuals failed ${exported.status}: ${buffer.toString("utf8").slice(0, 300)}`);
assert(buffer.length > 100000, `exported pptx is unexpectedly small: ${buffer.length}`);

console.log(JSON.stringify({
  passed: true,
  checkedAt: new Date().toISOString(),
  imageHealth: health.image,
  slides: project.slides.length,
  outputBytes: buffer.length,
  visualKeys: Object.keys(visuals.slides).length + 1
}, null, 2));

process.exit(0);
