import { ensureP1FDirs, ensureSampleFixtures, fixturePath, reportPath, writeJson, postJson, uploadFile, assert, assertNoBadText } from "./p1f-utils.mjs";

ensureP1FDirs();
ensureSampleFixtures();

const prompt = "帮我做一份 AI 数字产教融合平台项目汇报 PPT，面向高校领导，要求政务、清晰、可落地。";
const upload = await uploadFile(fixturePath("sample.docx"));
assert(upload.ok, `upload failed ${upload.status} ${upload.text}`);
assert(upload.json?.analysis?.blockCount >= 1, "sample.docx did not parse");

const searchResponse = await postJson("/api/search-materials", {
  queries: ["AI 数字产教融合平台 政策 领导 汇报 验收标准", "AI 数字产教融合 平台 项目汇报 高校 领导"]
});

const generated = await postJson("/api/generate-ppt", {
  prompt,
  mode: "agent",
  uploadedFile: {
    name: upload.json.fileName,
    size: upload.json.size,
    type: upload.json.type,
    analysis: upload.json.analysis
  },
  researchSources: searchResponse.ok ? searchResponse.json.groups : []
});

assert(generated.ok, `generate failed: ${generated.status} ${generated.text}`);
const json = generated.json;
const project = json.project;
assert(project, "missing project");
assert(project.reviewCenter, "missing reviewCenter");
assert(project.contentPlan, "missing contentPlan");
assert(project.slidePagePlans, "missing slidePagePlans");
assert(project.layoutPlans, "missing layoutPlans");
assert(project.sourceDocuments, "missing sourceDocuments");
assert(project.evidenceBlocks, "missing evidenceBlocks");
assert(project.evidenceNeeds, "missing evidenceNeeds");
assert(project.slideEvidenceMaps, "missing slideEvidenceMaps");
assert(project.evidenceReport, "missing evidenceReport");
assert(project.deckSpec, "missing deckSpec");
assert(Array.isArray(project.deckSpec.slideSpecs) && project.deckSpec.slideSpecs.length >= 8, "slideSpecs too few");

const sourceTypes = [...new Set((project.sourceDocuments || []).map((item) => item.sourceType))];
const report = {
  passed: true,
  checkedAt: new Date().toISOString(),
  acquisitionStatus: project.acquisitionReport?.searchStatus,
  sourceTypes,
  evidenceCoverage: project.evidenceReport?.averageCoverage,
  blockingIssues: project.evidenceReport?.blockingIssues,
  searchApiStatus: searchResponse.ok ? searchResponse.json.status : null,
  searchApiProvider: searchResponse.ok ? searchResponse.json.provider : null,
  reviewType: project.reviewCenter?.pptType,
  pageRoles: project.reviewCenter?.planningAudit?.pageRoles?.map((page) => ({
    title: page.title,
    role: page.role,
    mustProve: page.mustProve
  })),
  slideEvidenceMaps: (project.slideEvidenceMaps || []).slice(0, 4).map((item) => ({
    role: item.role,
    evidenceCoverage: item.evidenceCoverage,
    sourceConfidence: item.sourceConfidence,
    unsupportedClaims: item.unsupportedClaims
  }))
};

assertNoBadText("evidence-chain project", JSON.stringify(report));
writeJson(reportPath("evidence-chain-regression.json"), report);
console.log(JSON.stringify(report, null, 2));
