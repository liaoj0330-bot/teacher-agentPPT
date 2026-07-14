const BASE_URL = process.env.WORKSPACE_SMOKE_BASE_URL || "http://127.0.0.1:3002";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getText(pathname) {
  const response = await fetch(`${BASE_URL}${pathname}`);
  const text = await response.text();
  assert(response.ok, `${pathname} returned ${response.status}: ${text.slice(0, 240)}`);
  return text;
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
  assert(response.ok, `${pathname} returned ${response.status}: ${text.slice(0, 500)}`);
  return data;
}

const html = await getText("/");
assert(html.includes("AI PPT Agent"), "homepage missing product name");
assert(html.includes("画布式 PPT Agent") || html.includes("PPT"), "homepage missing workbench signal");

const prompt = "帮我做一份 AI 数字产教融合平台项目汇报 PPT，面向高校领导，要求政务、清晰、可落地，必须包含验收标准和下一步动作。";

const generated = await postJson("/api/generate-ppt", {
  prompt,
  mode: "agent",
  forceLocal: true,
  disablePublicSearch: true
});

const project = generated.project;
assert(project?.slides?.length >= 8, `expected at least 8 slides, got ${project?.slides?.length}`);
assert(project.reviewCenter?.pptType === "project_report", `expected project_report, got ${project.reviewCenter?.pptType}`);
assert(project.reviewCenter?.planningAudit?.pageRoles?.some((page) => /验收/.test(`${page.title} ${page.role}`)), "planning audit missing acceptance page role");
assert(project.reviewCenter?.postReview?.totalScore !== undefined, "post review score missing");

const fixed = await postJson("/api/review-center", {
  action: "apply-fixes",
  project,
  reviewCenter: project.reviewCenter
});

assert(fixed.summary, "apply-fixes missing summary");
assert(typeof fixed.summary.beforeScore === "number", "summary missing beforeScore");
assert(typeof fixed.summary.afterScore === "number", "summary missing afterScore");
assert(["improved", "partial", "needs_sources", "no_change"].includes(fixed.summary.status), `invalid fix status ${fixed.summary.status}`);
assert(Array.isArray(fixed.summary.unresolvedBlockers), "summary missing unresolved blockers");

console.log(JSON.stringify({
  passed: true,
  checkedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  homepage: {
    bytes: html.length,
    hasProductName: html.includes("AI PPT Agent")
  },
  generation: {
    provider: generated.provider,
    pptType: project.reviewCenter.pptType,
    slides: project.slides.length,
    score: project.reviewCenter.postReview.totalScore
  },
  reviewFix: {
    status: fixed.summary.status,
    beforeScore: fixed.summary.beforeScore,
    afterScore: fixed.summary.afterScore,
    appliedCount: fixed.summary.appliedCount,
    unresolvedCount: fixed.summary.unresolvedCount,
    firstBlocker: fixed.summary.unresolvedBlockers[0]?.where || ""
  }
}, null, 2));
