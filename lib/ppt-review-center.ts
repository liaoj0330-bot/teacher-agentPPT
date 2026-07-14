import fs from "node:fs";
import path from "node:path";
import type { CanvasProject, DesignSlide, ResearchItem, SlideLayout, SlideSection, UploadedAsset } from "@/lib/canvas-data";
import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import type { DeckEvidenceReport, SlideEvidenceMap } from "@/lib/ppt-agent/evidence-types";
import { slideLayoutForSelectedLayout } from "@/lib/ppt-agent/layout-library";
import type { LayoutPlan } from "@/lib/ppt-agent/layout-plan";
import { detectPPTTypeContract } from "@/lib/ppt-agent/type-contracts";
import type { RecommendedVisualForm, SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import type { TeacherDeckScoreReportV2 } from "@/lib/teacher-deck-scoring";
import { findInternalFieldMatches, findScaffoldMatches } from "@/lib/ppt-agent/slide-content-validator";
import { compactForDesign, getDesignProfile, layoutForSlide, profileForPrompt, visualPromptForSlide } from "@/lib/ppt-design-system";
import { pptTypeLabels, pptTypeRuleSeeds, type PPTType, type RequiredPageSeed, type RuleDimensionSeed } from "@/lib/ppt-review-rulebase";
import { cleanProject, cleanText } from "@/lib/text-sanitize";

export type ReviewLevel = "优秀" | "可交付" | "需要修改" | "不建议交付";

export type ReviewDimension = {
  key: string;
  name: string;
  weight: number;
  why: string;
  deductionRules: string[];
  evidenceRequired: string[];
};

export type ReviewRuleSet = {
  id: string;
  pptType: PPTType;
  pptTypeLabel: string;
  audience: string;
  goal: string;
  totalScore: 100;
  dimensions: ReviewDimension[];
  requiredPages: RequiredPageSeed[];
  missingContentDeductions: string[];
  vagueOrRepeatedContent: string[];
  evidenceNeeds: string[];
  generatedAt: string;
};

export type PlanningAuditPage = {
  page: number;
  title: string;
  role: string;
  claim: string;
  mustProve: string;
  evidenceNeeded: string[];
  evidencePlan: string[];
  evidenceSourceIds: string[];
  whatToUse: string[];
  whatToCut: string[];
  contentBlocks: Array<{ title: string; body: string; evidence?: string; priority: "must" | "should" | "optional" }>;
  layoutReason: string;
  riskIfWeak: string;
  speakerIntent: string;
  revisionPrompt: string;
  successCriteria: string[];
  suggestedLayout: SlideLayout;
};

export type PlanningAudit = {
  audience: string;
  expectedDecision: string;
  coreMessage: string;
  recommendedSlideCount: number;
  recommendedStructure: string[];
  pageRoles: PlanningAuditPage[];
  materialsToUse: string[];
  materialsToDiscard: string[];
  likelyDeductions: string[];
};

export type ReviewDeduction = {
  id: string;
  dimensionKey: string;
  dimensionName: string;
  points: number;
  where: string;
  reason: string;
  suggestion: string;
  autoFixable: boolean;
  slideId?: string;
  slideTitle?: string;
  missingKeyword?: string;
};

export type PageReview = {
  slideId: string;
  page: number;
  title: string;
  role: string;
  score: number;
  feedback: string[];
  shouldProve: string;
  autoFixable: boolean;
};

export type PPTReviewReport = {
  totalScore: number;
  level: ReviewLevel;
  dimensionScores: Array<{ key: string; name: string; score: number; weight: number; comment: string }>;
  deductions: ReviewDeduction[];
  pageReviews: PageReview[];
  priorityFixes: ReviewDeduction[];
  reusableRules: PersistedDeductionRule[];
  reviewedAt: string;
};

export type ReviewFixSummary = {
  beforeScore: number;
  afterScore: number;
  scoreDelta: number;
  beforeDeductionCount: number;
  afterDeductionCount: number;
  appliedCount: number;
  fixedDeductionCount: number;
  unresolvedCount: number;
  unresolvedManualCount: number;
  unresolvedBlockers: ReviewDeduction[];
  status: "improved" | "partial" | "needs_sources" | "no_change";
  message: string;
};

export type PageReviewFixSummary = {
  page: number;
  slideId?: string;
  slideTitle: string;
  beforeTotalScore: number;
  afterTotalScore: number;
  beforePageScore?: number;
  afterPageScore?: number;
  appliedCount: number;
  remainingPageDeductions: number;
  status: "improved" | "updated" | "needs_sources" | "no_page_fix";
  message: string;
  applied: string[];
  remainingBlockers: ReviewDeduction[];
};

export type PersistedDeductionRule = {
  id: string;
  pptType: PPTType;
  pptTypeLabel: string;
  dimensionKey: string;
  dimensionName: string;
  condition: string;
  deduction: string;
  autoSuggestion: string;
  createdAt: string;
  hits: number;
};

export type ReviewCenterState = {
  pptType: PPTType;
  pptTypeLabel: string;
  confidence: number;
  audience: string;
  goal: string;
  ruleSet: ReviewRuleSet;
  planningAudit: PlanningAudit;
  postReview?: PPTReviewReport;
  contentPlan?: ContentPlan;
  slidePagePlans?: SlidePagePlan[];
  layoutPlans?: LayoutPlan[];
  evidenceReport?: DeckEvidenceReport;
  slideEvidenceMaps?: SlideEvidenceMap[];
  lastFixSummary?: ReviewFixSummary;
  lastPageFixSummary?: PageReviewFixSummary;
  /** Development-only diagnostic. It is never a formal Review Center conclusion or export gate. */
  teacherScoreV2Shadow?: TeacherDeckScoreReportV2;
};

const persistedRulesPath = path.join(process.cwd(), "data", "ppt-review-rules.json");

function includesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function compact(text: string, max = 36) {
  const clean = cleanText(text).replace(/\s+/g, " ");
  return [...clean].length > max ? `${[...clean].slice(0, max - 1).join("")}…` : clean;
}

function firstNonEmpty(values: Array<string | undefined>, fallback = "") {
  return values.map((value) => cleanText(value)).find(Boolean) || fallback;
}

function materialLabel(item: ResearchItem | UploadedAsset | string | undefined) {
  if (!item) return "";
  if (typeof item === "string") return cleanText(item);
  if ("name" in item) {
    return `${item.name}${item.analysis ? `（${item.analysis.blockCount} 个内容块）` : ""}`;
  }
  return cleanText(item.sourceName || item.source || item.title);
}

function evidenceSourceIdsForPage(page: RequiredPageSeed, research: ResearchItem[], index: number) {
  if (!research.length) return [];
  const pageText = cleanText(`${page.title} ${page.role} ${page.mustProve} ${page.requiredKeywords.join(" ")}`);
  const scored = research.map((item) => {
    const itemText = cleanText(`${item.title} ${item.summary} ${item.sourceName} ${item.source}`);
    const keywordHits = page.requiredKeywords.filter((keyword) => itemText.includes(keyword)).length;
    const titleHits = [...pageText].filter((char) => char.trim() && itemText.includes(char)).length;
    const verifiedBoost = item.sourceType === "official" || item.status === "verified" ? 6 : 0;
    return { item, score: keywordHits * 18 + Math.min(titleHits, 12) + verifiedBoost + (Number(item.confidence) || 0) / 20 };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ item }) => item.id)
    .concat(research[index % research.length]?.id ? [research[index % research.length].id] : [])
    .filter(Boolean)
    .slice(0, 3);
}

function evidencePlanForPage(page: RequiredPageSeed, ruleSet: ReviewRuleSet, research: ResearchItem[], uploadedAssets: UploadedAsset[], index: number) {
  const matchedSources = evidenceSourceIdsForPage(page, research, index)
    .map((id) => research.find((item) => item.id === id))
    .filter(Boolean)
    .map((item) => `引用「${item!.sourceName || item!.source || item!.title}」支撑${page.requiredKeywords[0] || page.role}`);
  const assetEvidence = uploadedAssets
    .filter((asset) => asset.analysis)
    .slice(0, 2)
    .map((asset) => `从上传资料「${asset.name}」抽取与「${page.title}」匹配的内容块`);
  return unique([
    ...matchedSources,
    ...assetEvidence,
    ...ruleSet.evidenceNeeds.slice(0, 2).map((need) => `补齐「${need}」的来源、口径或截图`)
  ]).slice(0, 4);
}

function claimForPage(page: RequiredPageSeed, ruleSet: ReviewRuleSet, prompt: string) {
  const topic = compact(prompt.replace(/帮我|做一份|生成|制作|PPT/gi, "").replace(/[，。；;].*$/g, ""), 18);
  const type = ruleSet.pptType;
  if (type === "project_report") {
    if (/封面/.test(page.title)) return `${topic || "本项目"}要在开场交代清楚汇报对象、建设目标和交付边界。`;
    if (/背景|痛点/.test(page.title)) return `${topic || "该项目"}具备明确建设必要性，不能停留在概念倡议。`;
    if (/目标|评价/.test(page.title)) return "项目目标必须转成可验收指标，领导才能判断投入产出。";
    if (/架构/.test(page.title)) return "平台需要用系统架构证明它是可建设的工程方案。";
    if (/功能|场景/.test(page.title)) return "功能必须落到教学、实训、协同和就业等真实场景。";
    if (/实施|阶段|计划/.test(page.title)) return "项目可以按阶段推进，并在每个阶段形成可检查成果。";
    if (/责任|保障/.test(page.title)) return "组织保障要明确牵头、协同和交付责任，避免方案悬空。";
    if (/验收|成效/.test(page.title)) return "验收标准要可量化、可复核、可用于后续评审。";
    if (/风险/.test(page.title)) return "关键风险可被提前识别并纳入治理机制。";
    if (/下一步|决策/.test(page.title)) return "汇报最后必须收束到需要领导拍板的事项。";
  }
  if (type === "travel_guide") {
    if (/时间|路线/.test(page.title)) return "行程不是景点清单，而是一条按时间、交通和体力可执行的路线。";
    if (/预约|风险/.test(page.title)) return "热门景点的预约和异常情况决定这份攻略是否真的能用。";
    if (/预算|交通/.test(page.title)) return "预算和交通要给出假设边界，避免不可靠的死数。";
  }
  if (type === "financial_analysis") return "本页要用数据口径解释变化原因，而不是只描述涨跌。";
  if (type === "product_proposal") {
    if (/定位|价值|开场/.test(page.title)) return "产品开场必须让客户马上知道它解决什么问题、适合谁、为什么值得继续看。";
    if (/痛点|问题|目标/.test(page.title)) return "产品价值要从客户真实流程断点出发，而不是从功能清单出发。";
    if (/架构|能力/.test(page.title)) return "能力架构要说明模块边界、集成入口和企业级可控性。";
    if (/工作流|流程/.test(page.title)) return "产品要证明能把业务需求稳定转成可发布、可监控、可迭代的流程。";
    if (/功能|输出/.test(page.title)) return "功能必须变成客户可试用、可验收、可复用的输出能力。";
    if (/场景/.test(page.title)) return "场景页要说明谁使用、在什么任务中使用、产生什么业务结果。";
    if (/差异|传统|模板|竞品/.test(page.title)) return "差异化页要帮助客户判断为什么不是普通模板、聊天机器人或纯定制开发。";
    if (/部署|集成/.test(page.title)) return "部署页要打消技术评估疑虑，说明试点、接入和运维路径。";
    if (/安全|权限|数据|风控/.test(page.title)) return "企业客户必须看到权限、数据、日志、内容风险和治理边界。";
    if (/案例|效果|指标/.test(page.title)) return "价值证明要落到案例、试点或可收集的效果指标，不能编造客户数据。";
    if (/试点|验收/.test(page.title)) return "试点页要定义低风险启动范围和成败判断口径。";
    if (/下一步|采购|决策/.test(page.title)) return "最后要把介绍收束到试点、技术对接、材料补齐和采购判断。";
  }
  if (type === "business_bp") return "本页要证明机会、方案或增长逻辑足以支撑投资判断。";
  if (type === "courseware") return "本页要让学习者完成一个清晰的理解或练习目标。";
  return `本页要证明：${page.mustProve}`;
}

function layoutReason(layout: SlideLayout, page: RequiredPageSeed) {
  const reasons: Partial<Record<SlideLayout, string>> = {
    cover: "封面负责建立对象、主题和汇报语气，不能塞入过多细节。",
    agenda: "目录页要给出叙事路径，让受众知道后面如何做判断。",
    split: "左右拆分适合同时呈现问题与证据，避免背景堆字。",
    matrix: "矩阵适合展示主体、场景、功能或责任之间的对应关系。",
    timeline: "时间线适合证明推进节奏、里程碑和阶段成果。",
    stats: "数据卡适合把目标、指标和预算口径显性化。",
    comparison: "对比页适合说明风险、方案选择或优先级判断。",
    process: "流程页适合解释系统架构、业务闭环和实施路径。",
    checklist: "清单页适合验收、避坑、交付物和执行检查。",
    closing: "收束页要把判断转成下一步动作或决策事项。",
    source: "来源页用于保留信息追溯，降低事实性风险。"
  };
  return reasons[layout] || `「${page.role}」需要用结构化模块承载，避免变成普通 bullet 页。`;
}

function riskForPage(page: RequiredPageSeed, ruleSet: ReviewRuleSet) {
  if (ruleSet.pptType === "project_report") {
    if (/验收|指标/.test(page.title)) return "如果没有量化验收口径，领导无法判断项目做成与否。";
    if (/责任|保障/.test(page.title)) return "如果没有责任主体，方案会被认为不可落地。";
    if (/实施|计划/.test(page.title)) return "如果没有阶段节点，项目会像口号而不是工程。";
    if (/背景|痛点/.test(page.title)) return "如果只讲宏观趋势，容易被扣建设必要性分。";
  }
  if (ruleSet.pptType === "product_proposal") {
    if (/痛点|问题/.test(page.title)) return "如果客户问题不具体，产品会被看成泛泛 AI 能力展示。";
    if (/架构|工作流|部署/.test(page.title)) return "如果缺少架构、流程或部署路径，技术负责人无法评估落地成本。";
    if (/差异|案例|指标/.test(page.title)) return "如果缺少差异化和证据，采购方会把它归类为普通工具或模板站。";
    if (/安全|权限|数据/.test(page.title)) return "如果没有安全治理，企业客户通常无法进入正式采购评估。";
    if (/试点|验收|下一步/.test(page.title)) return "如果没有试点边界和验收口径，介绍会停在演示，无法变成项目。";
  }
  if (ruleSet.pptType === "travel_guide") return "如果没有预约、交通和备选方案，攻略会变成不可执行的景点罗列。";
  return `如果本页不能证明「${page.mustProve}」，会在「页面策划」和「证据支撑」维度扣分。`;
}

function successCriteriaForPage(page: RequiredPageSeed, ruleSet: ReviewRuleSet) {
  const base = [
    `标题能直接指向「${page.role}」`,
    `正文能证明「${page.mustProve}」`,
    `至少出现 1 个结构化模块而不是纯 bullet`
  ];
  if (ruleSet.pptType === "project_report") {
    return unique([
      ...base,
      /验收|指标|目标/.test(page.title) ? "出现可验收指标或评价口径" : "",
      /实施|责任|下一步/.test(page.title) ? "出现时间、责任人或需决策事项" : "",
      /背景|架构|功能/.test(page.title) ? "出现政策、现状、功能清单或场景证据" : ""
    ].filter(Boolean)).slice(0, 5);
  }
  if (ruleSet.pptType === "product_proposal") {
    return unique([
      ...base,
      /痛点|场景/.test(page.title) ? "出现具体客户角色、任务场景和业务结果" : "",
      /架构|能力|工作流/.test(page.title) ? "出现模块关系、流程闭环或系统集成入口" : "",
      /差异|案例|指标/.test(page.title) ? "出现对比维度、证据来源或可验证指标" : "",
      /部署|安全|试点|验收|下一步/.test(page.title) ? "出现落地路径、治理边界或采购/试点动作" : ""
    ].filter(Boolean)).slice(0, 5);
  }
  return unique([...base, `出现「${page.requiredKeywords.slice(0, 2).join(" / ")}」等必备关键词`]).slice(0, 5);
}

function contentBlocksForPage(page: RequiredPageSeed, ruleSet: ReviewRuleSet, evidencePlan: string[], prompt: string) {
  const claim = claimForPage(page, ruleSet, prompt);
  if (ruleSet.pptType === "product_proposal") {
    if (/定位|价值|开场/.test(page.title)) {
      return [
        { title: "一句话定位", body: "用一句话说明产品解决什么问题、服务谁、交付什么结果。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "客户判断", body: "让客户先判断是否与自己的业务流程、技术栈和采购目标相关。", priority: "must" as const },
        { title: "本页边界", body: "不要把所有功能塞进封面，只保留定位、价值和后续结构。", priority: "should" as const }
      ];
    }
    if (/痛点|问题|目标/.test(page.title)) {
      return [
        { title: "流程断点", body: "说明客户从 AI Demo 到生产落地时遇到的流程、数据、权限和监控断点。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "采购目标", body: "把目标写成可试点、可集成、可观测、可复盘的业务结果。", priority: "must" as const },
        { title: "角色拆分", body: "区分业务负责人、技术负责人和一线使用者的不同关注点。", priority: "should" as const }
      ];
    }
    if (/架构|能力/.test(page.title)) {
      return [
        { title: "应用入口", body: "说明用户入口、管理入口和系统接口分别承担什么作用。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "编排与知识", body: "说明流程编排、数据/知识、核心功能和输出之间的关系。", evidence: evidencePlan[1], priority: "must" as const },
        { title: "运营治理", body: "补充日志、反馈、权限、成本和安全等上线后能力。", priority: "must" as const }
      ];
    }
    if (/工作流|流程/.test(page.title)) {
      return [
        { title: "输入", body: "从用户需求、业务数据或知识库问题进入流程。", priority: "must" as const },
        { title: "编排", body: "把任务拆成可配置步骤，明确每一步输入输出。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "交付", body: "输出应用、API、报告或自动化任务，并进入监控和复盘。", priority: "must" as const }
      ];
    }
    if (/功能|输出/.test(page.title)) {
      return [
        { title: "核心功能", body: "列出客户可试用、可配置、可验收的核心能力。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "可编辑输出", body: "说明输出能否被业务人员继续编辑、复用或接入后续流程。", priority: "must" as const },
        { title: "验收口径", body: "每个关键功能至少对应一个试用动作或验收标准。", priority: "should" as const }
      ];
    }
    if (/场景/.test(page.title)) {
      return [
        { title: "知识问答", body: "把产品映射到高频知识、咨询或流程场景。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "流程自动化", body: "选择可度量、边界清楚、人工流转成本高的流程作为优先场景。", priority: "must" as const },
        { title: "部门角色", body: "写清业务、运营、技术分别如何使用，避免只写泛场景。", priority: "should" as const }
      ];
    }
    if (/差异|传统|模板|竞品/.test(page.title)) {
      return [
        { title: "不是聊天框", body: "强调流程编排、知识挂载、工具调用和发布运营，而不是单轮问答。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "不是模板站", body: "强调客户流程、数据和验收指标可配置，而不是套固定页面。", priority: "must" as const },
        { title: "不是纯代码框架", body: "说明可视化编排降低业务协作门槛，同时保留开发扩展能力。", priority: "should" as const }
      ];
    }
    if (/部署|集成/.test(page.title)) {
      return [
        { title: "试点路径", body: "先选 1-2 个高频流程试点，控制数据边界和接入范围。", priority: "must" as const },
        { title: "系统集成", body: "明确 API、工具、知识库、身份权限和业务系统接入点。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "运营迭代", body: "上线后用日志、反馈、成本和效果指标持续优化。", priority: "must" as const }
      ];
    }
    if (/安全|权限|数据|风控/.test(page.title)) {
      return [
        { title: "权限边界", body: "明确工作区、角色、数据源和应用发布权限。", priority: "must" as const },
        { title: "数据治理", body: "说明数据隔离、模型供应商选择、日志审计和内容风险控制。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "合规材料", body: "正式交付前补充安全白皮书、部署说明或企业合规文档。", priority: "should" as const }
      ];
    }
    if (/案例|效果|指标/.test(page.title)) {
      return [
        { title: "案例口径", body: "没有授权案例时不要编造客户名，改用试点指标建议和待补证据。", priority: "must" as const },
        { title: "效果指标", body: "建议记录效率、质量、活跃、成本、安全等维度的试点前后变化。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "证据来源", body: "引用官网、文档、客户访谈、试点日志或用户反馈作为支撑。", priority: "must" as const }
      ];
    }
    if (/试点|验收/.test(page.title)) {
      return [
        { title: "试点范围", body: "限定部门、流程、数据源、用户数和时间窗口。", priority: "must" as const },
        { title: "验收指标", body: "定义业务效果、使用体验、集成成本和安全治理四类指标。", priority: "must" as const },
        { title: "决策口径", body: "复盘后判断继续采购、扩容、调整或暂停。", priority: "must" as const }
      ];
    }
    if (/下一步|采购|决策/.test(page.title)) {
      return [
        { title: "业务动作", body: "确认试点流程、业务 owner、使用人群和成功标准。", priority: "must" as const },
        { title: "技术动作", body: "确认数据源、模型、接口、权限、安全和部署边界。", priority: "must" as const },
        { title: "采购动作", body: "补齐材料、安排试点复盘，并形成采购或扩容判断。", priority: "must" as const }
      ];
    }
  }
  if (ruleSet.pptType === "project_report") {
    if (/目标|评价/.test(page.title)) {
      return [
        { title: "目标拆解", body: "把建设目标拆成教学、实训、协同、治理四类成果。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "评价口径", body: "每类目标至少配置一个可验收指标或检查口径。", evidence: evidencePlan[1], priority: "must" as const },
        { title: "边界说明", body: "说明本期建设范围，避免目标过大导致无法验收。", priority: "should" as const }
      ];
    }
    if (/架构/.test(page.title)) {
      return [
        { title: "能力层", body: "呈现数据底座、AI 能力、资源管理、应用服务等平台层级。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "协同链路", body: "说明学校、企业、平台、学生之间如何流转任务与成果。", evidence: evidencePlan[1], priority: "must" as const },
        { title: "交付边界", body: "标注本期上线能力与后续扩展能力。", priority: "should" as const }
      ];
    }
    if (/功能|场景/.test(page.title)) {
      return [
        { title: "教学场景", body: "AI 备课、课程资源生成、课堂互动和学习分析。", evidence: evidencePlan[0], priority: "must" as const },
        { title: "实训场景", body: "企业项目库、任务分发、过程评价和成果沉淀。", evidence: evidencePlan[1], priority: "must" as const },
        { title: "就业协同", body: "岗位画像、能力认证、企业评价和就业转化。", priority: "should" as const }
      ];
    }
    if (/实施|阶段|计划/.test(page.title)) {
      return [
        { title: "启动期", body: "完成需求确认、数据盘点、试点专业选择和实施方案定稿。", priority: "must" as const },
        { title: "建设期", body: "完成平台部署、资源建设、教师培训和试点运行。", priority: "must" as const },
        { title: "验收期", body: "按指标复核交付物、使用数据、师生反馈和改进清单。", priority: "must" as const }
      ];
    }
    if (/责任|保障/.test(page.title)) {
      return [
        { title: "牵头机制", body: "学校主管部门牵头，二级学院和企业共同参与。", priority: "must" as const },
        { title: "责任分工", body: "按平台建设、课程资源、实训项目、数据治理拆分责任。", priority: "must" as const },
        { title: "例会复盘", body: "建立周推进、月复盘、阶段验收机制。", priority: "should" as const }
      ];
    }
    if (/验收|成效/.test(page.title)) {
      return [
        { title: "交付验收", body: "平台能力、课程资源、项目库、数据看板等交付物可检查。", priority: "must" as const },
        { title: "应用成效", body: "覆盖专业、活跃师生、企业项目、就业转化等指标可量化。", priority: "must" as const },
        { title: "持续改进", body: "验收后形成问题清单、责任人和下一轮优化计划。", priority: "should" as const }
      ];
    }
    if (/风险/.test(page.title)) {
      return [
        { title: "数据风险", body: "明确数据安全、权限控制和个人信息保护策略。", priority: "must" as const },
        { title: "协同风险", body: "防止校企参与热度不足，设置共创项目和考核机制。", priority: "must" as const },
        { title: "推广风险", body: "从试点专业开始扩展，避免一次性铺开导致使用率偏低。", priority: "should" as const }
      ];
    }
    if (/下一步|决策/.test(page.title)) {
      return [
        { title: "需决策事项", body: "明确需要领导确认的立项、预算、试点范围和牵头机制。", priority: "must" as const },
        { title: "近期动作", body: "给出 2-4 周内可启动的调研、评审和实施动作。", priority: "must" as const },
        { title: "交付承诺", body: "承诺下一次汇报带回方案、预算、里程碑或验收口径。", priority: "should" as const }
      ];
    }
  }
  return [
    { title: "页面主张", body: claim, evidence: evidencePlan[0], priority: "must" as const },
    { title: "支撑证据", body: evidencePlan[0] || page.requiredKeywords.join("、"), evidence: evidencePlan[1], priority: "must" as const },
    { title: "行动判断", body: `让${ruleSet.audience}可以据此判断：${page.mustProve}`, priority: "should" as const }
  ];
}

function planningClaim(page: PlanningAuditPage) {
  return cleanText(page.claim, page.mustProve || page.title);
}

function planningEvidencePlan(page: PlanningAuditPage) {
  return Array.isArray(page.evidencePlan) ? page.evidencePlan.filter(Boolean) : [];
}

function planningEvidenceSourceIds(page: PlanningAuditPage) {
  return Array.isArray(page.evidenceSourceIds) ? page.evidenceSourceIds.filter(Boolean) : [];
}

function planningWhatToCut(page: PlanningAuditPage) {
  return Array.isArray(page.whatToCut) && page.whatToCut.length ? page.whatToCut : [`不要把「${page.mustProve}」写成空泛口号`];
}

function planningSuccessCriteria(page: PlanningAuditPage) {
  return Array.isArray(page.successCriteria) && page.successCriteria.length
    ? page.successCriteria
    : [`标题能直接指向「${page.role}」`, `正文能证明「${page.mustProve}」`, "至少出现 1 个结构化模块而不是纯 bullet"];
}

function planningContentBlocks(page: PlanningAuditPage) {
  if (Array.isArray(page.contentBlocks) && page.contentBlocks.length) {
    return page.contentBlocks;
  }
  return [
    { title: "页面主张", body: planningClaim(page), priority: "must" as const },
    { title: "证明目标", body: page.mustProve, priority: "must" as const },
    { title: "证据需求", body: (page.evidenceNeeded || []).slice(0, 3).join("、") || "待补证据", priority: "should" as const }
  ];
}

function planningLayoutReason(page: PlanningAuditPage) {
  return page.layoutReason || `「${page.role}」适合使用 ${page.suggestedLayout} 结构，把主张、证据和行动拆开呈现。`;
}

function normalizeWeights(dimensions: RuleDimensionSeed[]): ReviewDimension[] {
  const merged = new Map<string, RuleDimensionSeed>();
  dimensions.forEach((dimension) => {
    if (!merged.has(dimension.key)) {
      merged.set(dimension.key, { ...dimension });
      return;
    }
    const current = merged.get(dimension.key)!;
    merged.set(dimension.key, {
      ...current,
      defaultWeight: Math.max(current.defaultWeight, dimension.defaultWeight),
      deductionTriggers: unique([...current.deductionTriggers, ...dimension.deductionTriggers]),
      evidenceRequired: unique([...current.evidenceRequired, ...dimension.evidenceRequired])
    });
  });
  const raw = [...merged.values()];
  const total = raw.reduce((sum, item) => sum + item.defaultWeight, 0) || 100;
  let used = 0;
  return raw.map((item, index) => {
    const weight = index === raw.length - 1 ? 100 - used : Math.max(5, Math.round((item.defaultWeight / total) * 100));
    used += weight;
    return {
      key: item.key,
      name: item.name,
      weight,
      why: item.why,
      deductionRules: item.deductionTriggers,
      evidenceRequired: item.evidenceRequired
    };
  });
}

export function detectPPTType(prompt: string, uploadedAssets: UploadedAsset[] = []): { type: PPTType; confidence: number; audience: string; goal: string } {
  const detected = detectPPTTypeContract(prompt, uploadedAssets);
  return { type: detected.reviewType, confidence: detected.confidence, audience: detected.audience, goal: detected.goal };
}

function reviewTypeFromContentPlan(type: string | undefined): PPTType | undefined {
  if (type === "proposal" || type === "product_intro") return "product_proposal";
  if (type === "project_report") return "project_report";
  if (type === "courseware") return "courseware";
  if (type === "company_profile") return "company_profile";
  if (type === "travel_plan") return "travel_guide";
  if (type === "financial_report") return "financial_analysis";
  if (type === "business_plan") return "business_bp";
  if (type === "policy_interpretation") return "policy_report";
  if (type === "activity_plan") return "event_plan";
  return undefined;
}

export function generateReviewRules(input: { prompt: string; pptType: PPTType; audience: string; goal: string; uploadedAssets?: UploadedAsset[] }): ReviewRuleSet {
  const seed = pptTypeRuleSeeds[input.pptType] || pptTypeRuleSeeds.general_report;
  const dimensions = normalizeWeights(seed.dimensions);
  return {
    id: `rules-${input.pptType}-${Date.now()}`,
    pptType: input.pptType,
    pptTypeLabel: seed.label,
    audience: input.audience,
    goal: input.goal,
    totalScore: 100,
    dimensions,
    requiredPages: seed.requiredPages,
    missingContentDeductions: seed.requiredPages.map((page) => `缺少「${page.title}」或无法证明「${page.mustProve}」时扣分。`),
    vagueOrRepeatedContent: seed.vaguePatterns,
    evidenceNeeds: seed.evidenceNeeds,
    generatedAt: new Date().toISOString()
  };
}

export function buildPlanningAudit(input: { prompt: string; ruleSet: ReviewRuleSet; research?: ResearchItem[]; uploadedAssets?: UploadedAsset[] }): PlanningAudit {
  const { ruleSet } = input;
  const research = input.research || [];
  const uploadedAssets = input.uploadedAssets || [];
  const [minSlides, maxSlides] = pptTypeRuleSeeds[ruleSet.pptType].recommendedSlides;
  const recommendedSlideCount = Math.min(maxSlides, Math.max(minSlides, ruleSet.requiredPages.length + 1));
  const materialsToUse = unique([
    ...research.slice(0, 6).map((item) => materialLabel(item)),
    ...uploadedAssets.slice(0, 4).map((asset) => materialLabel(asset)),
    ...ruleSet.evidenceNeeds
  ]).filter(Boolean);
  const materialsToDiscard = [
    "无法核验来源的口号式表述",
    "与受众决策无关的泛泛背景",
    "重复出现但没有新增判断的页面",
    "只描述“背景、意义、方案”但不说明责任、验收和下一步的内容",
    ...ruleSet.vagueOrRepeatedContent.map((item) => `空泛表述：「${item}」`)
  ].slice(0, 8);
  const pageRoles = ruleSet.requiredPages.slice(0, recommendedSlideCount).map((page, index): PlanningAuditPage => {
    const evidenceNeeded = unique([...ruleSet.evidenceNeeds.slice(0, 3), ...page.requiredKeywords]);
    const evidenceSourceIds = evidenceSourceIdsForPage(page, research, index);
    const evidencePlan = evidencePlanForPage(page, ruleSet, research, uploadedAssets, index);
    const sourceLabels = evidenceSourceIds
      .map((id) => research.find((item) => item.id === id))
      .filter(Boolean)
      .map((item) => materialLabel(item));
    const assetLabels = uploadedAssets.filter((asset) => asset.analysis).slice(0, 2).map((asset) => materialLabel(asset));
    const claim = claimForPage(page, ruleSet, input.prompt);
    const contentBlocks = contentBlocksForPage(page, ruleSet, evidencePlan, input.prompt);
    return {
      page: index + 1,
      title: page.title,
      role: page.role,
      claim,
      mustProve: page.mustProve,
      evidenceNeeded,
      evidencePlan,
      evidenceSourceIds,
      whatToUse: unique([...sourceLabels, ...assetLabels, ...evidenceNeeded]).slice(0, 5),
      whatToCut: [
        `不要写与「${page.role}」无关的泛背景`,
        `不要重复使用「${ruleSet.vagueOrRepeatedContent[0] || "全面提升"}」这类口号`,
        `不要把「${page.mustProve}」写成没有指标或动作的抽象判断`
      ],
      contentBlocks,
      layoutReason: layoutReason(page.layout, page),
      riskIfWeak: riskForPage(page, ruleSet),
      speakerIntent: `讲这一页时先给结论「${claim}」，再用证据说明「${page.mustProve}」，最后把判断导向「${ruleSet.goal}」。`,
      revisionPrompt: `请重写「${page.title}」：保留页面角色「${page.role}」，标题结论化，补充${evidenceNeeded.slice(0, 3).join("、")}，删除口号和重复背景，并使用${page.layout}结构。`,
      successCriteria: successCriteriaForPage(page, ruleSet),
      suggestedLayout: page.layout
    };
  });

  return {
    audience: ruleSet.audience,
    expectedDecision: ruleSet.goal,
    coreMessage: `这份「${ruleSet.pptTypeLabel}」要让${ruleSet.audience}判断：${pptTypeRuleSeeds[ruleSet.pptType].coreQuestion}`,
    recommendedSlideCount,
    recommendedStructure: pageRoles.map((page) => `${page.page}. ${page.title}：${page.role}｜${planningClaim(page)}`),
    pageRoles,
    materialsToUse,
    materialsToDiscard,
    likelyDeductions: [
      ...ruleSet.missingContentDeductions.slice(0, 5),
      `缺少证据支撑会影响「${ruleSet.dimensions.find((d) => d.key === "evidence")?.name || "证据支撑"}」得分。`,
      "如果页面只堆背景、意义、方案，会因缺少可执行性和验收口径扣分。"
    ]
  };
}

function slideText(slide: DesignSlide) {
  return cleanText([
    slide.title,
    slide.subtitle,
    slide.pageIntent,
    ...(slide.bullets || []),
    slide.speakerNote,
    JSON.stringify(slide.sections || [])
  ].join(" "));
}

function visibleSectionText(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(visibleSectionText);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value)
    .filter(([key]) => key !== "type" && key !== "sourceIds" && key !== "imagePrompt")
    .flatMap(([, entry]) => visibleSectionText(entry));
}

function slideVisibleText(slide: DesignSlide) {
  return cleanText([
    slide.title,
    slide.subtitle,
    ...(slide.bullets || []),
    ...(slide.sections || []).flatMap((section) => visibleSectionText(section))
  ].join(" "));
}

function projectText(project: CanvasProject) {
  return cleanText([
    project.title,
    project.prompt,
    ...(project.outline || []).map((item) => `${item.title} ${item.note}`),
    ...(project.plan || []).map((item) => `${item.title} ${item.layout} ${item.elements.join(" ")}`),
    ...(project.slides || []).map(slideText)
  ].join(" "));
}

function bestSlideForPage(project: CanvasProject, page: RequiredPageSeed, index: number) {
  const slides = project.slides || [];
  const exact = slides.find((slide) => includesAny(slideText(slide), page.requiredKeywords));
  return exact || slides[index] || slides[slides.length - 1];
}

function bestSlideForPlanningPage(project: CanvasProject, page: PlanningAuditPage, index: number) {
  const slides = project.slides || [];
  const pageText = cleanText(`${page.title} ${page.role} ${planningClaim(page)} ${page.mustProve} ${(page.evidenceNeeded || []).join(" ")}`);
  const scored = slides.map((slide, slideIndex) => {
    const txt = slideText(slide);
    const titleHit = cleanText(slide.title) === page.title || cleanText(slide.title).includes(page.title) || page.title.includes(cleanText(slide.title)) ? 45 : 0;
    const roleHit = slide.pageIntent === page.role || txt.includes(page.role) ? 20 : 0;
    const evidenceHit = page.evidenceNeeded.filter((need) => txt.includes(need)).length * 8;
    const keywordHit = pageText.split("").filter((char) => char.trim() && txt.includes(char)).length;
    const indexAffinity = Math.max(0, 10 - Math.abs(slideIndex - index) * 3);
    return { slide, score: titleHit + roleHit + evidenceHit + Math.min(keywordHit, 18) + indexAffinity };
  });
  const best = scored.sort((a, b) => b.score - a.score)[0];
  return best?.score ? best.slide : slides[index] || slides[slides.length - 1];
}

function deduction(id: string, dimension: ReviewDimension, points: number, where: string, reason: string, suggestion: string, autoFixable: boolean, extra: Partial<ReviewDeduction> = {}): ReviewDeduction {
  return {
    id,
    dimensionKey: dimension.key,
    dimensionName: dimension.name,
    points,
    where,
    reason,
    suggestion,
    autoFixable,
    ...extra
  };
}

function sectionsForPlanningPage(page: PlanningAuditPage, project: CanvasProject, index: number): SlideSection[] {
  const pageEvidenceSourceIds = planningEvidenceSourceIds(page);
  const evidencePlan = planningEvidencePlan(page);
  const contentBlocks = planningContentBlocks(page);
  const weakRisk = page.riskIfWeak || "如果本页没有证明目标和证据，会在页面策划维度扣分。";
  const sourceIds = pageEvidenceSourceIds.length ? pageEvidenceSourceIds : project.research?.[index % Math.max(1, project.research.length)]?.id ? [project.research[index % Math.max(1, project.research.length)].id] : [];
  const source = sourceIds[0] ? project.research?.find((item) => item.id === sourceIds[0]) : undefined;
  const evidenceNote = evidencePlan.length
    ? evidencePlan.slice(0, 3).join("；")
    : page.evidenceNeeded.slice(0, 3).join("、");
  const coreTips: SlideSection = {
    type: "tips-grid",
    title: "页面策划",
    items: contentBlocks.slice(0, 4).map((block) => ({
      title: block.title,
      body: block.evidence ? `${block.body}（证据：${block.evidence}）` : block.body,
      tag: block.priority === "must" ? "必写" : block.priority === "should" ? "建议" : "可选"
    }))
  };
  const sourceNote: SlideSection = source
    ? {
        type: "source-note",
        sourceIds,
        text: `证据计划：${evidenceNote}。参考资料：${source.sourceName || source.source || source.title}`
      }
    : {
        type: "source-note",
        text: `证据计划：${evidenceNote || "待补充真实来源、上传资料或数据口径"}`
      };

  if (page.suggestedLayout === "timeline" || page.suggestedLayout === "process" || /阶段|路径|计划|流程/.test(page.title)) {
    return [
      {
        type: "timeline",
        title: planningLayoutReason(page),
        steps: contentBlocks.slice(0, 5).map((block, blockIndex) => ({
          label: `0${blockIndex + 1}`,
          title: block.title,
          body: block.body
        }))
      },
      coreTips,
      sourceNote
    ];
  }

  if (page.suggestedLayout === "matrix" || /责任|分工|功能|场景|模块/.test(page.title)) {
    return [
      {
        type: "table",
        title: page.title.includes("责任") ? "责任矩阵" : "内容映射矩阵",
        columns: ["模块", "要证明", "证据/动作"],
        rows: contentBlocks.slice(0, 5).map((block) => [block.title, block.body, block.evidence || evidencePlan[0] || page.evidenceNeeded[0] || "待补证据"])
      },
      coreTips,
      sourceNote
    ];
  }

  if (page.suggestedLayout === "stats" || /指标|目标|预算|成效|数据/.test(page.title)) {
    return [
      {
        type: "stat-card",
        title: "评价口径",
        stats: contentBlocks.slice(0, 4).map((block, blockIndex) => ({
          label: block.title,
          value: blockIndex === 0 ? "必达" : blockIndex === 1 ? "可验收" : "可复核",
          note: block.body
        }))
      },
      {
        type: "bar-chart",
        title: "内容优先级",
        unit: "%",
        bars: contentBlocks.slice(0, 4).map((block, blockIndex) => ({
          label: block.title,
          value: block.priority === "must" ? 92 - blockIndex * 4 : block.priority === "should" ? 78 - blockIndex * 4 : 62,
          note: block.body
        }))
      },
      sourceNote
    ];
  }

  if (page.suggestedLayout === "comparison" || /风险|应对|选择|备选/.test(page.title)) {
    return [
      {
        type: "table",
        title: "风险与应对",
        columns: ["风险/问题", "扣分原因", "应对动作"],
        rows: contentBlocks.slice(0, 4).map((block) => [block.title, weakRisk, block.body])
      },
      {
        type: "warning",
        title: "最容易扣分",
        body: weakRisk,
        severity: "warn"
      },
      sourceNote
    ];
  }

  if (page.suggestedLayout === "checklist" || /验收|清单|避坑/.test(page.title)) {
    return [
      {
        type: "tips-grid",
        title: "验收检查点",
        items: planningSuccessCriteria(page).slice(0, 6).map((criterion, criterionIndex) => ({
          title: `检查 ${criterionIndex + 1}`,
          body: criterion,
          tag: criterionIndex < 3 ? "硬项" : "补强"
        }))
      },
      coreTips,
      sourceNote
    ];
  }

  if (page.suggestedLayout === "closing" || /下一步|决策|行动/.test(page.title)) {
    return [
      {
        type: "callout",
        title: planningClaim(page),
        body: page.speakerIntent || `围绕「${page.mustProve}」完成判断收束。`,
        accent: "blue"
      },
      {
        type: "tips-grid",
        title: "行动清单",
        items: contentBlocks.slice(0, 4).map((block) => ({
          title: block.title,
          body: block.body,
          tag: block.priority === "must" ? "需拍板" : "跟进"
        }))
      },
      sourceNote
    ];
  }

  if (page.suggestedLayout === "cover") {
    return [
      { type: "tag-row", tags: [page.role, "评分前置", "证据驱动", "可编辑"] },
      {
        type: "callout",
        title: planningClaim(page),
        body: page.speakerIntent || `围绕「${page.mustProve}」建立开场判断。`,
        accent: "blue"
      },
      sourceNote
    ];
  }

  return [
    {
      type: "callout",
      title: planningClaim(page),
      body: page.mustProve,
      accent: index % 2 ? "purple" : "blue"
    },
    coreTips,
    sourceNote
  ];
}

export function reviewGeneratedProject(projectInput: CanvasProject, ruleSet: ReviewRuleSet, planningAudit: PlanningAudit): PPTReviewReport {
  const project = cleanProject(projectInput);
  const text = projectText(project);
  const deductions: ReviewDeduction[] = [];

  const dimensionByKey = new Map(ruleSet.dimensions.map((dimension) => [dimension.key, dimension]));
  const fallbackDimension = ruleSet.dimensions[0];
  const logic = dimensionByKey.get("logic") || fallbackDimension;
  const evidence = dimensionByKey.get("evidence") || fallbackDimension;
  const planning = dimensionByKey.get("page_planning") || fallbackDimension;
  const delivery = dimensionByKey.get("delivery") || fallbackDimension;
  const finalContentReadiness: ReviewDimension = {
    key: "finalContentReadiness",
    name: "页面成稿度",
    weight: 10,
    why: "检查页面是否已经从策划说明转成可直接上屏的正文。",
    deductionRules: ["正文为空", "正文只是计划说明", "成稿层阻断仍未修复"],
    evidenceRequired: ["SlideContentDraft", "visibleBlocks", "finalTitle"]
  };
  const scaffoldLeakageScore: ReviewDimension = {
    key: "scaffoldLeakageScore",
    name: "脚手架泄漏",
    weight: 10,
    why: "检查受众问题、核心观点、证据安排等策划脚手架是否进入可见页面。",
    deductionRules: ["可见文本包含脚手架词", "可见文本包含内部字段"],
    evidenceRequired: ["slide visible text"]
  };
  const titleQualityScore: ReviewDimension = {
    key: "titleQualityScore",
    name: "标题质量",
    weight: 8,
    why: "检查标题是否是短观点句，而不是元说明或过长说明句。",
    deductionRules: ["标题过长", "标题为本页要等元句"],
    evidenceRequired: ["slide.title"]
  };
  const evidenceRealizationScore: ReviewDimension = {
    key: "evidenceRealizationScore",
    name: "证据落地",
    weight: 8,
    why: "检查证据链是否被自然语言片段落到页面。",
    deductionRules: ["证据覆盖高但页面没有证据片段", "强断言缺少证据"],
    evidenceRequired: ["evidenceSnippets", "source-note"]
  };
  const deliveryReadinessScore: ReviewDimension = {
    key: "deliveryReadinessScore",
    name: "交付准备度",
    weight: 8,
    why: "检查主题类型、页面内容和导出前阻断是否可交付。",
    deductionRules: ["销售提案政务串味", "课程课件活动策划串味", "成稿质量报告无效"],
    evidenceRequired: ["pptType", "deckContentQualityReport"]
  };

  ruleSet.requiredPages.forEach((page, index) => {
    const hasPage = page.requiredKeywords.some((keyword) => text.includes(keyword));
    if (!hasPage) {
      deductions.push(
        deduction(
          `missing-page-${index + 1}`,
          planning,
          5,
          `全局：缺少「${page.title}」`,
          `「${ruleSet.pptTypeLabel}」必须出现承担「${page.role}」作用的页面，否则无法证明：${page.mustProve}`,
          `新增或改写一页「${page.title}」，页面角色为「${page.role}」，重点证明「${page.mustProve}」。`,
          true,
          { missingKeyword: page.requiredKeywords[0] }
        )
      );
    }
  });

  ruleSet.evidenceNeeds.forEach((need, index) => {
    const needHitInPlanning = planningAudit.pageRoles.some((page) =>
      [page.title, page.role, page.mustProve, planningClaim(page), ...page.evidenceNeeded, ...planningEvidencePlan(page), ...planningContentBlocks(page).flatMap((block) => [block.title, block.body, block.evidence || ""])]
        .join(" ")
        .includes(need)
    );
    if (!text.includes(need) && !needHitInPlanning && !project.research?.some((item) => `${item.title}${item.summary}${item.sourceName}`.includes(need))) {
      deductions.push(
        deduction(
          `missing-evidence-${index + 1}`,
          evidence,
          3,
          `证据层：缺少「${need}」`,
          `当前内容没有明确引用或说明「${need}」，关键判断缺少可核验依据。`,
          `补充「${need}」相关资料，并在对应页面添加 source-note 或证据块。`,
          true,
          { missingKeyword: need }
        )
      );
    }
  });

  ruleSet.vagueOrRepeatedContent.forEach((phrase, index) => {
    const count = (text.match(new RegExp(phrase, "g")) || []).length;
    if (count >= 2) {
      deductions.push(
        deduction(
          `vague-${index + 1}`,
          delivery,
          2,
          `文案：重复出现「${phrase}」`,
          "该表述偏口号化，重复出现会削弱专业可信度。",
          "改成可验证的动作、指标、场景或责任对象。",
          true
        )
      );
    }
  });

  if (project.slides.length < planningAudit.recommendedSlideCount - 1) {
    deductions.push(deduction("slide-count-low", planning, 6, "全局：页数不足", `当前 ${project.slides.length} 页，低于推荐 ${planningAudit.recommendedSlideCount} 页，可能缺少必要论证。`, "按策划审核稿补齐必备页面。", true));
  }

  const research = project.research || [];
  const verifiedSources = research.filter((item) => item.status === "verified" || item.sourceType === "official" || item.sourceType === "document");
  const fallbackSources = research.filter((item) => item.status === "fallback" || item.sourceType === "local");
  if (research.length < 3) {
    deductions.push(
      deduction(
        "research-source-too-thin",
        evidence,
        ruleSet.pptType === "travel_guide" || ruleSet.pptType === "project_report" || ruleSet.pptType === "financial_analysis" ? 6 : 4,
        "全局：资料源不足",
        `当前只有 ${research.length} 条资料源，无法支撑高可信度交付。`,
        "先执行公开检索或上传 PDF / Word / PPT / TXT 资料，再重新生成或重新评分。",
        false,
        { missingKeyword: "真实资料源" }
      )
    );
  }
  if (verifiedSources.length === 0 && ["project_report", "financial_analysis", "policy_report", "product_proposal", "company_profile"].includes(ruleSet.pptType)) {
    deductions.push(
      deduction(
        "no-verified-source",
        evidence,
        8,
        "全局：缺少官方或已验证来源",
        "当前没有官方、文档或已验证资料源，关键结论只能作为演示初稿，不能直接交付。",
        "补充官网、政策文件、财报原文、产品文档、客户案例或上传资料，并把来源映射到对应页面。",
        false,
        { missingKeyword: "官方来源" }
      )
    );
  }
  if (fallbackSources.length >= Math.max(1, Math.ceil(research.length * 0.6))) {
    deductions.push(
      deduction(
        "fallback-source-heavy",
        evidence,
        4,
        "全局：fallback 资料占比过高",
        "当前资料更多是占位或本地兜底来源，信息可信度不足。",
        "用搜索模块拉取公开网页，或上传可解析资料替换 fallback 来源。",
        false,
        { missingKeyword: "可核验来源" }
      )
    );
  }

  const evidenceReport = project.evidenceReport;
  if (evidenceReport) {
    evidenceReport.blockingIssues.slice(0, 4).forEach((item, index) => {
      deductions.push(deduction(`evidence-blocking-${index + 1}`, evidence, 7, "证据中枢：导出阻断风险", item, "补充上传资料、公开来源或降低确定性表述后重新评分。", false, { missingKeyword: "可追溯证据" }));
    });
    evidenceReport.unsupportedClaims.slice(0, 6).forEach((item, index) => {
      deductions.push(deduction(`evidence-unsupported-${index + 1}`, evidence, 4, `证据中枢：${item.role}`, `本页存在未支撑主张：${item.claims.slice(0, 2).join("、")}`, "为该页补充上传资料、公开链接、数据口径，或改写为待确认判断。", true, { missingKeyword: item.claims[0] }));
    });
    evidenceReport.lowConfidenceSlides.slice(0, 6).forEach((item, index) => {
      deductions.push(deduction(`evidence-low-confidence-${index + 1}`, evidence, 3, `证据中枢：${item.role}`, `本页证据覆盖率 ${item.evidenceCoverage}%，来源置信度 ${item.sourceConfidence}%，不足以支撑强事实表达。`, "补充可追溯来源；如果暂时没有来源，把结论改成建议、假设或待确认。", true, { missingKeyword: item.role }));
    });
  }

  if (project.deckContentQualityReport && !project.deckContentQualityReport.valid) {
    deductions.push(deduction(
      "content-draft-report-blocked",
      deliveryReadinessScore,
      12,
      "全局：SlideContentDraft 成稿质量",
      `成稿层仍有 ${project.deckContentQualityReport.blockingSlides.length} 个阻断页，平均分 ${project.deckContentQualityReport.averageScore}。`,
      "先修复 SlideContentDraft blocking issues，再进入导出。",
      false
    ));
  }

  planningAudit.pageRoles.forEach((page, index) => {
    const slide = bestSlideForPlanningPage(project, page, index);
    if (!slide) return;
    const txt = slideText(slide);
    const claim = planningClaim(page);
    const contentBlocks = planningContentBlocks(page);
    const evidencePlan = planningEvidencePlan(page);
    const evidenceSourceIds = planningEvidenceSourceIds(page);
    const successCriteria = planningSuccessCriteria(page);
    const hasClaim = txt.includes(claim) || contentBlocks.some((block) => txt.includes(block.title) || txt.includes(block.body.slice(0, 8)));
    const hasEvidencePlan =
      evidenceSourceIds.some((sourceId) => slide.sourceIds?.includes(sourceId) || slide.evidenceBlockIds?.includes(sourceId)) ||
      page.evidenceNeeded.some((need) => txt.includes(need)) ||
      slide.sections?.some((section) => section.type === "source-note");
    const missingCriteria = successCriteria.filter((criterion) => {
      const keywords = criterion.match(/「([^」]+)」/g)?.map((item) => item.replace(/[「」]/g, "")) || [];
      return keywords.length ? !keywords.some((keyword) => txt.includes(keyword)) : false;
    });
    if (!hasClaim) {
      deductions.push(
        deduction(
          `weak-claim-${index + 1}`,
          logic,
          3,
          `第 ${index + 1} 页：${page.title}`,
          `页面没有明确支撑策划主张「${claim}」，容易变成只列信息。`,
          page.revisionPrompt || `请重写「${page.title}」，标题结论化并补充证据计划。`,
          true,
          { slideId: slide.id, slideTitle: slide.title }
        )
      );
    }
    if (!hasEvidencePlan) {
      deductions.push(
        deduction(
          `weak-evidence-plan-${index + 1}`,
          evidence,
          3,
          `第 ${index + 1} 页：${page.title}`,
          `页面没有落实证据计划：${evidencePlan.slice(0, 2).join("；") || page.evidenceNeeded.slice(0, 3).join("、")}`,
          "为本页补充 sourceIds、source-note 或来自上传资料的 evidenceBlockIds。",
          true,
          { slideId: slide.id, slideTitle: slide.title, missingKeyword: page.evidenceNeeded[0] }
        )
      );
    }
    if (missingCriteria.length >= 2) {
      deductions.push(
        deduction(
          `weak-criteria-${index + 1}`,
          planning,
          2,
          `第 ${index + 1} 页：${page.title}`,
          `页面未满足策划审核标准：${missingCriteria.slice(0, 2).join("；")}`,
          `按成功标准补齐：${successCriteria.slice(0, 3).join("；")}`,
          true,
          { slideId: slide.id, slideTitle: slide.title }
        )
      );
    }
  });

  project.slides.forEach((slide, index) => {
    const txt = slideText(slide);
    const visibleTxt = slideVisibleText(slide);
    const draft = project.contentDrafts?.find((item) => item.slideIndex === index + 1 || item.finalTitle === slide.title);
    const scaffoldMatches = findScaffoldMatches(visibleTxt);
    const internalMatches = findInternalFieldMatches(visibleTxt);
    const evidenceSnippetCount = draft?.evidenceSnippets?.length || (slide.sections || []).filter((section) => section.type === "source-note").length;
    if (/^(本页|这一页|页面|此页|必须|需要|要把|用于|用来|证明|讲清|说明)/.test(cleanText(slide.title))) {
      deductions.push(deduction(`meta-title-${index + 1}`, titleQualityScore, 6, `第 ${index + 1} 页：${slide.title}`, "标题仍是元说明或策划指令。", "改写为 12-28 字短观点标题。", true, { slideId: slide.id, slideTitle: slide.title }));
    }
    if (scaffoldMatches.length) {
      deductions.push(deduction(`scaffold-leakage-${index + 1}`, scaffoldLeakageScore, 12, `第 ${index + 1} 页：${slide.title}`, `可见文本包含脚手架词：${scaffoldMatches.slice(0, 5).join("、")}`, "通过 SlideContentDraft 改写成用户可读正文，删除策划标签。", false, { slideId: slide.id, slideTitle: slide.title }));
    }
    if (internalMatches.length) {
      deductions.push(deduction(`internal-field-leakage-${index + 1}`, scaffoldLeakageScore, 10, `第 ${index + 1} 页：${slide.title}`, `可见文本包含内部字段：${internalMatches.slice(0, 5).join("、")}`, "内部 ID 与工程字段只能保留在 metadata，不得进入可见页。", false, { slideId: slide.id, slideTitle: slide.title }));
    }
    if (index > 0 && visibleTxt.replace(/\s+/g, "").length < 60) {
      deductions.push(deduction(`final-content-thin-${index + 1}`, finalContentReadiness, 6, `第 ${index + 1} 页：${slide.title}`, "页面可见正文过薄，尚未形成可评审成稿。", "补充 3-5 个真实正文块，并保留低置信提示。", true, { slideId: slide.id, slideTitle: slide.title }));
    }
    if (draft && draft.evidenceSnippets.length === 0 && /一定|必然|显著提升|大幅降低|确保|保证|完全解决|唯一|最佳/.test(visibleTxt)) {
      deductions.push(deduction(`strong-claim-no-evidence-${index + 1}`, evidenceRealizationScore, 8, `第 ${index + 1} 页：${slide.title}`, "页面存在强确定表达，但没有证据片段支撑。", "补充 evidenceSnippets，或把结论改为待确认判断。", true, { slideId: slide.id, slideTitle: slide.title }));
    }
    if ((project.slideEvidenceMaps?.[index]?.evidenceCoverage || 0) >= 50 && evidenceSnippetCount === 0) {
      deductions.push(deduction(`evidence-not-realized-${index + 1}`, evidenceRealizationScore, 7, `第 ${index + 1} 页：${slide.title}`, "证据覆盖率不低，但页面没有自然语言证据片段。", "将 matchedEvidenceBlocks 改写为可见 evidenceSnippets 或 source-note。", true, { slideId: slide.id, slideTitle: slide.title }));
    }
    if (ruleSet.pptType === "product_proposal" && /政务蓝|评审汇报|GOVERNANCE REVIEW/i.test(visibleTxt)) {
      deductions.push(deduction(`proposal-theme-leakage-${index + 1}`, deliveryReadinessScore, 12, `第 ${index + 1} 页：${slide.title}`, "销售提案出现政务或评审汇报主题串味。", "按商务合作 / 销售提案 / 解决方案主题重新生成可见内容。", false, { slideId: slide.id, slideTitle: slide.title }));
    }
    if (ruleSet.pptType === "courseware" && /event_plan|活动亮白|执行策划|EVENT PLAN/i.test(visibleTxt)) {
      deductions.push(deduction(`courseware-theme-leakage-${index + 1}`, deliveryReadinessScore, 12, `第 ${index + 1} 页：${slide.title}`, "课程课件出现活动策划类型串味。", "锁定 courseware 类型并重写课程页内容。", false, { slideId: slide.id, slideTitle: slide.title }));
    }
    if ([...cleanText(slide.title)].length > 32) {
      deductions.push(deduction(`long-title-${index + 1}`, delivery, 2, `第 ${index + 1} 页：${slide.title}`, "标题过长，会削弱页面结论感。", "压缩为一句结论式短标题，把解释放到副标题或卡片中。", true, { slideId: slide.id, slideTitle: slide.title }));
    }
    if ((slide.bullets?.length || 0) > 6) {
      deductions.push(deduction(`dense-bullets-${index + 1}`, delivery, 3, `第 ${index + 1} 页：${slide.title}`, "正文要点过多，导出后容易变成堆字页。", "保留 3-5 个关键点，拆成表格、流程或对比卡。", true, { slideId: slide.id, slideTitle: slide.title }));
    }
    if ((slide.sections?.length || 0) === 0 && index > 0) {
      deductions.push(deduction(`no-section-${index + 1}`, planning, 3, `第 ${index + 1} 页：${slide.title}`, "缺少页面级结构模块，导出时会退化为普通 bullet 页。", "补充 tips-grid、table、timeline、stat-card 等结构化模块。", true, { slideId: slide.id, slideTitle: slide.title }));
    }
    if (index > 0 && project.research?.length && !(slide.sourceIds?.length || slide.evidenceBlockIds?.length || slide.sections?.some((section) => section.type === "source-note"))) {
      deductions.push(deduction(`no-source-${index + 1}`, evidence, 3, `第 ${index + 1} 页：${slide.title}`, "本页没有来源映射，后续难以复核。", "为本页挂载 sourceIds，或添加 source-note 说明证据来源。", true, { slideId: slide.id, slideTitle: slide.title }));
    }
    if (ruleSet.pptType === "project_report" && /背景|意义|方案/.test(txt) && !/验收|指标|计划|责任|下一步|风险/.test(txt) && index > 2) {
      deductions.push(deduction(`project-action-thin-${index + 1}`, dimensionByKey.get("feasibility") || planning, 4, `第 ${index + 1} 页：${slide.title}`, "项目汇报不能只讲背景和方案，本页缺少可执行信息。", "补充推进计划、责任主体、验收口径或下一步动作。", true, { slideId: slide.id, slideTitle: slide.title }));
    }
  });

  const pageReviews: PageReview[] = project.slides.map((slide, index) => {
    const planned = planningAudit.pageRoles[index] || planningAudit.pageRoles[planningAudit.pageRoles.length - 1];
    const slideDeductions = deductions.filter((item) => item.slideId === slide.id);
    const score = clamp(100 - slideDeductions.reduce((sum, item) => sum + item.points * 4, 0));
    const feedback = slideDeductions.length
      ? slideDeductions.slice(0, 3).map((item) => `${item.reason} 建议：${item.suggestion}`)
      : [`本页承担「${planned?.role || "内容说明"}」作用，当前没有明显硬扣分。`];
    return {
      slideId: slide.id,
      page: index + 1,
      title: slide.title,
      role: planned?.role || "内容说明",
      score,
      feedback,
      shouldProve: planned?.mustProve || "证明本页核心观点。",
      autoFixable: slideDeductions.some((item) => item.autoFixable)
    };
  });

  const rawScore = 100 - deductions.reduce((sum, item) => sum + item.points, 0);
  const totalScore = clamp(rawScore);
  const level: ReviewLevel = totalScore >= 88 ? "优秀" : totalScore >= 75 ? "可交付" : totalScore >= 60 ? "需要修改" : "不建议交付";
  const reviewDimensions = [
    ...ruleSet.dimensions,
    finalContentReadiness,
    scaffoldLeakageScore,
    titleQualityScore,
    evidenceRealizationScore,
    deliveryReadinessScore
  ];
  const dimensionScores = reviewDimensions.map((dimension) => {
    const lost = deductions.filter((item) => item.dimensionKey === dimension.key).reduce((sum, item) => sum + item.points, 0);
    const score = clamp(dimension.weight - lost, 0, dimension.weight);
    return {
      key: dimension.key,
      name: dimension.name,
      weight: dimension.weight,
      score,
      comment: lost ? `扣 ${lost} 分：${deductions.filter((item) => item.dimensionKey === dimension.key).slice(0, 2).map((item) => item.where).join("；")}` : "达到当前规则要求。"
    };
  });
  const priorityFixes = [...deductions].sort((a, b) => b.points - a.points).slice(0, 3);
  const reusableRules = deductions.slice(0, 8).map((item) => ({
    id: `${ruleSet.pptType}-${item.id}`,
    pptType: ruleSet.pptType,
    pptTypeLabel: ruleSet.pptTypeLabel,
    dimensionKey: item.dimensionKey,
    dimensionName: item.dimensionName,
    condition: item.missingKeyword ? `如果 ${ruleSet.pptTypeLabel} 缺少「${item.missingKeyword}」相关页面或内容块` : `如果出现扣分项：${item.where}`,
    deduction: item.reason,
    autoSuggestion: item.suggestion,
    createdAt: new Date().toISOString(),
    hits: 1
  }));

  return {
    totalScore,
    level,
    dimensionScores,
    deductions,
    pageReviews,
    priorityFixes,
    reusableRules,
    reviewedAt: new Date().toISOString()
  };
}

function loadPersistedRules(): PersistedDeductionRule[] {
  try {
    if (!fs.existsSync(persistedRulesPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(persistedRulesPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistDeductionRules(report: PPTReviewReport) {
  const existing = loadPersistedRules();
  const byId = new Map(existing.map((item) => [item.id, item]));
  report.reusableRules.forEach((rule) => {
    const old = byId.get(rule.id);
    byId.set(rule.id, old ? { ...old, hits: old.hits + 1, createdAt: old.createdAt } : rule);
  });
  fs.mkdirSync(path.dirname(persistedRulesPath), { recursive: true });
  fs.writeFileSync(persistedRulesPath, JSON.stringify([...byId.values()].slice(-200), null, 2), "utf8");
}

export function initializeReviewCenter(input: { prompt: string; uploadedAssets?: UploadedAsset[]; research?: ResearchItem[]; contentPlanPptType?: string }): ReviewCenterState {
  const detected = detectPPTType(input.prompt, input.uploadedAssets || []);
  const lockedType = reviewTypeFromContentPlan(input.contentPlanPptType);
  const pptType = lockedType || detected.type;
  const ruleSet = generateReviewRules({
    prompt: input.prompt,
    pptType,
    audience: detected.audience,
    goal: detected.goal,
    uploadedAssets: input.uploadedAssets
  });
  const planningAudit = buildPlanningAudit({
    prompt: input.prompt,
    ruleSet,
    research: input.research,
    uploadedAssets: input.uploadedAssets
  });
  return {
    pptType,
    pptTypeLabel: pptTypeLabels[pptType],
    confidence: lockedType ? Math.max(detected.confidence, 92) : detected.confidence,
    audience: detected.audience,
    goal: detected.goal,
    ruleSet,
    planningAudit
  };
}

export function applyContentPlanToReviewCenter(state: ReviewCenterState, contentPlan: ContentPlan): ReviewCenterState {
  const existingPages = state.planningAudit.pageRoles || [];
  const pageRoles = contentPlan.slidePlan.map((slide, index): PlanningAuditPage => {
    const existing = existingPages.find((page) => page.role === slide.role || page.title === slide.titleIntent) || existingPages[index];
    return {
      page: index + 1,
      title: slide.titleIntent,
      role: slide.role,
      claim: existing?.claim || slide.pagePurpose,
      mustProve: slide.mustProve,
      evidenceNeeded: unique([...(slide.suggestedEvidence || []), ...(existing?.evidenceNeeded || []), ...contentPlan.evidenceNeeds.slice(0, 2)]).slice(0, 6),
      evidencePlan: existing?.evidencePlan?.length ? existing.evidencePlan : slide.suggestedEvidence,
      evidenceSourceIds: existing?.evidenceSourceIds || [],
      whatToUse: unique([...(existing?.whatToUse || []), ...slide.suggestedEvidence]).slice(0, 5),
      whatToCut: unique([...(slide.avoid || []), ...(existing?.whatToCut || []), ...contentPlan.contentScope.avoid.slice(0, 2)]).slice(0, 5),
      contentBlocks: existing?.contentBlocks?.length
        ? existing.contentBlocks
        : [
            { title: "页面目的", body: slide.pagePurpose, priority: "must" },
            { title: "证明任务", body: slide.mustProve, evidence: slide.suggestedEvidence[0], priority: "must" },
            { title: "证据安排", body: slide.suggestedEvidence.slice(0, 3).join("、") || contentPlan.evidenceNeeds.slice(0, 3).join("、"), priority: "should" }
          ],
      layoutReason: existing?.layoutReason || `使用「${slide.layoutHint || "matrix"}」承载${slide.role}，服务 ContentPlan 的页面目的。`,
      riskIfWeak: existing?.riskIfWeak || `${slide.role}不足会影响「${contentPlan.decisionGoal}」的判断。`,
      speakerIntent: existing?.speakerIntent || `围绕「${slide.pagePurpose}」讲清「${slide.mustProve}」。`,
      revisionPrompt: existing?.revisionPrompt || `请优化「${slide.titleIntent}」，突出${slide.pagePurpose}，补充${slide.suggestedEvidence.slice(0, 3).join("、")}。`,
      successCriteria: existing?.successCriteria?.length ? existing.successCriteria : [slide.pagePurpose, slide.mustProve, ...slide.suggestedEvidence.slice(0, 2)],
      suggestedLayout: slide.layoutHint || existing?.suggestedLayout || "matrix"
    };
  });
  return {
    ...state,
    audience: contentPlan.audience,
    goal: contentPlan.decisionGoal,
    contentPlan,
    planningAudit: {
      ...state.planningAudit,
      audience: contentPlan.audience,
      expectedDecision: contentPlan.decisionGoal,
      coreMessage: contentPlan.coreMessage,
      recommendedSlideCount: Math.max(state.planningAudit.recommendedSlideCount, contentPlan.slidePlan.length),
      recommendedStructure: pageRoles.map((page) => `${page.page}. ${page.title}：${page.role}｜${page.claim}`),
      pageRoles,
      materialsToUse: unique([...state.planningAudit.materialsToUse, ...contentPlan.evidenceNeeds]).slice(0, 12),
      materialsToDiscard: unique([...state.planningAudit.materialsToDiscard, ...contentPlan.contentScope.exclude, ...contentPlan.contentScope.avoid]).slice(0, 12),
      likelyDeductions: unique([...state.planningAudit.likelyDeductions, ...contentPlan.riskWarnings]).slice(0, 12)
    }
  };
}

function visualFormToLayout(form: RecommendedVisualForm): SlideLayout {
  const map: Record<RecommendedVisualForm, SlideLayout> = {
    bullet_list: "split",
    card_grid: "matrix",
    comparison_table: "comparison",
    process_flow: "process",
    timeline: "timeline",
    metric_dashboard: "stats",
    matrix: "matrix",
    architecture_diagram: "process",
    roadmap: "timeline",
    map_route: "map",
    risk_table: "comparison",
    quote_highlight: "quote",
    case_card: "cards",
    summary_action: "closing",
    coordinate_graph: "split",
    table_formula_graph_mapping: "comparison",
    parameter_compare: "comparison",
    worked_example_steps: "process",
    practice_feedback: "checklist",
    concept_relation: "matrix"
  };
  return map[form] || "matrix";
}

function contentBlocksFromPagePlan(plan: SlidePagePlan): PlanningAuditPage["contentBlocks"] {
  return plan.contentBlocks.slice(0, 5).map((block) => ({
    title: block.title,
    body: block.body,
    evidence: block.evidenceNeed,
    priority: block.priority
  }));
}

export function applySlidePagePlansToReviewCenter(state: ReviewCenterState, slidePagePlans: SlidePagePlan[]): ReviewCenterState {
  if (!slidePagePlans.length) return state;
  const existingPages = state.planningAudit.pageRoles || [];
  const pageRoles = slidePagePlans.map((plan, index): PlanningAuditPage => {
    const existing = existingPages.find((page) => page.role === plan.role) || existingPages[index];
    const suggestedLayout = visualFormToLayout(plan.recommendedVisualForm);
    const evidenceNeeded = unique([...(plan.evidenceNeed || []), ...(existing?.evidenceNeeded || [])]).slice(0, 6);
    const contentBlocks = contentBlocksFromPagePlan(plan);
    const title = compact(plan.coreClaim, 34);
    return {
      page: index + 1,
      title,
      role: plan.role,
      claim: plan.coreClaim,
      mustProve: plan.mustProve,
      evidenceNeeded,
      evidencePlan: existing?.evidencePlan?.length ? existing.evidencePlan : evidenceNeeded.map((item) => `补齐「${item}」的来源或口径`),
      evidenceSourceIds: existing?.evidenceSourceIds || [],
      whatToUse: unique([...(existing?.whatToUse || []), ...evidenceNeeded, plan.informationHierarchy.primary]).slice(0, 5),
      whatToCut: unique([...(plan.avoidPatterns || []), ...(existing?.whatToCut || [])]).slice(0, 6),
      contentBlocks: contentBlocks.length ? contentBlocks : existing?.contentBlocks || [],
      layoutReason: plan.layoutIntent || existing?.layoutReason || `使用页面级策划推荐的表达形式承载「${plan.role}」。`,
      riskIfWeak: plan.generationWarnings?.[0] || existing?.riskIfWeak || `${plan.role}不足会影响整套 PPT 判断。`,
      speakerIntent: `先回答「${plan.audienceQuestion}」，再证明「${plan.mustProve}」。`,
      revisionPrompt: `请优化第 ${index + 1} 页：标题观点化，围绕「${plan.coreClaim}」，补齐${evidenceNeeded.slice(0, 3).join("、")}，避免${plan.avoidPatterns.slice(0, 2).join("、")}。`,
      successCriteria: plan.qualityChecks?.length ? plan.qualityChecks : existing?.successCriteria || [plan.mustProve],
      suggestedLayout
    };
  });
  return {
    ...state,
    slidePagePlans,
    planningAudit: {
      ...state.planningAudit,
      recommendedSlideCount: Math.max(state.planningAudit.recommendedSlideCount, slidePagePlans.length),
      recommendedStructure: pageRoles.map((page) => `${page.page}. ${page.title}：${page.role}｜${page.claim}`),
      pageRoles,
      materialsToUse: unique([...state.planningAudit.materialsToUse, ...slidePagePlans.flatMap((plan) => plan.evidenceNeed)]).slice(0, 14),
      materialsToDiscard: unique([...state.planningAudit.materialsToDiscard, ...slidePagePlans.flatMap((plan) => plan.avoidPatterns)]).slice(0, 14),
      likelyDeductions: unique([
        ...state.planningAudit.likelyDeductions,
        ...slidePagePlans.flatMap((plan) => plan.generationWarnings)
      ]).slice(0, 14)
    }
  };
}

export function applyLayoutPlansToReviewCenter(state: ReviewCenterState, layoutPlans: LayoutPlan[]): ReviewCenterState {
  if (!layoutPlans.length) return state;
  const pageRoles = (state.planningAudit.pageRoles || []).map((page, index) => {
    const layoutPlan =
      layoutPlans.find((plan) => plan.pageIndex === index + 1) ||
      layoutPlans[index];
    if (!layoutPlan) return page;
    const suggestedLayout = slideLayoutForSelectedLayout(layoutPlan.selectedLayout);
    return {
      ...page,
      suggestedLayout,
      layoutReason: [
        "版式执行层已按推荐表达形式选择可编辑结构。",
        `本页将围绕「${page.role}」承载核心判断、证明任务和来源说明。`,
        layoutPlan.fallbackReason ? `调整原因：${layoutPlan.fallbackReason}` : ""
      ].filter(Boolean).join(" "),
      successCriteria: unique([
        ...page.successCriteria,
        "页面结构必须与本页角色一致，不能退化为普通文字堆叠。",
        "导出 PPTX 时必须保留可编辑文本、形状、表格或图表。"
      ]).slice(0, 7)
    };
  });
  return {
    ...state,
    layoutPlans,
    planningAudit: {
      ...state.planningAudit,
      pageRoles,
      likelyDeductions: unique([
        ...state.planningAudit.likelyDeductions,
        ...layoutPlans.flatMap((plan) => plan.warnings),
        ...(state.contentPlan?.playbookId === "teacher_math_science_v1" ? [
          "检查表格、解析式与坐标图像是否同时出现并建立映射。",
          "检查参数比较是否包含真实多图直线对比。",
          "检查例题是否有完整题目与分步结论。",
          "检查练习是否包含学生作答动作和反馈标准。",
          "阻止商务汇报语义、内部字段和模板残片进入课件。"
        ] : [])
      ]).slice(0, 14)
    }
  };
}

export function applyEvidenceReportToReviewCenter(
  state: ReviewCenterState,
  evidenceReport: DeckEvidenceReport,
  slideEvidenceMaps: SlideEvidenceMap[]
): ReviewCenterState {
  const weakPages = slideEvidenceMaps
    .filter((map) => map.evidenceCoverage < 50 || map.sourceConfidence < 55 || map.unsupportedClaims.length > 0)
    .map((map) => `${map.role}：覆盖率 ${map.evidenceCoverage}%，来源置信度 ${map.sourceConfidence}%`);
  const sourceIssues = [
    evidenceReport.sourceSummary.bySourceType.search_result ? "" : "未获得真实公开检索来源，不能把用户需求当作外部事实。",
    evidenceReport.sourceSummary.bySourceType.user_input ? "存在仅由用户输入支撑的页面，需要降低确定性或补资料。" : "",
    evidenceReport.sourceSummary.bySourceType.system_fallback ? "存在兜底来源，不能作为正式交付依据。" : "",
    evidenceReport.sourceSummary.bySourceType.test_fixture ? "存在本地测试夹具，只能用于验收链路，不能作为真实来源。" : "",
    evidenceReport.sourceSummary.bySourceType.uploaded_file && !evidenceReport.sourceSummary.verifiedOrTraceableSources ? "上传资料未完成有效解析，需要重新上传或转为文本资料。" : ""
  ].filter(Boolean);
  return {
    ...state,
    evidenceReport,
    slideEvidenceMaps,
    planningAudit: {
      ...state.planningAudit,
      materialsToUse: unique([
        ...state.planningAudit.materialsToUse,
        `证据来源 ${evidenceReport.sourceSummary.totalSources} 个，证据块 ${evidenceReport.sourceSummary.totalEvidenceBlocks} 个`,
        `真实公开来源 ${evidenceReport.sourceSummary.bySourceType.search_result || 0} 个，已解析上传资料 ${evidenceReport.sourceSummary.bySourceType.uploaded_file || 0} 个`
      ]).slice(0, 14),
      likelyDeductions: unique([
        ...state.planningAudit.likelyDeductions,
        ...evidenceReport.blockingIssues,
        ...evidenceReport.warnings,
        ...sourceIssues,
        ...weakPages.slice(0, 4)
      ]).slice(0, 14)
    }
  };
}

function pageToSlide(page: PlanningAuditPage, index: number, project: CanvasProject): DesignSlide {
  const profile = profileForPrompt(project.prompt || project.title);
  const layout = layoutForSlide(profile, index, page.suggestedLayout);
  const evidencePlan = planningEvidencePlan(page);
  const sourceIds = planningEvidenceSourceIds(page).length
    ? planningEvidenceSourceIds(page)
    : project.research?.[index % Math.max(1, project.research.length)]?.id
      ? [project.research[index % Math.max(1, project.research.length)].id]
      : [];
  return {
    id: `slide-review-${index + 1}-${Date.now()}`,
    title: compactForDesign(page.title, profile.titleMax),
    subtitle: compactForDesign(planningClaim(page), profile.subtitleMax),
    tone: `${profile.name} / 评审中枢`,
    layout,
    bullets: [
      planningClaim(page),
      page.mustProve,
      `证据计划：${evidencePlan.slice(0, 2).join("；") || page.evidenceNeeded.slice(0, 3).join(" / ")}`,
      `舍弃：${planningWhatToCut(page)[0]}`
    ],
    sourceIds,
    pageIntent: page.role,
    visualPrompt: visualPromptForSlide(profile, project, { title: page.title, subtitle: planningClaim(page), tone: profile.name, layout, id: page.title, pageIntent: page.role }, index),
    speakerNote: `${page.speakerIntent || `围绕「${page.mustProve}」完成页面论证。`} 自动修复依据：${page.revisionPrompt || "评审中枢页面策划"}`,
    sections: sectionsForPlanningPage(page, project, index)
  };
}

function matchesPlannedPage(slide: DesignSlide, page: PlanningAuditPage) {
  const title = cleanText(slide.title);
  return title === page.title || title.includes(page.title) || page.title.includes(title) || slide.pageIntent === page.role;
}

function matchesSlideTitle(slide: DesignSlide, title: string, role?: string) {
  const slideTitle = cleanText(slide.title);
  const targetTitle = cleanText(title);
  return slideTitle === targetTitle || slideTitle.includes(targetTitle) || targetTitle.includes(slideTitle) || (!!role && slide.pageIntent === role);
}

function improveSlide(slide: DesignSlide, fixes: ReviewDeduction[], project: CanvasProject): DesignSlide {
  let next = { ...slide, bullets: [...(slide.bullets || [])], sections: [...(slide.sections || [])] };
  const source = project.research?.[0];
  if (fixes.some((fix) => fix.id.startsWith("long-title"))) {
    next.title = compact(next.title, 24);
  }
  if (fixes.some((fix) => fix.id.startsWith("dense-bullets"))) {
    next.bullets = next.bullets.slice(0, 5);
  }
  if (fixes.some((fix) => fix.id.startsWith("no-section") || fix.id.includes("project-action-thin"))) {
    next.sections.push({
      type: "tips-grid",
      title: "评审补强",
      items: [
        { title: "页面作用", body: next.pageIntent || next.subtitle || "说明本页承担的汇报作用。", tag: "角色" },
        { title: "应补内容", body: fixes.map((fix) => fix.suggestion).slice(0, 2).join("；"), tag: "扣分修复" },
        { title: "交付判断", body: "补齐后重新评分，确认是否达到可交付标准。", tag: "复评" }
      ]
    });
  }
  if (fixes.some((fix) => fix.id.startsWith("no-source")) && source) {
    next.sourceIds = next.sourceIds?.length ? next.sourceIds : [source.id];
    next.sections.push({ type: "source-note", sourceIds: [source.id], text: `参考资料：${source.sourceName || source.source || source.title}` });
  }
  const evidenceFixes = fixes.filter((fix) => fix.id.startsWith("missing-evidence"));
  if (evidenceFixes.length) {
    const evidenceText = evidenceFixes.map((fix) => fix.missingKeyword || fix.where.replace(/^证据层：缺少「|」$/g, "")).filter(Boolean).join("、");
    next.bullets = unique([...(next.bullets || []), `待核验证据：${evidenceText}`]).slice(0, 5);
    next.sections.push({
      type: "source-note",
      text: `评审中枢已标记待补证据：${evidenceText}。后续应替换为真实文件、公开链接或数据口径。`
    });
  }
  return next;
}

function improveSlideWithPlanning(slide: DesignSlide, page: PlanningAuditPage, fixes: ReviewDeduction[], project: CanvasProject, index: number): DesignSlide {
  const plannedSections = sectionsForPlanningPage(page, project, index);
  const sourceIds = planningEvidenceSourceIds(page).length ? planningEvidenceSourceIds(page) : slide.sourceIds || [];
  const mergedBullets = unique([
    planningClaim(page),
    page.mustProve,
    ...planningContentBlocks(page).filter((block) => block.priority === "must").map((block) => `${block.title}：${block.body}`),
    ...(slide.bullets || [])
  ]).slice(0, 5);
  const hasSourceNote = slide.sections?.some((section) => section.type === "source-note");
  const next: DesignSlide = {
    ...slide,
    title: page.title,
    subtitle: planningClaim(page),
    layout: page.suggestedLayout,
    pageIntent: page.role,
    bullets: mergedBullets,
    sourceIds: sourceIds.length ? sourceIds : slide.sourceIds,
    speakerNote: `${page.speakerIntent || `围绕「${page.mustProve}」完成页面论证。`} 已自动处理扣分项：${fixes.map((fix) => fix.where).slice(0, 3).join("；")}`,
    sections: uniqueSections([
      ...plannedSections,
      ...(slide.sections || []).filter((section) => section.type !== "source-note" || !hasSourceNote)
    ])
  };
  return improveSlide(next, fixes, project);
}

function uniqueSections(sections: SlideSection[]) {
  const seen = new Set<string>();
  const result: SlideSection[] = [];
  sections.forEach((section) => {
    const key = `${section.type}-${"title" in section ? section.title || "" : ""}-${JSON.stringify(section).slice(0, 80)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(section);
    }
  });
  return result.slice(0, 5);
}

function supplementalSlideForProject(reviewState: ReviewCenterState, project: CanvasProject, index: number): DesignSlide {
  const source = project.research?.[index % Math.max(1, project.research.length)];
  const isRubric = index % 2 === 0;
  return {
    id: `slide-review-extra-${index + 1}-${Date.now()}`,
    title: isRubric ? "汇报主线与评审口径" : "资料映射与待补证据",
    subtitle: isRubric ? "把领导关注点提前变成页面生成和评分依据" : "说明哪些材料已使用、哪些证据仍需补齐",
    tone: "评审中枢补强",
    layout: isRubric ? "matrix" : "evidence",
    bullets: isRubric
      ? ["建设必要性", "方案完整性", "可执行性", "验收与成效", "下一步决策"]
      : reviewState.planningAudit.materialsToUse.slice(0, 5),
    sourceIds: source ? [source.id] : [],
    pageIntent: isRubric ? "评审口径说明" : "证据追溯",
    speakerNote: isRubric
      ? "用于说明本 PPT 为什么按当前结构生成，以及后续评分依据。"
      : "用于保留资料来源、待补证据和后续人工核验入口。",
    sections: isRubric
      ? [
          {
            type: "table",
            title: "评审口径",
            columns: ["维度", "要回答的问题", "对应页面"],
            rows: [
              ["必要性", "为什么现在必须做", "建设背景与现实痛点"],
              ["完整性", "做什么、怎么做", "平台总体架构 / 功能场景"],
              ["可执行", "谁来做、何时做", "实施路径 / 责任分工"],
              ["验收", "如何判断做成", "验收标准与成效指标"]
            ]
          },
          { type: "source-note", text: `生成依据：${reviewState.ruleSet.pptTypeLabel}评分规则与策划审核稿。` }
        ]
      : [
          {
            type: "tips-grid",
            title: "资料使用计划",
            items: reviewState.planningAudit.materialsToUse.slice(0, 6).map((item, itemIndex) => ({
              title: `资料 ${itemIndex + 1}`,
              body: item,
              tag: itemIndex < 3 ? "已用" : "待补"
            }))
          },
          {
            type: "warning",
            title: "待补证据",
            body: reviewState.planningAudit.likelyDeductions.slice(0, 2).join("；"),
            severity: "info"
          },
          source
            ? { type: "source-note", sourceIds: [source.id], text: `参考资料：${source.sourceName || source.source || source.title}` }
            : { type: "source-note", text: "待补充公开资料或上传资料。"}
        ]
  };
}

function summarizeAppliedFixes(report: PPTReviewReport, nextReview: PPTReviewReport, applied: string[]): ReviewFixSummary {
  const unresolvedBlockers = [...nextReview.deductions]
    .filter((item) => !item.autoFixable || item.dimensionKey === "evidence")
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);
  const fixedDeductionCount = report.deductions.filter((item) => !nextReview.deductions.some((next) => next.id === item.id)).length;
  const scoreDelta = nextReview.totalScore - report.totalScore;
  const needsSources = unresolvedBlockers.some((item) => item.dimensionKey === "evidence" || /资料|证据|来源|公开|上传/.test(`${item.where} ${item.reason} ${item.suggestion}`));
  const status: ReviewFixSummary["status"] =
    needsSources ? "needs_sources" : scoreDelta > 0 ? "improved" : fixedDeductionCount > 0 || applied.length > 0 ? "partial" : "no_change";
  const message =
    status === "needs_sources"
      ? "已应用可自动修复项，但仍缺真实资料或可追溯来源，不能靠自动改文案直接提分。"
      : status === "improved"
        ? "已应用可自动修复项，评分有所提升。"
        : status === "partial"
          ? "已应用部分结构和文案修复，但仍有未解决扣分项。"
          : "没有找到可安全自动修复的扣分项，需要补资料或重新生成。";

  return {
    beforeScore: report.totalScore,
    afterScore: nextReview.totalScore,
    scoreDelta,
    beforeDeductionCount: report.deductions.length,
    afterDeductionCount: nextReview.deductions.length,
    appliedCount: applied.length,
    fixedDeductionCount,
    unresolvedCount: nextReview.deductions.length,
    unresolvedManualCount: nextReview.deductions.filter((item) => !item.autoFixable).length,
    unresolvedBlockers,
    status,
    message
  };
}

export function applyReviewFixes(projectInput: CanvasProject, reviewState: ReviewCenterState): { project: CanvasProject; review: PPTReviewReport; applied: string[]; summary: ReviewFixSummary } {
  const project = cleanProject(projectInput);
  const report = reviewState.postReview || reviewGeneratedProject(project, reviewState.ruleSet, reviewState.planningAudit);
  const applied: string[] = [];
  let slides = [...project.slides];

  const autoFixes = report.deductions.filter((fix) => fix.autoFixable);
  autoFixes.forEach((fix) => {
    if (fix.id.startsWith("missing-page")) {
      const page = reviewState.planningAudit.pageRoles.find((item) => fix.where.includes(item.title));
      if (page && !slides.some((slide) => matchesPlannedPage(slide, page))) {
        slides.push(pageToSlide(page, slides.length, project));
        applied.push(`新增页面：${page.title}`);
      }
      return;
    }
    if (fix.slideId) {
      slides = slides.map((slide, slideIndex) => {
        if (slide.id !== fix.slideId) return slide;
        const slideFixes = report.deductions.filter((item) => item.slideId === slide.id && item.autoFixable);
        const plannedPage =
          reviewState.planningAudit.pageRoles.find((page) => fix.where.includes(page.title) || matchesPlannedPage(slide, page)) ||
          reviewState.planningAudit.pageRoles[slideIndex] ||
          reviewState.planningAudit.pageRoles[reviewState.planningAudit.pageRoles.length - 1];
        return plannedPage ? improveSlideWithPlanning(slide, plannedPage, slideFixes, project, slideIndex) : improveSlide(slide, slideFixes, project);
      });
      applied.push(`优化页面：${fix.slideTitle || fix.slideId}`);
    }
  });

  const evidenceFixes = autoFixes.filter((fix) => fix.id.startsWith("missing-evidence"));
  if (evidenceFixes.length) {
    const targetIndex = Math.max(0, slides.findIndex((slide) => /验收|指标|计划|实施|证据|来源/.test(slide.title)));
    slides = slides.map((slide, index) => (index === targetIndex ? improveSlide(slide, evidenceFixes, project) : slide));
    applied.push(`补充待核验证据：${evidenceFixes.map((fix) => fix.missingKeyword || fix.where).slice(0, 4).join("、")}`);
  }

  reviewState.planningAudit.pageRoles.forEach((page) => {
    const exists = slides.some((slide) => matchesPlannedPage(slide, page));
    if (!exists && slides.length < 12) {
      slides.push(pageToSlide(page, slides.length, project));
      applied.push(`补齐必备页：${page.title}`);
    }
  });

  const nextProject = cleanProject({
    ...project,
    slides: slides.slice(0, 12),
    outline: slides.slice(0, 11).map((slide, index) => ({
      id: `outline-review-${index + 1}`,
      page: index + 1,
      title: slide.title,
      note: slide.subtitle,
      evidenceBlockIds: slide.evidenceBlockIds
    })),
    plan: slides.slice(0, 11).map((slide, index) => ({
      id: `plan-review-${index + 1}`,
      page: index + 1,
      title: slide.title,
      layout: slide.layout || "cards",
      elements: slide.bullets?.slice(0, 5) || [],
      evidenceBlockIds: slide.evidenceBlockIds
    }))
  });
  const nextReview = reviewGeneratedProject(nextProject, reviewState.ruleSet, reviewState.planningAudit);
  persistDeductionRules(nextReview);
  const uniqueApplied = unique(applied).slice(0, 8);
  return { project: nextProject, review: nextReview, applied: uniqueApplied, summary: summarizeAppliedFixes(report, nextReview, uniqueApplied) };
}

export function applyReviewFixesToPage(
  projectInput: CanvasProject,
  reviewState: ReviewCenterState,
  target: { slideId?: string; pageIndex?: number }
): { project: CanvasProject; review: PPTReviewReport; applied: string[]; summary: PageReviewFixSummary } {
  const project = cleanProject(projectInput);
  const report = reviewState.postReview || reviewGeneratedProject(project, reviewState.ruleSet, reviewState.planningAudit);
  const bySlideId = target.slideId ? project.slides.findIndex((slide) => slide.id === target.slideId) : -1;
  const targetIndex = bySlideId >= 0 ? bySlideId : Math.max(0, Math.min(project.slides.length - 1, Number(target.pageIndex) || 0));
  const slide = project.slides[targetIndex];
  if (!slide) {
    const review = reviewGeneratedProject(project, reviewState.ruleSet, reviewState.planningAudit);
    const summary: PageReviewFixSummary = {
      page: 0,
      slideTitle: "未找到页面",
      beforeTotalScore: report.totalScore,
      afterTotalScore: review.totalScore,
      appliedCount: 0,
      remainingPageDeductions: 0,
      status: "no_page_fix",
      message: "没有找到可修复的当前页。",
      applied: [],
      remainingBlockers: []
    };
    return { project, review, applied: [], summary };
  }

  const pageNumber = targetIndex + 1;
  const beforePageReview = report.pageReviews.find((item) => item.slideId === slide.id || item.page === pageNumber);
  const currentRole = beforePageReview?.role || slide.pageIntent || reviewState.planningAudit.pageRoles[targetIndex]?.role || "";
  const pageFixes = report.deductions.filter((fix) => {
    if (!fix.autoFixable) return false;
    const haystack = `${fix.id} ${fix.where} ${fix.slideTitle || ""} ${fix.reason} ${fix.suggestion}`;
    return fix.slideId === slide.id || fix.slideTitle === slide.title || haystack.includes(`第 ${pageNumber} 页`) || (currentRole && haystack.includes(currentRole));
  });
  const selectedFixes = Array.from(new Map(pageFixes.map((fix) => [fix.id, fix])).values());
  const plannedPage =
    reviewState.planningAudit.pageRoles.find((page) => matchesPlannedPage(slide, page) || page.page === pageNumber || page.role === currentRole) ||
    reviewState.planningAudit.pageRoles[targetIndex];
  const applied: string[] = [];
  let nextSlide = slide;

  if (selectedFixes.length || plannedPage) {
    nextSlide = plannedPage ? improveSlideWithPlanning(slide, plannedPage, selectedFixes, project, targetIndex) : improveSlide(slide, selectedFixes, project);
    if (plannedPage) {
      applied.push(`按「${plannedPage.role}」重建当前页结构`);
    }
    selectedFixes.slice(0, 4).forEach((fix) => {
      applied.push(`处理：${fix.where}`);
    });
  }

  const slides = project.slides.map((item, index) => (index === targetIndex ? nextSlide : item));
  const nextProject = cleanProject({
    ...project,
    slides,
    outline: slides.slice(0, 11).map((item, index) => ({
      id: project.outline[index]?.id || `outline-page-fix-${index + 1}`,
      page: index + 1,
      title: item.title,
      note: item.subtitle,
      evidenceBlockIds: item.evidenceBlockIds
    })),
    plan: slides.slice(0, 11).map((item, index) => ({
      id: project.plan[index]?.id || `plan-page-fix-${index + 1}`,
      page: index + 1,
      title: item.title,
      layout: item.layout || "cards",
      elements: item.bullets?.slice(0, 5) || [],
      evidenceBlockIds: item.evidenceBlockIds
    }))
  });
  const nextReview = reviewGeneratedProject(nextProject, reviewState.ruleSet, reviewState.planningAudit);
  persistDeductionRules(nextReview);
  const afterSlide = nextProject.slides[targetIndex];
  const afterPageReview = nextReview.pageReviews.find((item) => item.slideId === afterSlide?.id || item.page === pageNumber);
  const remainingPageDeductions = nextReview.deductions.filter((fix) => {
    const haystack = `${fix.where} ${fix.slideTitle || ""}`;
    return fix.slideId === afterSlide?.id || fix.slideTitle === afterSlide?.title || haystack.includes(`第 ${pageNumber} 页`) || (currentRole && haystack.includes(currentRole));
  });
  const remainingBlockers = remainingPageDeductions.filter((fix) => !fix.autoFixable || fix.dimensionKey === "evidence").slice(0, 4);
  const needsSources = remainingBlockers.some((fix) => fix.dimensionKey === "evidence" || /资料|证据|来源|公开|上传/.test(`${fix.where} ${fix.reason} ${fix.suggestion}`));
  const scoreDelta = (afterPageReview?.score || 0) - (beforePageReview?.score || 0);
  const status: PageReviewFixSummary["status"] = needsSources
    ? "needs_sources"
    : applied.length && scoreDelta > 0
      ? "improved"
      : applied.length
        ? "updated"
        : "no_page_fix";
  const message =
    status === "needs_sources"
      ? "当前页已做结构/文案修复，但仍缺真实来源或可追溯证据。"
      : status === "improved"
        ? "当前页已应用可自动修复项，并完成重新评分。"
        : status === "updated"
          ? "当前页已按策划审核稿重建，但分数提升有限，建议继续人工核验。"
          : "当前页没有可安全自动修复的扣分项。";
  const uniqueApplied = unique(applied).slice(0, 8);
  const summary: PageReviewFixSummary = {
    page: pageNumber,
    slideId: afterSlide?.id,
    slideTitle: afterSlide?.title || slide.title,
    beforeTotalScore: report.totalScore,
    afterTotalScore: nextReview.totalScore,
    beforePageScore: beforePageReview?.score,
    afterPageScore: afterPageReview?.score,
    appliedCount: uniqueApplied.length,
    remainingPageDeductions: remainingPageDeductions.length,
    status,
    message,
    applied: uniqueApplied,
    remainingBlockers
  };
  return { project: nextProject, review: nextReview, applied: uniqueApplied, summary };
}

export function applyPlanningAuditToProject(projectInput: CanvasProject, reviewState: ReviewCenterState): CanvasProject {
  const project = cleanProject(projectInput);
  const profile = project.contentPlan ? getDesignProfile({ ...project, reviewCenter: reviewState }) : profileForPrompt(project.prompt || project.title);
  const sourceSlides = [...project.slides];
  // Beautify is an independent pipeline: preserve uploaded page identity and
  // order. Generic teaching drafts must never replace the source deck with a
  // newly generated nine-page template.
  if (project.mode === "beautify" && project.beautifyPlan && sourceSlides.some((slide) => slide.id.startsWith("beautify-original-slide-"))) {
    return cleanProject({
      ...project,
      slides: sourceSlides,
      outline: sourceSlides.map((slide, index) => ({
        id: `outline-beautify-${index + 1}`,
        page: index + 1,
        title: slide.title,
        note: slide.pageIntent || slide.subtitle,
        evidenceBlockIds: slide.evidenceBlockIds?.length ? slide.evidenceBlockIds : slide.sourceIds,
      })),
      plan: sourceSlides.map((slide, index) => ({
        id: `plan-beautify-${index + 1}`,
        page: index + 1,
        title: slide.title,
        layout: slide.layout || "comparison",
        elements: [
          `原页：${slide.title}`,
          slide.pageIntent || "逐页诊断",
          slide.speakerNote || "保留教学意图并优化层级",
        ],
        evidenceBlockIds: slide.evidenceBlockIds?.length ? slide.evidenceBlockIds : slide.sourceIds,
      })),
    });
  }
  if (project.contentDrafts?.length) {
    const draftedSlides = project.contentDrafts
      .sort((a, b) => a.slideIndex - b.slideIndex)
      .map((draft, index): DesignSlide => {
        const existing = sourceSlides[index];
        const layout = layoutForSlide(profile, index + 1, existing?.layout || "split");
        return {
          ...(existing || {}),
          id: existing?.id || `slide-draft-${index + 1}`,
          title: compactForDesign(draft.finalTitle, profile.titleMax),
          subtitle: compactForDesign(draft.leadSentence || draft.subtitle, profile.subtitleMax),
          tone: `${profile.name} / ${draft.role}`,
          layout,
          pageIntent: draft.role,
          bullets: draft.visibleBlocks.map((block) => `${block.title}：${block.body}`).slice(0, 5),
          sourceIds: draft.evidenceSnippets.map((snippet) => snippet.sourceId || "").filter(Boolean),
          evidenceBlockIds: draft.evidenceSnippets.map((snippet) => snippet.evidenceBlockId || "").filter(Boolean),
          visualPrompt: existing?.visualPrompt || visualPromptForSlide(profile, project, { ...(existing || {}), id: existing?.id || `slide-draft-${index + 1}`, title: draft.finalTitle, subtitle: draft.leadSentence, tone: "", layout, pageIntent: draft.role }, index + 1),
          speakerNote: draft.speakerNotes,
          sections: draft.sections || [
            {
              type: "tips-grid",
              title: "页面要点",
              items: draft.visibleBlocks.slice(0, 6).map((block) => ({ title: block.title, body: block.body, tag: block.tag }))
            },
            { type: "source-note", text: draft.evidenceSnippets[0]?.text || draft.confidenceNote }
          ]
        };
      })
      .slice(0, 12);
    return cleanProject({
      ...project,
      slides: draftedSlides,
      outline: draftedSlides.map((slide, index) => ({
        id: `outline-draft-${index + 1}`,
        page: index + 1,
        title: slide.title,
        note: slide.subtitle,
        evidenceBlockIds: slide.evidenceBlockIds?.length ? slide.evidenceBlockIds : slide.sourceIds
      })),
      plan: draftedSlides.map((slide, index) => ({
        id: `plan-draft-${index + 1}`,
        page: index + 1,
        title: slide.title,
        layout: slide.layout || "cards",
        elements: slide.bullets?.slice(0, 5) || [],
        evidenceBlockIds: slide.evidenceBlockIds?.length ? slide.evidenceBlockIds : slide.sourceIds
      }))
    });
  }
  const plannedSlides = reviewState.planningAudit.pageRoles.map((page, index) => {
    const existing = sourceSlides.find((slide) => matchesPlannedPage(slide, page));
    const planned = existing || pageToSlide(page, index + 1, project);
    const sourceIds = planningEvidenceSourceIds(page).length ? planningEvidenceSourceIds(page) : planned.sourceIds || [];
    const layout = layoutForSlide(profile, index + 1, page.suggestedLayout);
    return {
      ...planned,
      id: `slide-audit-${index + 1}`,
      title: compactForDesign(page.title, profile.titleMax),
      subtitle: compactForDesign(planningClaim(page), profile.subtitleMax),
      tone: `${profile.name} / ${page.role}`,
      layout,
      pageIntent: page.role,
      sourceIds,
      bullets: unique([
        planningClaim(page),
        page.mustProve,
        ...planningContentBlocks(page).filter((block) => block.priority === "must").map((block) => `${block.title}：${block.body}`),
        ...(planned.bullets || [])
      ]).slice(0, 5),
      visualPrompt: visualPromptForSlide(profile, project, { ...planned, title: page.title, subtitle: planningClaim(page), layout, pageIntent: page.role }, index + 1),
      speakerNote: `${page.speakerIntent || `围绕「${page.mustProve}」完成页面论证。`} 版式理由：${planningLayoutReason(page)}`,
      sections: uniqueSections([
        ...sectionsForPlanningPage(page, project, index),
        ...(planned.sections || []).filter((section) => section.type !== "source-note")
      ])
    };
  });

  const coverPage = reviewState.planningAudit.pageRoles[0];
  const coverSections = coverPage ? sectionsForPlanningPage(coverPage, project, 0) : sourceSlides[0]?.sections || [];
  const coverTitle = compact(project.title.replace(/\s*[，,].*$/g, ""), 24);
  const coverSlide = {
    ...(sourceSlides[0] || pageToSlide(reviewState.planningAudit.pageRoles[0], 0, project)),
    title: coverTitle || project.title,
    subtitle: reviewState.planningAudit.coreMessage,
    tone: `${profile.name} / 封面`,
    layout: "cover" as SlideLayout,
    pageIntent: "开场定调",
    bullets: [
      reviewState.planningAudit.coreMessage,
      `受众：${reviewState.audience}`,
      `目标：${reviewState.goal}`,
      `推荐结构：${reviewState.planningAudit.recommendedSlideCount} 页`
    ],
    visualPrompt: visualPromptForSlide(profile, project, sourceSlides[0] || pageToSlide(reviewState.planningAudit.pageRoles[0], 0, project), 0),
    sections: coverSections
  };
  const hasPagePlanContract = Boolean(reviewState.slidePagePlans?.length);
  const coreSlides = hasPagePlanContract
    ? plannedSlides
    : [
        coverSlide,
        ...plannedSlides.filter((slide) => slide.layout !== "cover")
      ];
  const supplementalSlides =
    hasPagePlanContract
      ? []
      : reviewState.ruleSet.pptType === "project_report"
      ? Array.from({ length: Math.max(0, reviewState.planningAudit.recommendedSlideCount - coreSlides.length) }, (_, extraIndex) =>
          supplementalSlideForProject(reviewState, project, coreSlides.length + extraIndex)
        )
      : sourceSlides.slice(1).filter((slide) => !plannedSlides.some((planned) => planned.title === slide.title || matchesSlideTitle(slide, planned.title, planned.pageIntent)));
  const orderedSlides = [
    ...coreSlides,
    ...supplementalSlides
  ].filter(Boolean) as DesignSlide[];

  const uniqueSlides: DesignSlide[] = [];
  const seen = new Set<string>();
  orderedSlides.forEach((slide) => {
    const key = slide.id || slide.title;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSlides.push(slide);
    }
  });

  const nextSlides = uniqueSlides.slice(0, 12);
  return cleanProject({
    ...project,
    title: project.title,
    slides: nextSlides,
    outline: nextSlides.slice(1).map((slide, index) => ({
      id: `outline-audit-${index + 1}`,
      page: index + 1,
      title: slide.title,
      note: slide.subtitle,
      evidenceBlockIds: slide.evidenceBlockIds?.length ? slide.evidenceBlockIds : slide.sourceIds
    })),
    plan: nextSlides.slice(1).map((slide, index) => ({
      id: `plan-audit-${index + 1}`,
      page: index + 1,
      title: slide.title,
      layout: slide.layout || "cards",
      elements: slide.bullets?.slice(0, 5) || [],
      evidenceBlockIds: slide.evidenceBlockIds?.length ? slide.evidenceBlockIds : slide.sourceIds
    }))
  });
}
