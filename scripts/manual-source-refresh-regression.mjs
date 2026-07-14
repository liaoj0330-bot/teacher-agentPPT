const BASE_URL = process.env.MANUAL_SOURCE_BASE_URL || "http://127.0.0.1:3002";

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
assert(project?.reviewCenter, "missing review center");
const beforeRealSources = project.sourceDocuments?.filter((source) => source.sourceType === "search_result" && source.url).length || 0;
const beforeCoverage = project.evidenceReport?.averageCoverage || 0;
const beforeScore = project.reviewCenter?.postReview?.totalScore || 0;

const refresh = await postJson("/api/review-center", {
  action: "add-sources",
  project,
  reviewCenter: project.reviewCenter,
  sources: [
    {
      title: "教育部职业教育数字化战略行动公开资料",
      url: "https://www.moe.gov.cn/",
      summary: "教育数字化、职业教育产教融合、平台建设、校企协同、教学资源、实训基地、数据治理、验收指标、推进计划。"
    },
    {
      title: "国家职业教育政策与产教融合项目建设说明",
      url: "https://www.gov.cn/",
      summary: "项目汇报需要说明政策依据、建设必要性、平台架构、校端教师端企业端协同、阶段实施路径、责任分工和验收标准。"
    }
  ]
});

assert(refresh.response.ok, `manual source refresh failed ${refresh.response.status}: ${refresh.text}`);
const nextProject = refresh.data?.project;
const summary = refresh.data?.summary;
assert(nextProject?.reviewCenter, "missing refreshed review center");
assert(summary?.addedSources === 2, "manual sources were not accepted");

const afterRealSources = nextProject.sourceDocuments?.filter((source) => source.sourceType === "search_result" && source.url).length || 0;
const afterCoverage = nextProject.evidenceReport?.averageCoverage || 0;
const afterScore = nextProject.reviewCenter?.postReview?.totalScore || 0;
const afterBlocks = nextProject.evidenceBlocks?.length || 0;

assert(afterRealSources >= beforeRealSources + 2, `real sources did not increase enough: ${beforeRealSources} -> ${afterRealSources}`);
assert(afterBlocks > 0, "evidence blocks were not rebuilt");
assert(nextProject.slideEvidenceMaps?.length > 0, "slide evidence maps were not rebuilt");
assert(afterCoverage >= beforeCoverage, `evidence coverage regressed: ${beforeCoverage} -> ${afterCoverage}`);
assert(afterScore >= beforeScore, `review score regressed: ${beforeScore} -> ${afterScore}`);
assert(nextProject.deckSpec?.slideSpecs?.some((spec) => (spec.evidenceSourceIds || []).length > 0), "deck spec did not receive evidence source ids");

console.log(JSON.stringify({
  passed: true,
  checkedAt: new Date().toISOString(),
  before: {
    score: beforeScore,
    realSources: beforeRealSources,
    coverage: beforeCoverage
  },
  after: {
    score: afterScore,
    realSources: afterRealSources,
    coverage: afterCoverage,
    evidenceBlocks: afterBlocks
  },
  summary
}, null, 2));
