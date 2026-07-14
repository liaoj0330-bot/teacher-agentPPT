const BASE_URL = process.env.MODE_ROUTING_BASE_URL || "http://127.0.0.1:3002";

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

const cases = [
  { fileName: "old-deck.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", expected: "beautify" },
  { fileName: "report.pdf", mimeType: "application/pdf", expected: "reference" },
  { fileName: "requirements.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", expected: "reference" },
  { fileName: "notes.txt", mimeType: "text/plain", expected: "reference" }
];

for (const item of cases) {
  const result = await postJson("/api/mode-detect", item);
  assert(result.response.ok, `mode detect failed ${result.response.status}: ${result.text}`);
  assert(result.data?.mode === item.expected, `${item.fileName} expected ${item.expected}, got ${result.data?.mode}`);
  assert(result.data?.contract?.label, `missing mode contract for ${item.fileName}`);
}

const agent = await postJson("/api/generate-ppt", {
  prompt: "帮我做一份 AI 数字产教融合平台项目汇报 PPT，面向高校领导，要求清晰、可落地。",
  mode: "agent",
  forceLocal: true
});
assert(agent.response.ok, `agent generate failed ${agent.response.status}: ${agent.text}`);
assert(agent.data?.project?.mode === "agent", `agent mode not preserved: ${agent.data?.project?.mode}`);

const reference = await postJson("/api/generate-ppt", {
  prompt: "根据上传资料生成一份项目汇报 PPT。",
  mode: "reference",
  forceLocal: true,
  uploadedFile: {
    name: "report.pdf",
    size: 1024,
    type: "PDF",
    mimeType: "application/pdf",
    status: "uploaded",
    analysis: {
      fileName: "report.pdf",
      sourceKind: "pdf",
      blockCount: 2,
      imageCount: 0,
      tableCount: 0,
      summary: "政策依据、平台架构、三端功能、验收标准和推进计划。",
      outlineSuggestions: ["政策依据", "平台架构", "验收标准"],
      pages: [],
      blocks: []
    }
  }
});
assert(reference.response.ok, `reference generate failed ${reference.response.status}: ${reference.text}`);
assert(reference.data?.project?.mode === "reference", `reference mode not preserved: ${reference.data?.project?.mode}`);

const beautify = await postJson("/api/generate-ppt", {
  prompt: "美化上传的 PPT，统一视觉风格并提升页面层级。",
  mode: "beautify",
  forceLocal: true,
  uploadedFile: {
    name: "old-deck.pptx",
    size: 2048,
    type: "PPTX",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    status: "uploaded",
    analysis: {
      fileName: "old-deck.pptx",
      sourceKind: "pptx",
      blockCount: 2,
      imageCount: 1,
      tableCount: 0,
      summary: "原稿包含封面、方案介绍和总结页，需要重排版。",
      outlineSuggestions: ["保留结构", "重排版", "统一风格"],
      pages: [],
      blocks: []
    }
  }
});
assert(beautify.response.ok, `beautify generate failed ${beautify.response.status}: ${beautify.text}`);
assert(beautify.data?.project?.mode === "beautify", `beautify mode not preserved: ${beautify.data?.project?.mode}`);

console.log(JSON.stringify({
  passed: true,
  checkedAt: new Date().toISOString(),
  detections: cases.map((item) => ({ fileName: item.fileName, expected: item.expected })),
  generatedModes: {
    agent: agent.data.project.mode,
    reference: reference.data.project.mode,
    beautify: beautify.data.project.mode
  }
}, null, 2));

process.exit(0);
