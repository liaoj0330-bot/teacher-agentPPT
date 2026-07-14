import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pptxgenPath = require.resolve("pptxgenjs");
const nodeModulesDir = pptxgenPath.slice(0, pptxgenPath.lastIndexOf(`${path.sep}pptxgenjs${path.sep}`));
const jszip = await import(pathToFileUrl(path.join(nodeModulesDir, "jszip", "lib", "index.js")));

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/")}`;
}

const root = process.cwd();
const outDir = path.join(root, "outputs", "golden");
fs.mkdirSync(outDir, { recursive: true });

const BASE_URL = process.env.GOLDEN_BASE_URL || "http://127.0.0.1:3002";
const MOJIBAKE_PATTERN = /[\uFFFD]|[脙脗芒鈧撁ぢ掆€斆瀅]/;
const INTERNAL_PATTERN = /\b(day-route|hero-image|image-strip|tips-grid|stat-card|source-note|route-card|bar-chart|donut-chart|visualPrompt|pageIntent|evidenceBlockIds|sourceIds|layout|debug|mock|placeholder|generated visual)\b/i;
const PLACEHOLDER_PATTERN = /占位|待替换|lorem|placeholder|generated visual|灰块|视觉模块|图片素材|调试/i;
const UNIVERSAL_TEMPLATE_PATTERN = /背景[、，,]\s*意义[、，,]\s*方案[、，,]\s*总结|背景意义方案总结/;
const KNOWN_LAYOUT_IDS = new Set([
  "cover_clean",
  "agenda_list",
  "section_divider",
  "bullet_insight",
  "card_grid",
  "comparison_table",
  "process_flow",
  "timeline",
  "roadmap",
  "metric_dashboard",
  "matrix",
  "architecture_diagram",
  "risk_table",
  "case_card",
  "quote_highlight",
  "summary_action"
]);
const SELECTED_TO_SLIDE_LAYOUT = {
  cover_clean: "cover",
  agenda_list: "agenda",
  section_divider: "section",
  bullet_insight: "split",
  card_grid: "cards",
  comparison_table: "comparison",
  process_flow: "process",
  timeline: "timeline",
  roadmap: "timeline",
  metric_dashboard: "stats",
  matrix: "matrix",
  architecture_diagram: "process",
  risk_table: "comparison",
  case_card: "cards",
  quote_highlight: "quote",
  summary_action: "closing"
};
const VISUAL_TO_LAYOUT_IDS = {
  bullet_list: ["bullet_insight", "agenda_list", "quote_highlight", "summary_action"],
  card_grid: ["card_grid", "matrix", "case_card"],
  comparison_table: ["comparison_table", "risk_table"],
  process_flow: ["process_flow", "architecture_diagram"],
  timeline: ["timeline", "roadmap"],
  roadmap: ["roadmap", "summary_action", "timeline"],
  map_route: ["roadmap", "timeline", "process_flow"],
  metric_dashboard: ["metric_dashboard"],
  matrix: ["matrix", "architecture_diagram", "card_grid"],
  architecture_diagram: ["architecture_diagram", "process_flow", "matrix"],
  risk_table: ["risk_table", "comparison_table"],
  case_card: ["case_card", "card_grid"],
  quote_highlight: ["quote_highlight", "cover_clean", "bullet_insight"],
  summary_action: ["summary_action", "roadmap"]
};

const cases = [
  {
    id: "project-report",
    prompt: "帮我做一份 AI 数字产教融合平台项目汇报 PPT，面向高校领导和学院负责人。要求政务、清晰、可落地。内容需要体现建设背景、政策依据、平台定位、系统架构、教师端、学生端、产业端、课程建设、就业能力、舆情研判、真实产业服务场景、成果验收标准和下一步推进计划。不要做成空泛宣传稿，要像可以给领导汇报的项目方案。",
    expectedReviewType: "project_report",
    expectedPlanType: "project_report",
    requiredRoles: ["开场定调", "背景依据", "方案路径", "实施计划", "验收成效", "行动收束"]
  },
  {
    id: "product-intro",
    prompt: "帮我做一份 Dify 产品介绍 PPT，面向企业客户和技术负责人。要求讲清楚产品定位、适用场景、核心能力、产品蓝图、使用路径、部署方式、企业采购判断和价值证明。不要只罗列功能。",
    expectedReviewType: "product_proposal",
    expectedPlanType: "product_intro",
    requiredRoles: ["产品定位", "痛点场景", "产品蓝图", "使用路径", "部署集成", "价值证明"]
  },
  {
    id: "travel-plan",
    prompt: "帮我做一份北京五日游攻略 PPT，面向第一次去北京的自由行游客。要求路线顺、预算清楚、交通可执行、每天节奏合理，并包含避坑提醒和备选方案。不要只罗列景点。",
    expectedReviewType: "travel_guide",
    expectedPlanType: "travel_plan",
    requiredRoles: ["路线总览", "每日路线", "交通安排", "景点餐饮", "预算规划", "风险备选"]
  },
  {
    id: "financial-report",
    prompt: "帮我做一份某公司季度财报分析 PPT，面向管理层。要求说明核心指标变化、营收结构、利润变化、风险因素、趋势判断和管理建议。不要只罗列数字。",
    expectedReviewType: "financial_analysis",
    expectedPlanType: "financial_report",
    requiredRoles: ["核心结论", "指标总览", "收入结构", "利润变化", "风险因素", "趋势建议"]
  },
  {
    id: "courseware",
    prompt: "帮我做一份 AI 入门课程课件，面向零基础学员。要求讲清楚学习目标、知识框架、案例演示、课堂练习、课后任务和总结复盘。不要只堆概念。",
    expectedReviewType: "courseware",
    expectedPlanType: "courseware",
    requiredRoles: ["学习目标", "知识框架", "概念讲解", "案例演示", "课堂练习", "总结复盘"]
  },
  {
    id: "proposal",
    prompt: "帮我做一份企业 AI 培训服务合作方案 PPT，面向企业客户。要求说明客户痛点、服务内容、实施周期、交付成果、报价逻辑、风险控制和下一步合作动作。不要只做公司介绍。",
    expectedReviewType: "product_proposal",
    expectedPlanType: "proposal",
    requiredRoles: ["客户问题", "解决方案", "交付成果", "实施周期", "价值证明", "风险控制", "合作动作"]
  },
  {
    id: "research-report",
    prompt: "帮我做一份行业趋势研究报告 PPT，面向管理层。要求说明研究问题、资料来源、关键发现、趋势判断、机会风险和管理建议。不要只有观点没有依据。",
    expectedReviewType: "general_report",
    expectedPlanType: "research_report",
    requiredRoles: ["研究问题", "数据来源", "关键发现", "趋势判断", "机会风险"]
  },
  {
    id: "activity-plan",
    prompt: "帮我做一份新品发布会活动策划 PPT，面向主办方和执行团队。要求说明活动目标、人群定位、主题创意、执行流程、传播节奏、资源分工、预算风险和效果复盘。",
    expectedReviewType: "event_plan",
    expectedPlanType: "activity_plan",
    requiredRoles: ["活动目标", "主题创意", "流程安排", "资源分工", "预算风险"]
  }
];

async function postJson(pathname, body) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${pathname} ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

function researchFixtures(testCase) {
  const roles = testCase.requiredRoles || [];
  const genericByType = {
    project_report: ["政策文件", "平台功能清单", "实施计划", "责任分工", "验收指标", "风险预案"],
    product_proposal: ["产品文档", "客户场景", "能力架构", "部署条件", "安全机制", "效果指标"],
    travel_guide: ["官方预约", "开放时间", "交通信息", "预算口径", "天气备选", "风险提醒"],
    financial_analysis: ["财报原文", "核心指标", "收入结构", "利润变化", "现金流", "风险因素"],
    courseware: ["教材内容", "案例材料", "练习任务", "学习目标", "评价标准", "课后任务"],
    event_plan: ["活动流程", "人群定位", "预算", "物料清单", "传播节奏", "风险预案"],
    general_report: ["资料来源", "关键发现", "数据证据", "趋势判断", "风险机会", "管理建议"]
  };
  const keywords = genericByType[testCase.expectedReviewType] || genericByType.general_report;
  return [
    {
      query: `${testCase.id} evidence fixture`,
      provider: "golden-fixture",
      results: keywords.slice(0, 6).map((keyword, index) => ({
        title: `${keyword} - ${roles[index % Math.max(1, roles.length)] || testCase.id}`,
        url: `https://example.com/golden/${testCase.id}/${index + 1}`,
        snippet: [
          `${keyword}资料用于支撑${testCase.expectedReviewType}页面的核心判断。`,
          `覆盖${roles.join("、")}等页面角色。`,
          "包含事实、指标、时间计划、风险提醒、下一步动作和可追溯口径。"
        ].join(""),
        confidence: 88 - index,
        sourceName: `Golden Source ${index + 1}`,
        sourceType: index < 2 ? "official" : "search",
        status: "verified"
      }))
    }
  ];
}

async function exportPptx(project, id) {
  const response = await fetch(`${BASE_URL}/api/export-pptx`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ project })
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`export ${id} ${response.status}: ${buffer.toString("utf8")}`);
  }
  const output = path.join(outDir, `${id}.pptx`);
  fs.writeFileSync(output, buffer);
  return { output, buffer };
}

async function tryExportPptx(project, id) {
  const response = await fetch(`${BASE_URL}/api/export-pptx`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ project })
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (response.ok) {
    const output = path.join(outDir, `${id}.pptx`);
    fs.writeFileSync(output, buffer);
    return { ok: true, output, buffer, gate: null };
  }
  const text = buffer.toString("utf8");
  let gate = null;
  try {
    gate = JSON.parse(text);
  } catch {
    gate = { message: text };
  }
  return { ok: false, output: "", buffer, gate };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function inspectPptx(buffer) {
  const zip = await jszip.default.loadAsync(buffer);
  const xmlFiles = Object.keys(zip.files).filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"));
  const texts = [];
  for (const file of xmlFiles) {
    const xml = await zip.files[file].async("string");
    texts.push(xml.replace(/<[^>]+>/g, " "));
  }
  return texts.join("\n");
}

function visibleSectionText(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(visibleSectionText);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value)
    .filter(([key]) => key !== "type" && key !== "sourceIds" && key !== "imagePrompt")
    .flatMap(([, entry]) => visibleSectionText(entry));
}

function textForProject(project) {
  return [
    project.title,
    project.prompt,
    ...(project.slides || []).flatMap((slide) => [
      slide.title,
      slide.subtitle,
      slide.pageIntent,
      ...(slide.bullets || []),
      ...(slide.sections || []).flatMap((section) => visibleSectionText(section))
    ])
  ].join("\n");
}

function textForContentPlan(plan) {
  return [
    plan.userIntent,
    plan.audience,
    plan.decisionGoal,
    plan.coreMessage,
    plan.narrativeStrategy,
    ...(plan.keyQuestions || []),
    ...(plan.qualityChecklist || []),
    ...(plan.riskWarnings || []),
    ...(plan.slidePlan || []).flatMap((slide) => [
      slide.role,
      slide.titleIntent,
      slide.pagePurpose,
      slide.mustProve,
      ...(slide.suggestedEvidence || [])
    ])
  ].join("\n");
}

function textForPagePlans(pagePlans) {
  return (pagePlans || []).flatMap((plan) => [
    plan.role,
    plan.audienceQuestion,
    plan.coreClaim,
    plan.pagePurpose,
    plan.mustProve,
    ...(plan.evidenceNeed || []),
    ...(plan.contentBlocks || []).flatMap((block) => [block.title, block.body, block.evidenceNeed || ""]),
    plan.informationHierarchy?.primary,
    ...(plan.informationHierarchy?.secondary || []),
    plan.layoutIntent,
    plan.writingStyle,
    ...(plan.qualityChecks || []),
    ...(plan.generationWarnings || [])
  ]).filter(Boolean).join("\n");
}

function textForLayoutPlans(layoutPlans) {
  return (layoutPlans || []).flatMap((plan) => [
    plan.role,
    ...(plan.contentSlots || []),
    ...(plan.visualSlots || []),
    ...(plan.hierarchyRules || []),
    ...(plan.spacingRules || []),
    ...(plan.typographyHints || []),
    ...(plan.exportHints || []),
    ...(plan.previewHints || []),
    plan.fallbackReason || "",
    ...(plan.warnings || [])
  ]).filter(Boolean).join("\n");
}

function assertNoBadText(label, text) {
  assert(!MOJIBAKE_PATTERN.test(text), `${label}: mojibake detected`);
  assert(!INTERNAL_PATTERN.test(text), `${label}: internal field leaked`);
  assert(!PLACEHOLDER_PATTERN.test(text), `${label}: placeholder leaked`);
  assert(!UNIVERSAL_TEMPLATE_PATTERN.test(text), `${label}: universal template detected`);
}

function isOpinionClaim(value) {
  const clean = String(value || "").trim();
  return clean.length >= 10 && /必须|需要|应当|应该|能够|可以|通过|帮助|证明|说明|让|降低|提升|形成|支撑|转成|转化|确保|避免|不能|才会/.test(clean);
}

function assertContentPlan(testCase, generated) {
  const plan = generated.contentPlan;
  const validation = generated.contentPlanValidation;
  assert(plan, `${testCase.id}: missing contentPlan`);
  assert(validation?.valid === true, `${testCase.id}: contentPlan invalid`);
  assert(plan.pptType === testCase.expectedPlanType, `${testCase.id}: expected plan type ${testCase.expectedPlanType}, got ${plan.pptType}`);
  for (const field of ["userIntent", "audience", "decisionGoal", "coreMessage", "narrativeStrategy"]) {
    assert(typeof plan[field] === "string" && plan[field].trim().length >= 2, `${testCase.id}: missing ${field}`);
  }
  assert(Array.isArray(plan.slidePlan) && plan.slidePlan.length >= testCase.requiredRoles.length, `${testCase.id}: slidePlan too thin`);
  assert(Array.isArray(plan.qualityChecklist) && plan.qualityChecklist.length >= 4, `${testCase.id}: qualityChecklist missing`);
  const rolesText = plan.slidePlan.map((slide) => `${slide.role} ${slide.titleIntent} ${slide.pagePurpose} ${slide.mustProve}`).join("\n");
  for (const role of testCase.requiredRoles) {
    assert(rolesText.includes(role), `${testCase.id}: contentPlan missing role ${role}`);
  }
  for (const slide of plan.slidePlan) {
    assert(slide.pagePurpose && slide.mustProve, `${testCase.id}: slidePlan pagePurpose/mustProve missing`);
  }
  assertNoBadText(`${testCase.id} contentPlan`, textForContentPlan(plan));
}

function assertSlidePagePlans(testCase, generated, project) {
  const pagePlans = generated.pagePlans || project.slidePagePlans || [];
  const fullPagePlans = project.slidePagePlans || pagePlans;
  assert(generated.slidePagePlanValidation?.valid === true, `${testCase.id}: slidePagePlan validation invalid`);
  assert(Array.isArray(fullPagePlans) && fullPagePlans.length >= testCase.requiredRoles.length, `${testCase.id}: slidePagePlans missing or too thin`);
  assert(fullPagePlans.length === generated.contentPlan.slidePlan.length, `${testCase.id}: slidePagePlans count does not match contentPlan.slidePlan`);
  for (const pagePlan of fullPagePlans) {
    assert(pagePlan.audienceQuestion && pagePlan.audienceQuestion.trim().length >= 8, `${testCase.id}: pagePlan missing audienceQuestion`);
    assert(pagePlan.coreClaim && isOpinionClaim(pagePlan.coreClaim), `${testCase.id}: pagePlan coreClaim is not an opinion sentence: ${pagePlan.coreClaim}`);
    assert(pagePlan.mustProve && pagePlan.mustProve.trim().length >= 4, `${testCase.id}: pagePlan missing mustProve`);
    assert(pagePlan.recommendedVisualForm, `${testCase.id}: pagePlan missing recommendedVisualForm`);
    assert(Array.isArray(pagePlan.qualityChecks) && pagePlan.qualityChecks.length > 0, `${testCase.id}: pagePlan missing qualityChecks`);
    assert(Array.isArray(pagePlan.avoidPatterns) && pagePlan.avoidPatterns.length > 0, `${testCase.id}: pagePlan missing avoidPatterns`);
  }
  const forms = new Set(fullPagePlans.map((plan) => plan.recommendedVisualForm));
  assert(forms.size >= Math.min(3, fullPagePlans.length), `${testCase.id}: recommendedVisualForm is too uniform`);
  assertNoBadText(`${testCase.id} slidePagePlans`, textForPagePlans(fullPagePlans));
}

function assertDeckSpecReferencesContentPlanAndPagePlans(testCase, project) {
  const specs = project.deckSpec?.slideSpecs || [];
  assert(specs.length >= testCase.requiredRoles.length, `${testCase.id}: SlideSpec too thin`);
  const referenced = specs.filter((spec) => spec.contentPlanSlideId && spec.pagePurpose && spec.mustProve).length;
  assert(referenced >= Math.min(testCase.requiredRoles.length, specs.length), `${testCase.id}: DeckSpec does not reference ContentPlan`);
  const pagePlanReferenced = specs.filter((spec) => spec.pagePlanId && spec.audienceQuestion && spec.coreClaim && spec.mustProve && spec.recommendedVisualForm).length;
  assert(pagePlanReferenced >= Math.min(testCase.requiredRoles.length, specs.length), `${testCase.id}: DeckSpec does not reference SlidePagePlan`);
  const layoutPlanReferenced = specs.filter((spec) => spec.layoutPlanId && spec.selectedLayout && spec.layoutFamily && spec.informationDensity).length;
  assert(layoutPlanReferenced >= Math.min(testCase.requiredRoles.length, specs.length), `${testCase.id}: DeckSpec does not reference LayoutPlan`);
  const evidenceReferenced = specs.filter((spec) => Number.isFinite(Number(spec.evidenceCoverage)) && Number.isFinite(Number(spec.sourceConfidence))).length;
  assert(evidenceReferenced >= Math.min(testCase.requiredRoles.length, specs.length), `${testCase.id}: DeckSpec does not trace EvidenceMap`);
}

function textForEvidence(project) {
  return [
    ...(project.sourceDocuments || []).flatMap((source) => [source.title, source.fileName, source.provider, source.rawText, source.normalizedText, ...(source.warnings || [])]),
    ...(project.evidenceBlocks || []).flatMap((block) => [block.text, block.summary, ...(block.keywords || []), ...(block.entities || []), ...(block.usableFor || []), ...(block.warnings || [])]),
    ...(project.evidenceNeeds || []).flatMap((need) => [need.role, need.mustProve, need.evidenceNeedText]),
    ...(project.slideEvidenceMaps || []).flatMap((map) => [map.role, map.coreClaim, map.mustProve, ...(map.unsupportedClaims || []), ...(map.lowConfidenceWarnings || []), ...(map.userConfirmationNeeded || [])]),
    ...(project.evidenceReport?.blockingIssues || []),
    ...(project.evidenceReport?.warnings || []),
    ...(project.evidenceReport?.suggestedFixes || [])
  ].filter(Boolean).join("\n");
}

function assertEvidenceMapping(testCase, generated, project) {
  const sourceDocuments = project.sourceDocuments || generated.sourceDocuments || [];
  const evidenceBlocks = project.evidenceBlocks || generated.evidenceBlocks || [];
  const evidenceNeeds = project.evidenceNeeds || generated.evidenceNeeds || [];
  const slideEvidenceMaps = project.slideEvidenceMaps || generated.slideEvidenceMaps || [];
  const evidenceReport = project.evidenceReport || generated.evidenceReport;
  const specs = project.deckSpec?.slideSpecs || [];

  assert(Array.isArray(sourceDocuments) && sourceDocuments.length > 0, `${testCase.id}: missing SourceDocument[]`);
  assert(Array.isArray(evidenceBlocks) && evidenceBlocks.length > 0, `${testCase.id}: missing EvidenceBlock[]`);
  assert(Array.isArray(evidenceNeeds) && evidenceNeeds.length >= testCase.requiredRoles.length, `${testCase.id}: missing EvidenceNeed[]`);
  assert(Array.isArray(slideEvidenceMaps) && slideEvidenceMaps.length >= testCase.requiredRoles.length, `${testCase.id}: missing SlideEvidenceMap[]`);
  assert(evidenceReport && evidenceReport.totalSlides >= testCase.requiredRoles.length, `${testCase.id}: missing DeckEvidenceReport`);
  assert(project.reviewCenter?.evidenceReport, `${testCase.id}: Review Center missing evidenceReport`);
  assert(project.reviewCenter?.slideEvidenceMaps?.length >= testCase.requiredRoles.length, `${testCase.id}: Review Center missing slideEvidenceMaps`);

  for (const source of sourceDocuments) {
    assert(source.sourceId && source.sourceType && source.parseStatus, `${testCase.id}: SourceDocument core fields missing`);
    assert(["uploaded_file", "pasted_text", "search_result", "test_fixture", "system_fallback", "user_input"].includes(source.sourceType), `${testCase.id}: invalid sourceType ${source.sourceType}`);
    assert(["parsed", "partial", "failed", "unsupported"].includes(source.parseStatus), `${testCase.id}: invalid parseStatus ${source.parseStatus}`);
  }
  const acquisitionReport = project.acquisitionReport || generated.acquisitionReport;
  assert(acquisitionReport, `${testCase.id}: missing acquisitionReport`);
  assert(["disabled", "provider_unconfigured", "ok", "empty", "failed", "timeout"].includes(acquisitionReport.searchStatus), `${testCase.id}: invalid acquisition searchStatus`);
  const searchResultSources = sourceDocuments.filter((source) => source.sourceType === "search_result");
  const fixtureSources = sourceDocuments.filter((source) => source.sourceType === "test_fixture" || source.sourceType === "system_fallback");
  if (generated.__usesFixture) {
    assert(searchResultSources.length === 0, `${testCase.id}: fixture must not become search_result`);
    assert(fixtureSources.length > 0, `${testCase.id}: fixture should be marked as test_fixture/system_fallback`);
    assert(evidenceReport.warnings.some((item) => /测试|夹具|兜底|真实/.test(item)), `${testCase.id}: fixture warning missing`);
  }
  for (const block of evidenceBlocks.slice(0, 20)) {
    assert(block.evidenceBlockId && block.sourceId && block.blockType, `${testCase.id}: EvidenceBlock core fields missing`);
    assert(sourceDocuments.some((source) => source.sourceId === block.sourceId), `${testCase.id}: EvidenceBlock references unknown source ${block.sourceId}`);
  }
  for (const need of evidenceNeeds) {
    assert(need.needId && need.pagePlanId && need.role && need.mustProve && need.evidenceNeedText, `${testCase.id}: EvidenceNeed core fields missing`);
    assert(Array.isArray(need.expectedEvidenceTypes) && need.expectedEvidenceTypes.length > 0, `${testCase.id}: EvidenceNeed missing expectedEvidenceTypes`);
  }
  for (const map of slideEvidenceMaps) {
    assert(map.slideId && map.pagePlanId && map.role, `${testCase.id}: SlideEvidenceMap core fields missing`);
    assert(Number.isFinite(Number(map.evidenceCoverage)), `${testCase.id}: SlideEvidenceMap missing evidenceCoverage`);
    assert(Number.isFinite(Number(map.sourceConfidence)), `${testCase.id}: SlideEvidenceMap missing sourceConfidence`);
    assert(Array.isArray(map.unsupportedClaims), `${testCase.id}: SlideEvidenceMap missing unsupportedClaims`);
    assert(Array.isArray(map.lowConfidenceWarnings), `${testCase.id}: SlideEvidenceMap missing lowConfidenceWarnings`);
  }
  for (const spec of specs.slice(0, slideEvidenceMaps.length)) {
    assert(Number.isFinite(Number(spec.evidenceCoverage)), `${testCase.id}: SlideSpec missing evidenceCoverage`);
    assert(Number.isFinite(Number(spec.sourceConfidence)), `${testCase.id}: SlideSpec missing sourceConfidence`);
    assert(Array.isArray(spec.matchedEvidenceBlocks), `${testCase.id}: SlideSpec missing matchedEvidenceBlocks`);
  }
  assert(Number.isFinite(Number(evidenceReport.averageCoverage)), `${testCase.id}: evidenceReport missing averageCoverage`);
  assert(evidenceReport.sourceSummary?.totalSources >= 1, `${testCase.id}: evidenceReport missing source summary`);
  if (["financial-report", "project-report", "proposal"].includes(testCase.id)) {
    assert(Array.isArray(evidenceReport.blockingIssues), `${testCase.id}: evidenceReport missing blockingIssues`);
    assert(Array.isArray(evidenceReport.unsupportedClaims), `${testCase.id}: evidenceReport missing unsupportedClaims`);
  }
  assertNoBadText(`${testCase.id} evidence`, textForEvidence(project));
}

function assertLayoutPlans(testCase, generated, project) {
  const layoutPlans = project.layoutPlans || generated.layoutPlans || [];
  const pagePlans = project.slidePagePlans || generated.pagePlans || [];
  const specs = project.deckSpec?.slideSpecs || [];
  assert(generated.layoutPlanValidation?.valid === true, `${testCase.id}: layoutPlan validation invalid`);
  assert(Array.isArray(layoutPlans) && layoutPlans.length >= testCase.requiredRoles.length, `${testCase.id}: layoutPlans missing or too thin`);
  assert(layoutPlans.length === pagePlans.length, `${testCase.id}: layoutPlans count does not match slidePagePlans`);

  for (const plan of layoutPlans) {
    assert(plan.layoutPlanId, `${testCase.id}: layoutPlan missing layoutPlanId`);
    assert(plan.pagePlanId, `${testCase.id}: layoutPlan missing pagePlanId`);
    assert(KNOWN_LAYOUT_IDS.has(plan.selectedLayout), `${testCase.id}: selectedLayout not from layout library: ${plan.selectedLayout}`);
    assert(plan.layoutFamily, `${testCase.id}: layoutPlan missing layoutFamily`);
    assert(["low", "medium", "high"].includes(plan.informationDensity), `${testCase.id}: layoutPlan invalid informationDensity`);
    assert(Array.isArray(plan.contentSlots) && plan.contentSlots.length > 0, `${testCase.id}: layoutPlan missing contentSlots`);
    assert(Array.isArray(plan.visualSlots) && plan.visualSlots.length > 0, `${testCase.id}: layoutPlan missing visualSlots`);
    assert(Array.isArray(plan.hierarchyRules) && plan.hierarchyRules.length > 0, `${testCase.id}: layoutPlan missing hierarchyRules`);
    assert(Array.isArray(plan.exportHints) && plan.exportHints.length > 0, `${testCase.id}: layoutPlan missing exportHints`);
    assert(Array.isArray(plan.previewHints) && plan.previewHints.length > 0, `${testCase.id}: layoutPlan missing previewHints`);
    const preferred = VISUAL_TO_LAYOUT_IDS[plan.recommendedVisualForm] || [];
    assert(preferred.includes(plan.selectedLayout) || Boolean(plan.fallbackReason), `${testCase.id}: selectedLayout ${plan.selectedLayout} does not match visual form ${plan.recommendedVisualForm}`);
  }

  const selectedLayouts = new Set(layoutPlans.map((plan) => plan.selectedLayout));
  const layoutFamilies = new Set(layoutPlans.map((plan) => plan.layoutFamily));
  assert(selectedLayouts.size >= Math.min(3, layoutPlans.length), `${testCase.id}: selectedLayout is too uniform`);
  assert(layoutFamilies.size >= Math.min(3, layoutPlans.length), `${testCase.id}: layoutFamily is too uniform`);
  assert(!layoutPlans.every((plan) => plan.selectedLayout === "bullet_insight"), `${testCase.id}: all pages use bullet_insight`);
  assert(!layoutPlans.every((plan) => plan.selectedLayout === "card_grid"), `${testCase.id}: all pages use card_grid`);

  layoutPlans.forEach((plan, index) => {
    const spec = specs.find((item) => item.layoutPlanId === plan.layoutPlanId) || specs[index];
    assert(spec?.layoutPlanId === plan.layoutPlanId, `${testCase.id}: SlideSpec does not trace layoutPlanId on page ${index + 1}`);
    assert(spec?.selectedLayout === plan.selectedLayout, `${testCase.id}: SlideSpec selectedLayout mismatch on page ${index + 1}`);
    assert(spec?.layoutFamily === plan.layoutFamily, `${testCase.id}: SlideSpec layoutFamily mismatch on page ${index + 1}`);
    const expectedSlideLayout = SELECTED_TO_SLIDE_LAYOUT[plan.selectedLayout];
    assert(spec?.layoutIntent === expectedSlideLayout, `${testCase.id}: SlideSpec layoutIntent mismatch on page ${index + 1}`);
    const slide = project.slides?.[index];
    assert(slide?.layout === expectedSlideLayout, `${testCase.id}: Web/PPTX slide layout mismatch on page ${index + 1}: expected ${expectedSlideLayout}, got ${slide?.layout}`);
  });
  assertNoBadText(`${testCase.id} layoutPlans readable text`, textForLayoutPlans(layoutPlans));
}

async function runCase(testCase) {
  const generated = await postJson("/api/generate-ppt", {
    prompt: testCase.prompt,
    mode: "agent",
    forceLocal: true,
    disablePublicSearch: true,
    researchSources: researchFixtures(testCase)
  });
  generated.__usesFixture = true;
  assertContentPlan(testCase, generated);
  const project = generated.project;
  const projectText = textForProject(project);
  const type = project.reviewCenter?.pptType;
  assert(type === testCase.expectedReviewType, `${testCase.id}: expected review type ${testCase.expectedReviewType}, got ${type}`);
  assert(project.contentPlan?.pptType === testCase.expectedPlanType, `${testCase.id}: project missing contentPlan`);
  assertSlidePagePlans(testCase, generated, project);
  assertLayoutPlans(testCase, generated, project);
  assertDeckSpecReferencesContentPlanAndPagePlans(testCase, project);
  assertEvidenceMapping(testCase, generated, project);
  assert((project.slides || []).length >= 8, `${testCase.id}: slide count too low`);
  assertNoBadText(`${testCase.id} project`, projectText);

  const exported = await tryExportPptx(project, testCase.id);
  if (exported.ok) {
    assert(exported.buffer.length > 25000, `${testCase.id}: pptx too small`);
    const pptxText = await inspectPptx(exported.buffer);
    assertNoBadText(`${testCase.id} pptx`, pptxText);
  } else {
    const issueText = JSON.stringify(exported.gate || {});
    assert(/真实来源|真实搜索|非真实来源|质量闸门|缺少/.test(issueText), `${testCase.id}: export failed for unexpected reason: ${issueText}`);
  }
  return {
    id: testCase.id,
    title: project.title,
    reviewType: type,
    planType: project.contentPlan.pptType,
    slides: project.slides.length,
    score: project.quality?.score,
    contentPlanValid: generated.contentPlanValidation.valid,
    slidePagePlanValid: generated.slidePagePlanValidation.valid,
    layoutPlanValid: generated.layoutPlanValidation.valid,
    sourceDocuments: (project.sourceDocuments || []).length,
    evidenceBlocks: (project.evidenceBlocks || []).length,
    evidenceNeeds: (project.evidenceNeeds || []).length,
    slideEvidenceMaps: (project.slideEvidenceMaps || []).length,
    evidenceCoverage: project.evidenceReport?.averageCoverage,
    evidenceWarnings: project.evidenceReport?.warnings?.length || 0,
    evidenceBlockingIssues: project.evidenceReport?.blockingIssues?.length || 0,
    visualForms: [...new Set((project.slidePagePlans || []).map((plan) => plan.recommendedVisualForm))],
    selectedLayouts: [...new Set((project.layoutPlans || []).map((plan) => plan.selectedLayout))],
    layoutFamilies: [...new Set((project.layoutPlans || []).map((plan) => plan.layoutFamily))],
    acquisitionStatus: project.acquisitionReport?.searchStatus,
    searchResultSources: (project.sourceDocuments || []).filter((source) => source.sourceType === "search_result").length,
    fixtureSources: (project.sourceDocuments || []).filter((source) => source.sourceType === "test_fixture" || source.sourceType === "system_fallback").length,
    exportBlockedByGate: !exported.ok,
    output: exported.output,
    size: exported.buffer.length
  };
}

async function assertSearchApiNoFakeResults() {
  const result = await postJson("/api/search-materials", {
    queries: ["AI PPT Agent golden no fake search check"]
  });
  assert(Array.isArray(result.groups), "search API: missing groups");
  const fakeResults = result.groups.flatMap((group) => group.results || []).filter((item) => !item.url || /example\.com\/golden|duckduckgo\.com\/\?q=/.test(item.url));
  assert(fakeResults.length === 0, "search API returned fake or untraceable results");
  if (result.status !== "ok") {
    assert(["provider_unconfigured", "empty", "failed", "timeout"].includes(result.status), `search API: invalid status ${result.status}`);
    assert(result.groups.every((group) => (group.results || []).length === 0), "unconfigured/failed search must not return results");
  } else {
    assert(result.groups.some((group) => (group.results || []).length > 0), "search API ok but empty");
    assert(result.groups.flatMap((group) => group.results || []).every((item) => /^https?:\/\//.test(item.url || "")), "search API ok result missing URL");
  }
  return {
    status: result.status,
    provider: result.provider,
    groups: result.groups.length,
    results: result.groups.flatMap((group) => group.results || []).length
  };
}

async function main() {
  const searchApi = await assertSearchApiNoFakeResults();
  const results = [];
  for (const testCase of cases) {
    results.push(await runCase(testCase));
  }
  const reportPath = path.join(outDir, "golden-report.json");
  fs.writeFileSync(path.join(outDir, "golden-report.json"), JSON.stringify({ passed: true, baseUrl: BASE_URL, searchApi, results, checkedAt: new Date().toISOString() }, null, 2), "utf8");
  console.log(JSON.stringify({ passed: true, reportPath, searchApi, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
