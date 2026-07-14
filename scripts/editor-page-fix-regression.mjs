const BASE_URL = process.env.EDITOR_PAGE_FIX_BASE_URL || "http://127.0.0.1:3002";

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
  assert(response.ok, `${pathname} failed ${response.status}: ${text}`);
  return data;
}

const prompt = "帮我做一份 AI 数字产教融合平台项目汇报 PPT，面向高校领导，要求政务、清晰、可落地，必须包含政策依据、平台架构、三端功能、验收标准和推进计划。";
const generated = await postJson("/api/generate-ppt", { prompt, mode: "agent", forceLocal: true });
const project = generated.project;
assert(project?.slides?.length >= 3, "generated project has too few slides");
assert(project.reviewCenter?.pptType === "project_report", "expected project_report review center");

const targetIndex = 1;
const targetSlide = project.slides[targetIndex];
project.slides[targetIndex] = {
  ...targetSlide,
  title: "这是一个特别特别长的页面标题，用来模拟导出前标题超长、页面结论不清晰、需要被压缩处理的坏页面",
  subtitle: "这一页被测试脚本故意改坏，用于验证当前页修复是否真的会修改数据。",
  bullets: [
    "背景很多但没有结论",
    "意义很多但没有证据",
    "方案很多但没有责任",
    "目标很多但没有指标",
    "计划很多但没有时间",
    "风险很多但没有预案",
    "内容很多但没有结构"
  ],
  sections: [],
  sourceIds: []
};

const reviewState = { ...project.reviewCenter };
delete reviewState.postReview;

const reviewed = await postJson("/api/review-center", {
  action: "review",
  project,
  reviewCenter: reviewState
});
assert(reviewed.reviewCenter?.postReview?.deductions?.length > 0, "review did not create deductions");

const fixed = await postJson("/api/review-center", {
  action: "apply-page-fixes",
  project: reviewed.project,
  reviewCenter: reviewed.reviewCenter,
  pageIndex: targetIndex,
  slideId: reviewed.project.slides[targetIndex].id
});

const summary = fixed.summary;
const fixedSlide = fixed.project.slides[targetIndex];
assert(summary, "missing page fix summary");
assert(summary.page === targetIndex + 1, "summary page mismatch");
assert(summary.status !== "no_page_fix", `expected a real page fix, got ${summary.status}`);
assert(Array.isArray(summary.applied) && summary.applied.length > 0, "page fix did not report applied changes");
assert(fixed.reviewCenter?.lastPageFixSummary?.page === targetIndex + 1, "lastPageFixSummary not persisted");
assert((fixedSlide.sections || []).length > 0, "page fix did not add structured sections");
assert((fixedSlide.bullets || []).length <= 5, "page fix did not reduce dense bullets");

console.log(JSON.stringify({
  passed: true,
  checkedAt: new Date().toISOString(),
  page: summary.page,
  status: summary.status,
  beforePageScore: summary.beforePageScore,
  afterPageScore: summary.afterPageScore,
  applied: summary.applied.slice(0, 4),
  remainingPageDeductions: summary.remainingPageDeductions
}, null, 2));
