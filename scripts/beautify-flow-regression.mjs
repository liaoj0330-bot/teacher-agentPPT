const BASE_URL = process.env.BEAUTIFY_FLOW_BASE_URL || "http://127.0.0.1:3002";

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
  if (!response.ok) {
    throw new Error(`${pathname} ${response.status}: ${text}`);
  }
  return data;
}

const uploadedFile = {
  name: "企业介绍原稿.pptx",
  size: 409600,
  type: "PPTX",
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  status: "uploaded",
  analysis: {
    fileName: "企业介绍原稿.pptx",
    fileType: "pptx",
    sourceKind: "pptx",
    pageCount: 5,
    blockCount: 18,
    summary: "原稿包含封面、目录、公司介绍、产品能力、合作流程，文字密度偏高，缺少统一视觉层级。",
    outlineSuggestions: ["企业定位重塑", "能力结构重排", "合作流程可视化", "案例与数据强化", "行动收束"],
    pages: [
      {
        page: 1,
        title: "公司介绍",
        summary: "封面页标题普通，缺少一句话定位。",
        blockCount: 2,
        imageCount: 0,
        tableCount: 0,
        blocks: [
          { id: "p1-b1", page: 1, type: "title", text: "公司介绍", confidence: 82, sourceRef: "P1 标题" },
          { id: "p1-b2", page: 1, type: "text", text: "专注于 AI 应用开发与企业数字化服务", confidence: 82, sourceRef: "P1 副标题" }
        ]
      },
      {
        page: 2,
        title: "目录",
        summary: "目录结构可保留。",
        blockCount: 4,
        imageCount: 0,
        tableCount: 0,
        blocks: [
          { id: "p2-b1", page: 2, type: "list", text: "公司概况\n产品能力\n客户案例\n合作流程", confidence: 80, sourceRef: "P2 列表" }
        ]
      },
      {
        page: 3,
        title: "产品能力",
        summary: "长段落堆叠，缺少架构图。",
        blockCount: 8,
        imageCount: 0,
        tableCount: 0,
        blocks: [
          { id: "p3-b1", page: 3, type: "text", text: "平台支持知识库、工作流、智能体、多模型接入、权限管理、数据看板、系统集成、私有化部署、安全审计、日志追踪、应用市场、插件扩展、API 编排、监控告警、运营分析等能力，需要面向客户呈现为清晰的能力架构。", confidence: 78, sourceRef: "P3 正文" },
          { id: "p3-b2", page: 3, type: "list", text: "知识库\n工作流\n智能体\n多模型\n权限\n审计\nAPI", confidence: 76, sourceRef: "P3 列表" }
        ]
      },
      {
        page: 4,
        title: "合作流程",
        summary: "流程内容适合改成路线图。",
        blockCount: 3,
        imageCount: 0,
        tableCount: 1,
        blocks: [
          { id: "p4-b1", page: 4, type: "table", text: "阶段\t动作\n调研\t确认需求\n试点\t搭建系统\n交付\t培训验收\n运营\t持续优化", confidence: 84, sourceRef: "P4 表格" }
        ]
      },
      {
        page: 5,
        title: "谢谢",
        summary: "收尾页缺少下一步行动。",
        blockCount: 1,
        imageCount: 0,
        tableCount: 0,
        blocks: [
          { id: "p5-b1", page: 5, type: "text", text: "感谢观看", confidence: 80, sourceRef: "P5 文本" }
        ]
      }
    ],
    blocks: []
  }
};
uploadedFile.analysis.blocks = uploadedFile.analysis.pages.flatMap((page) => page.blocks);

const result = await postJson("/api/generate-ppt", {
  prompt: "请美化上传的企业介绍 PPT，保留原有内容结构，统一视觉风格，增强商务质感和页面层级。",
  mode: "beautify",
  forceLocal: true,
  disablePublicSearch: true,
  uploadedFile
});

const project = result.project;
assert(project?.mode === "beautify", `expected beautify mode, got ${project?.mode}`);
assert(result.beautifyPlan, "response missing beautifyPlan");
assert(project.beautifyPlan, "project missing beautifyPlan");
assert(project.beautifyPlan.sourceFileName === "企业介绍原稿.pptx", "beautify source filename not preserved");
assert(project.beautifyPlan.originalPageCount === 5, "beautify original page count mismatch");
assert(project.beautifyPlan.pageDiagnoses.length >= 5, "page diagnoses too thin");
assert(project.beautifyPlan.pageDiagnoses.some((page) => page.detectedIssues.some((issue) => issue.severity === "risk")), "expected at least one risk page diagnosis");
assert(project.beautifyPlan.pageDiagnoses.some((page) => page.rewriteActions.some((action) => /架构图|流程|压缩|统一/.test(action))), "rewrite actions are not specific enough");
assert(project.quality?.metrics?.some((metric) => metric.label === "原稿诊断"), "quality report missing beautify diagnosis metric");
assert(project.quality?.issues?.some((issue) => /原稿第/.test(issue.title) || issue.id === "beautify-plan-missing") === true, "quality issues should include page-level beautify findings");
assert(project.slides?.some((slide) => (slide.sections || []).length > 0), "beautified project should keep editable sections");
assert(project.sourceDocuments?.some((source) => source.sourceType === "uploaded_file" && source.fileType === "pptx"), "uploaded PPTX should become source document");

console.log(JSON.stringify({
  passed: true,
  checkedAt: new Date().toISOString(),
  title: project.title,
  slides: project.slides.length,
  diagnosisScore: project.beautifyPlan.diagnosisScore,
  level: project.beautifyPlan.level,
  pageDiagnoses: project.beautifyPlan.pageDiagnoses.length,
  qualityScore: project.quality.score,
  diagnosisMetric: project.quality.metrics.find((metric) => metric.label === "原稿诊断")
}, null, 2));
