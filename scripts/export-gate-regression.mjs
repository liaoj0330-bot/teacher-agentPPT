const BASE_URL = process.env.EXPORT_GATE_BASE_URL || "http://127.0.0.1:3002";

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

const prompt = "帮我做一份 AI 数字产教融合平台项目汇报 PPT，面向高校领导，要求政务、清晰、可落地，必须包含政策依据、平台架构、三端功能、验收标准和推进计划。";

const generated = await postJson("/api/generate-ppt", {
  prompt,
  mode: "agent",
  forceLocal: true
});
assert(generated.response.ok, `generate failed ${generated.response.status}: ${generated.text}`);
const project = generated.data?.project;
assert(project?.reviewCenter?.pptType === "project_report", "project report type detection failed");

const blockedProject = JSON.parse(JSON.stringify(project));
blockedProject.sourceDocuments = [];
blockedProject.evidenceBlocks = [];
blockedProject.evidenceNeeds = [];
blockedProject.slideEvidenceMaps = [];
blockedProject.evidenceReport = undefined;
blockedProject.reviewCenter = {
  ...blockedProject.reviewCenter,
  evidenceReport: undefined,
  slideEvidenceMaps: []
};
blockedProject.deckSpec = {
  ...blockedProject.deckSpec,
  slideSpecs: (blockedProject.deckSpec?.slideSpecs || []).map((spec) => ({
    ...spec,
    evidenceCoverage: 0,
    sourceConfidence: 0,
    matchedEvidenceBlocks: []
  }))
};

const exported = await postJson("/api/export-pptx", { project: blockedProject });
assert(exported.response.status === 422, `expected export gate 422, got ${exported.response.status}`);
const body = exported.data;
assert(body?.message === "导出前质量闸门未通过", "missing export gate message");
assert(body?.explanation?.headline, "missing explanation headline");
assert(body?.explanation?.summary, "missing explanation summary");
assert(typeof body.explanation.blockingCount === "number" && body.explanation.blockingCount > 0, "missing blocking count");
assert(Array.isArray(body.explanation.topActions) && body.explanation.topActions.length > 0, "missing top actions");
assert(body.explanation.primaryIssue?.title || body.issues?.[0]?.title, "missing primary issue");
assert(/证据|来源|DeckEvidenceReport|质量闸门|缺少/.test(JSON.stringify(body)), "export gate explanation is not actionable enough");

console.log(JSON.stringify({
  passed: true,
  checkedAt: new Date().toISOString(),
  status: exported.response.status,
  headline: body.explanation.headline,
  summary: body.explanation.summary,
  blockingCount: body.explanation.blockingCount,
  topActions: body.explanation.topActions.slice(0, 3)
}, null, 2));
