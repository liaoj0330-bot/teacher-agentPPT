import fs from "node:fs";
import { ensureP1FDirs, ensureSampleFixtures, fixturePath, exportPath, postJson, uploadFile, assert, writeText, writeJson, assertNoBadText, fetchBinary } from "./p1f-utils.mjs";

ensureP1FDirs();
ensureSampleFixtures();

const realSearchEnabled = String(process.env.REAL_SEARCH_ENABLED || "false").toLowerCase() === "true";
const hasProviderKey = Boolean(process.env.TAVILY_API_KEY || process.env.SERPER_API_KEY || process.env.BRAVE_SEARCH_API_KEY || process.env.BING_SEARCH_API_KEY);

const prompt = "帮我做一份北京一日游 PPT，面向第一次来北京的游客，要求路线可执行、预算清楚、要有真实来源。";
const report = {
  checkedAt: new Date().toISOString(),
  realSearchEnabled,
  hasProviderKey,
  providerStatus: "SKIPPED_PROVIDER_UNCONFIGURED",
  uploadStatus: null,
  generationStatus: null,
  exportStatus: null,
  exportFile: "",
  notes: []
};

const upload = await uploadFile(fixturePath("sample.txt"));
assert(upload.ok, `upload failed ${upload.status} ${upload.text}`);
report.uploadStatus = upload.json?.status || "failed";
assert(upload.json?.analysis?.blockCount >= 1, "upload parse produced no blocks");

const search = await postJson("/api/search-materials", {
  queries: ["北京一日游 故宫 天安门 官方 预约 交通", "北京 旅游 官方 预约 规则 一日游"]
});
assert(search.ok, `search failed ${search.status} ${search.text}`);
if (realSearchEnabled && hasProviderKey) {
  report.providerStatus = search.json.status === "ok" ? "REAL_PROVIDER_OK" : "REAL_PROVIDER_FAILED";
} else {
  report.providerStatus = "SKIPPED_PROVIDER_UNCONFIGURED";
}

const generated = await postJson("/api/generate-ppt", {
  prompt,
  mode: "agent",
  uploadedFile: {
    name: upload.json.fileName,
    size: upload.json.size,
    type: upload.json.type,
    analysis: upload.json.analysis
  },
  researchSources: search.json.groups || []
});
assert(generated.ok, `generate failed ${generated.status} ${generated.text}`);
report.generationStatus = generated.json.status;
const project = generated.json.project;
assert(project, "missing project");

const exportResponse = await postJson("/api/export-pptx", { project });
if (exportResponse.ok) {
  const output = exportPath("beijing-1day-e2e.pptx");
  const exportBinary = await fetchBinary(`${process.env.APP_BASE_URL || "http://localhost:3002"}/api/export-pptx`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ project })
  });
  assert(exportBinary.ok, `binary export failed ${exportBinary.status}`);
  fs.writeFileSync(output, exportBinary.buffer);
  report.exportStatus = "ok";
  report.exportFile = output;
  assert(exportBinary.buffer.length > 25000, "pptx too small");
} else {
  report.exportStatus = "blocked";
  report.exportFile = "";
  assert(/质量闸门|真实来源|证据|缺少|blocking/i.test(exportResponse.text), "export blocked for unexpected reason");
}

assertNoBadText("real-e2e report", JSON.stringify(report));
writeJson("test-results/p1-f/real-e2e-report.json", report);
writeText("test-results/p1-f/real-e2e-report.md", `# P1-F Real E2E\n\n${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
