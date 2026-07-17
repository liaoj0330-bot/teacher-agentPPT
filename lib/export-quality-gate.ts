import type { CanvasProject, DesignSlide } from "@/lib/canvas-data";
import { findSpecForSlide } from "@/lib/deck-spec";
import { getLayoutDefinition, slideLayoutForSelectedLayout } from "@/lib/ppt-agent/layout-library";
import { findInternalFieldMatches, findScaffoldMatches } from "@/lib/ppt-agent/slide-content-validator";
import { pptTypeRuleSeeds, type PPTType } from "@/lib/ppt-review-rulebase";
import { cleanProject, cleanText } from "@/lib/text-sanitize";

export type ExportGateSeverity = "error" | "warn";

export type ExportGateIssue = {
  id: string;
  severity: ExportGateSeverity;
  title: string;
  detail: string;
  slideId?: string;
  slideTitle?: string;
  action?: string;
};

export type ExportGateExplanation = {
  status: "passed" | "blocked" | "needs_review";
  headline: string;
  summary: string;
  blockingCount: number;
  warningCount: number;
  primaryIssue?: ExportGateIssue;
  topActions: string[];
  missingRealSources: boolean;
  canAutoFix: boolean;
  canRetryAfterSources: boolean;
};

export type ExportGateResult = {
  ok: boolean;
  score: number;
  qualityBar: number;
  pptType: PPTType | "unknown";
  pptTypeLabel: string;
  issues: ExportGateIssue[];
  explanation: ExportGateExplanation;
};

const MOJIBAKE_PATTERN = /[\uFFFD]|[脙脗芒鈧撁ぢ掆€斆瀅]/;
const QUESTION_MARK_PLACEHOLDER_PATTERN = /\?{3,}/;
const INTERNAL_FIELD_PATTERN = /\b(day-route|hero-image|image-strip|tips-grid|stat-card|source-note|route-card|bar-chart|donut-chart|visualPrompt|pageIntent|evidenceBlockIds|sourceIds|layout|debug|mock|placeholder)\b/i;
const PLACEHOLDER_PATTERN = /占位|待替换|待补充|lorem|placeholder|generated visual|灰块|视觉模块|图片素材|示例模块|调试/i;

const CRITICAL_EVIDENCE_TYPES = new Set(["project_report", "financial_analysis", "policy_report", "product_proposal", "business_bp"]);

function slideText(slide: DesignSlide) {
  return cleanText([
    slide.title,
    slide.subtitle,
    slide.pageIntent,
    ...(slide.bullets || []),
    slide.speakerNote,
    ...(slide.sections || []).flatMap((section) => visibleSectionText(section))
  ].join(" "));
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
    ...(project.plan || []).map((item) => `${item.title} ${(item.elements || []).join(" ")}`),
    ...(project.slides || []).map(slideText)
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

function normalized(value: string) {
  return cleanText(value).replace(/\s+/g, "").replace(/[：:｜|·\-_/]/g, "");
}

function includesKeyword(text: string, keyword: string) {
  const clean = normalized(text);
  const target = normalized(keyword);
  return Boolean(target && clean.includes(target));
}

function matchesRequiredPage(project: CanvasProject, title: string, keywords: string[]) {
  const allSlides = project.slides || [];
  return allSlides.some((slide) => {
    const text = `${slide.title} ${slide.subtitle} ${slide.pageIntent || ""} ${(slide.bullets || []).join(" ")}`;
    if (includesKeyword(text, title)) return true;
    return keywords.some((keyword) => includesKeyword(text, keyword));
  });
}

function hasStructuredSections(slide: DesignSlide) {
  return (slide.sections || []).some((section) => section.type !== "hero-image" && section.type !== "image-strip");
}

function issue(input: ExportGateIssue): ExportGateIssue {
  return input;
}

function explainExportGate(input: {
  ok: boolean;
  score: number;
  qualityBar: number;
  pptTypeLabel: string;
  issues: ExportGateIssue[];
}): ExportGateExplanation {
  const blocking = input.issues.filter((item) => item.severity === "error");
  const warnings = input.issues.filter((item) => item.severity === "warn");
  const primaryIssue = blocking[0] || warnings[0];
  const missingRealSources = input.issues.some((item) => /source|evidence|search|真实|来源|证据|provider|fallback/i.test(`${item.id} ${item.title} ${item.detail} ${item.action || ""}`));
  const canAutoFix = input.issues.some((item) => /required-pages|slide-spec|layout-plan|missing-structure|DeckSpec|SlidePagePlan|LayoutPlan/i.test(item.id));
  const topActions = Array.from(new Set(input.issues.map((item) => cleanText(item.action)).filter(Boolean))).slice(0, 4);
  const status: ExportGateExplanation["status"] = input.ok ? "passed" : blocking.length ? "blocked" : "needs_review";
  const headline =
    status === "passed"
      ? "导出质量闸门已通过，可以生成可编辑 PPTX。"
      : missingRealSources
        ? "导出被拦截：当前缺少真实来源或证据链不足。"
        : "导出被拦截：当前稿件还没有达到可交付标准。";
  const summary =
    status === "passed"
      ? `${input.pptTypeLabel} 当前 ${input.score} 分，达到导出线 ${input.qualityBar}。`
      : `当前 ${input.score} 分，导出线 ${input.qualityBar}；发现 ${blocking.length} 个阻断项、${warnings.length} 个警告。${primaryIssue ? `首要问题：${primaryIssue.title}。` : ""}`;

  return {
    status,
    headline,
    summary,
    blockingCount: blocking.length,
    warningCount: warnings.length,
    primaryIssue,
    topActions,
    missingRealSources,
    canAutoFix,
    canRetryAfterSources: missingRealSources
  };
}

export function evaluateExportQualityGate(projectInput: CanvasProject): ExportGateResult {
  const project = cleanProject(projectInput);
  const issues: ExportGateIssue[] = [];
  const slides = project.slides || [];
  const spec = project.deckSpec;
  const pptType = (spec?.pptType || project.reviewCenter?.pptType || "unknown") as PPTType | "unknown";
  const seed = pptType !== "unknown" ? pptTypeRuleSeeds[pptType] : undefined;
  const qualityBar = spec?.qualityBar || (seed ? 82 : 80);
  const fullText = projectText(project);
  const visibleText = cleanText(slides.map(slideVisibleText).join(" "));

  if (project.contentPlan?.playbookId === "teacher_math_science_v1") {
    const expectedLayouts = [
      "tm01_teacher_math_cover", "tm02_learning_objectives", "tm03_prior_knowledge_context", "tm04_concept_definition",
      "tm05_table_formula_graph", "tm06_parameter_comparison", "tm07_worked_example", "tm08_interaction_practice", "tm09_summary_assignment"
    ];
    if (slides.length !== 9) {
      issues.push(issue({ id: "teacher-math-page-count", severity: "error", title: "教师数学内容页数量错误", detail: `应为9个内容页，当前为${slides.length}页。`, action: "重新按教师数学语义策划生成完整9页。" }));
    }
    project.layoutPlans?.forEach((plan, index) => {
      if (plan.selectedLayout !== expectedLayouts[index]) issues.push(issue({ id: `teacher-math-layout-${index + 1}`, severity: "error", title: `第${index + 1}页未命中锁定版式`, detail: `期望${expectedLayouts[index]}，实际${plan.selectedLayout}。`, action: "返回LayoutPlan重新选择登记版式。" }));
    });
    const bannedTeacher = /(项目汇报|市场分析|商业计划|研究报告|证据链报告|当前缺少可直接引用的证据片段|masteryCheck|layoutId|而。)/;
    if (bannedTeacher.test(visibleText)) issues.push(issue({ id: "teacher-math-banned-semantics", severity: "error", title: "教师课件出现禁止语义或内部字段", detail: "检测到商务汇报、证据兜底、内部字段或模板残片。", action: "回到成稿层清理可见文案。" }));
    const checks = [
      { index: 4, id: "m05", terms: ["数值表", "解析式", "图像"], title: "M05缺少表、式、图映射" },
      { index: 5, id: "m06", terms: ["k", "b", "图像"], title: "M06缺少参数视觉比较" },
      { index: 6, id: "m07", terms: ["题目", "步骤", "结论"], title: "M07缺少完整例题" },
      { index: 7, id: "m08", terms: ["练习", "作答", "反馈"], title: "M08缺少真实练习反馈" }
    ];
    checks.forEach((check) => {
      const text = slides[check.index] ? slideVisibleText(slides[check.index]) : "";
      if (!check.terms.every((term) => text.includes(term))) issues.push(issue({ id: check.id, severity: "error", title: check.title, detail: `必须同时包含：${check.terms.join("、")}。`, slideId: slides[check.index]?.id, slideTitle: slides[check.index]?.title, action: "回到教师数学成稿层补齐页面核心任务。" }));
    });
  }

  if (MOJIBAKE_PATTERN.test(fullText)) {
    issues.push(issue({
      id: "mojibake-text",
      severity: "error",
      title: "存在中文乱码",
      detail: "项目文本中检测到 UTF-8 replacement 或常见 mojibake 字符，导出会出现乱码。",
      action: "先重新清洗文本或重新生成，再导出 PPTX。"
    }));
  }

  if (QUESTION_MARK_PLACEHOLDER_PATTERN.test(fullText)) {
    issues.push(issue({
      id: "question-mark-placeholder",
      severity: "error",
      title: "存在连续问号占位文本",
      detail: "项目文本中出现三个及以上连续问号，通常表示字符损坏或未完成内容。",
      action: "修复原始策划或重新生成对应页面后再导出 PPTX。"
    }));
  }

  if (INTERNAL_FIELD_PATTERN.test(fullText)) {
    issues.push(issue({
      id: "internal-field-leak",
      severity: "error",
      title: "存在工程字段泄漏",
      detail: "页面文案中出现 layout、sourceIds、visualPrompt、tips-grid 等内部字段。",
      action: "将工程字段转换为中文页面角色、资料说明或可编辑模块。"
    }));
  }

  if (PLACEHOLDER_PATTERN.test(fullText)) {
    issues.push(issue({
      id: "placeholder-leak",
      severity: "error",
      title: "存在占位或演示痕迹",
      detail: "页面仍包含占位、待替换、示例模块、调试等内容，不能作为验收稿导出。",
      action: "替换为真实内容、来源、图表或行动建议。"
    }));
  }

  const scaffoldMatches = findScaffoldMatches(visibleText);
  const internalFieldMatches = findInternalFieldMatches(visibleText);
  if (scaffoldMatches.length) {
    issues.push(issue({
      id: "slide-content-scaffold-leakage",
      severity: "error",
      title: "页面可见文本包含策划脚手架",
      detail: `PPT 可见文本中出现脚手架或引擎语言：${scaffoldMatches.slice(0, 8).join("、")}。`,
      action: "先通过 SlideContentDraft 成稿层改写为用户可见正文，再导出 PPTX。"
    }));
  }
  if (internalFieldMatches.length) {
    issues.push(issue({
      id: "slide-content-internal-field-leakage",
      severity: "error",
      title: "页面可见文本包含内部字段",
      detail: `PPT 可见文本中出现内部字段：${internalFieldMatches.slice(0, 8).join("、")}。`,
      action: "内部 ID 和工程字段只能保留在 metadata，不得进入可见页面。"
    }));
  }
  if (project.deckContentQualityReport && !project.deckContentQualityReport.valid) {
    issues.push(issue({
      id: "slide-content-quality-blocked",
      severity: "error",
      title: "页面成稿度未通过",
      detail: `成稿层发现 ${project.deckContentQualityReport.blockingSlides.length} 个阻断页，平均分 ${project.deckContentQualityReport.averageScore}。`,
      action: "修复 SlideContentDraft blocking issues 后再导出。"
    }));
  }
  if (pptType === "product_proposal" && /政务蓝|评审汇报|GOVERNANCE REVIEW/i.test(fullText)) {
    issues.push(issue({
      id: "proposal-government-theme-leakage",
      severity: "error",
      title: "销售提案出现政务主题串味",
      detail: "proposal/product_proposal 类型不允许出现政务蓝或评审汇报主题。",
      action: "按商务合作、销售提案或解决方案主题重新生成。"
    }));
  }
  if (pptType === "courseware" && /event_plan|活动亮白|执行策划|EVENT PLAN/i.test(fullText)) {
    issues.push(issue({
      id: "courseware-event-theme-leakage",
      severity: "error",
      title: "课程课件出现活动策划串味",
      detail: "courseware 类型不允许出现 event_plan 或活动执行主题。",
      action: "锁定课程课件主题后重新生成。"
    }));
  }

  if (!spec) {
    issues.push(issue({
      id: "missing-deck-spec",
      severity: "error",
      title: "缺少 DeckSpec",
      detail: "导出前必须存在统一的 DeckSpec，用于锁定类型、页面角色和评分标准。",
      action: "重新生成或重新评分，确保评审中枢生成 DeckSpec。"
    }));
  } else if (!Array.isArray(spec.slideSpecs) || spec.slideSpecs.length === 0) {
    issues.push(issue({
      id: "empty-slide-spec",
      severity: "error",
      title: "SlideSpec 为空",
      detail: "DeckSpec 没有逐页 SlideSpec，无法判断页面角色和证据需求。",
      action: "重新应用策划审核。"
    }));
  } else if (project.contentPlan?.slidePlan?.length && !spec.slideSpecs.some((slideSpec) => slideSpec.pagePlanId)) {
    issues.push(issue({
      id: "missing-slide-page-plan-trace",
      severity: "error",
      title: "缺少页面级策划追溯",
      detail: "项目已有 ContentPlan，但 SlideSpec 没有绑定 SlidePagePlan，说明生成链路跳过了页面级策划。",
      action: "重新生成 SlidePagePlan，并让 DeckSpec / SlideSpec 绑定 pagePlanId。"
    }));
  }

  if (project.contentPlan?.slidePlan?.length && !project.slidePagePlans?.length) {
    issues.push(issue({
      id: "missing-slide-page-plans",
      severity: "error",
      title: "缺少 SlidePagePlan",
      detail: "生成链路必须在 ContentPlan 和 DeckSpec 之间生成页面级策划合同。",
      action: "重新执行页面级策划引擎。"
    }));
  }

  if (project.slidePagePlans?.length && !project.layoutPlans?.length) {
    issues.push(issue({
      id: "missing-layout-plans",
      severity: "error",
      title: "缺少 LayoutPlan",
      detail: "生成链路必须在 SlidePagePlan 和 DeckSpec 之间生成版式执行合同。",
      action: "重新执行 Layout Execution Engine。"
    }));
  }

  if (project.slidePagePlans?.length && project.layoutPlans?.length && project.layoutPlans.length !== project.slidePagePlans.length) {
    issues.push(issue({
      id: "layout-plan-count-mismatch",
      severity: "error",
      title: "LayoutPlan 数量不匹配",
      detail: "LayoutPlan 必须与 SlidePagePlan 一一对应，否则预览和导出会使用不同版式依据。",
      action: "重新生成整套 LayoutPlan 后再导出。"
    }));
  }

  if (project.contentPlan?.slidePlan?.length && !project.evidenceReport) {
    issues.push(issue({
      id: "missing-evidence-report",
      severity: "error",
      title: "缺少证据映射报告",
      detail: "生成链路已有 ContentPlan / SlidePagePlan，但没有 DeckEvidenceReport，说明 P1-D 证据映射没有进入导出链路。",
      action: "重新执行 SourceDocument -> EvidenceBlock -> EvidenceNeed -> SlideEvidenceMap -> DeckEvidenceReport 后再导出。"
    }));
  }

  if (project.evidenceReport) {
    const report = project.evidenceReport;
    const critical = CRITICAL_EVIDENCE_TYPES.has(String(pptType));
    const acquisition = project.acquisitionReport;
    const publicSearchSources = project.sourceDocuments?.filter((source) => source.sourceType === "search_result" && Boolean(source.url)).length || 0;
    const officialPublicSearchSources = project.sourceDocuments?.filter((source) => source.sourceType === "search_result" && Boolean(source.url) && source.providerTier !== "experimental_fallback" && source.provider !== "bing_html" && source.provider !== "bing").length || 0;
    const experimentalSearchSources = project.sourceDocuments?.filter((source) => source.sourceType === "search_result" && Boolean(source.url) && (source.providerTier === "experimental_fallback" || source.provider === "bing_html" || source.provider === "bing")).length || 0;
    const parsedUploadSources = project.sourceDocuments?.filter((source) => source.sourceType === "uploaded_file" && source.parseStatus === "parsed").length || 0;
    const fallbackSources = project.sourceDocuments?.filter((source) => source.sourceType === "system_fallback" || source.sourceType === "test_fixture").length || 0;
    report.blockingIssues.slice(0, 6).forEach((item, index) => {
      issues.push(issue({
        id: `evidence-blocking-${index + 1}`,
        severity: "error",
        title: "证据中枢阻断导出",
        detail: cleanText(item),
        action: "补充上传资料、搜索来源或把强事实结论改成待确认表述。"
      }));
    });
    if (critical && publicSearchSources === 0 && parsedUploadSources === 0) {
      issues.push(issue({
        id: "real-source-missing-for-critical-type",
        severity: "error",
        title: "关键类型缺少真实来源",
        detail: `${seed?.label || "关键汇报"}没有真实公开搜索结果或已解析上传资料，不能把用户输入、测试夹具或兜底来源当作事实依据。`,
        action: "配置真实搜索 provider，或上传可解析 PDF/Word/PPT/TXT 后重新生成。"
      }));
    }
    if (critical && experimentalSearchSources > 0 && officialPublicSearchSources === 0 && parsedUploadSources === 0) {
      issues.push(issue({
        id: "experimental-search-only-critical",
        severity: "error",
        title: "关键类型仅使用实验性搜索 fallback",
        detail: "当前高风险 PPT 类型只有 bing_html experimental fallback 来源，没有 Tavily/Serper/Brave 等 official provider 或已解析上传资料支撑，不能按高可信来源通过。",
        action: "配置 Tavily / Serper / Brave key，或上传可解析资料；如果只是初稿，可带 warning 继续但必须保留风险提示。"
      }));
    } else if (experimentalSearchSources > 0) {
      issues.push(issue({
        id: "experimental-search-fallback-used",
        severity: "warn",
        title: "使用了实验性搜索 fallback",
        detail: "当前项目包含 bing_html 来源；它基于公开搜索 HTML 结构，摘要类证据需要复核原文。",
        action: "建议配置 Tavily / Serper / Brave key，并在关键结论处核验原文。"
      }));
    }
    if (critical && acquisition?.searchEnabled && acquisition.searchStatus === "provider_unconfigured" && publicSearchSources === 0) {
      issues.push(issue({
        id: "search-provider-unconfigured-critical",
        severity: "error",
        title: "真实搜索未配置",
        detail: "REAL_SEARCH_ENABLED=true 但 provider/API Key 未配置，系统没有获得任何真实 search_result。",
        action: "配置 TAVILY_API_KEY、SERPER_API_KEY 或 BRAVE_SEARCH_API_KEY，或关闭真实搜索并上传资料。"
      }));
    }
    if (fallbackSources > 0 && critical) {
      issues.push(issue({
        id: "fallback-source-used-in-critical-type",
        severity: "error",
        title: "关键类型使用了非真实来源",
        detail: "项目包含 system_fallback 或 test_fixture，不能作为政策、财务、项目或销售提案的正式事实依据。",
        action: "移除测试/兜底来源，补充真实 URL 或上传资料。"
      }));
    }
    if (critical && report.averageCoverage < 35) {
      issues.push(issue({
        id: "evidence-coverage-too-low",
        severity: "error",
        title: "关键类型证据覆盖过低",
        detail: `当前整体证据覆盖率 ${report.averageCoverage}%，不足以支撑 ${seed?.label || "关键汇报"} 的正式导出。`,
        action: "补充政策、财务、项目、客户或产品文档等可追溯来源后重新生成。"
      }));
    }
    if (critical && report.unsupportedClaims.length >= Math.max(2, Math.ceil((project.slidePagePlans?.length || slides.length || 1) * 0.25))) {
      issues.push(issue({
        id: "evidence-unsupported-claims",
        severity: "error",
        title: "未支撑核心主张过多",
        detail: `当前 ${report.unsupportedClaims.length} 页存在未支撑主张，关键类型不能直接导出。`,
        action: "在对应页面补充来源，或降低结论确定性并标记待用户确认。"
      }));
    }
    if (critical && report.sourceSummary.userInputOnlySlides > 0) {
      issues.push(issue({
        id: "evidence-user-input-only",
        severity: "warn",
        title: "部分页面仅由用户输入支撑",
        detail: `${report.sourceSummary.userInputOnlySlides} 页主要依赖用户输入或低置信来源，不能当作外部事实。`,
        action: "补充上传资料或公开来源，避免把需求文本当作事实依据。"
      }));
    }
  }

  project.layoutPlans?.forEach((layoutPlan, index) => {
    const definition = getLayoutDefinition(layoutPlan.selectedLayout);
    if (!definition) {
      issues.push(issue({
        id: `layout-plan-${index + 1}-unknown-layout`,
        severity: "error",
        title: `第 ${index + 1} 页 LayoutPlan 未命中版式库`,
        detail: "selectedLayout 不存在于通用 layout-library。",
        action: "重新选择来自 layout-library 的可导出版式。"
      }));
    }
    if (!layoutPlan.layoutPlanId || !layoutPlan.pagePlanId || !layoutPlan.selectedLayout || !layoutPlan.layoutFamily || !layoutPlan.informationDensity) {
      issues.push(issue({
        id: `layout-plan-${index + 1}-thin`,
        severity: "error",
        title: `第 ${index + 1} 页 LayoutPlan 字段不完整`,
        detail: "LayoutPlan 必须包含 layoutPlanId、pagePlanId、selectedLayout、layoutFamily 和 informationDensity。",
        action: "重新执行版式规划和校验。"
      }));
    }
    if (!layoutPlan.contentSlots?.length || !layoutPlan.hierarchyRules?.length || !layoutPlan.exportHints?.length || !layoutPlan.previewHints?.length) {
      issues.push(issue({
        id: `layout-plan-${index + 1}-missing-rules`,
        severity: "error",
        title: `第 ${index + 1} 页 LayoutPlan 缺少执行规则`,
        detail: "contentSlots、hierarchyRules、exportHints、previewHints 不能为空。",
        action: "补齐版式执行规则后再生成 SlideSpec。"
      }));
    }
  });

  spec?.slideSpecs?.forEach((slideSpec, index) => {
    if (project.contentPlan?.slidePlan?.length && (!slideSpec.pagePlanId || !slideSpec.audienceQuestion || !slideSpec.coreClaim || !slideSpec.mustProve || !slideSpec.recommendedVisualForm)) {
      issues.push(issue({
        id: `slide-spec-${index + 1}-page-plan-thin`,
        severity: "error",
        title: `第 ${index + 1} 页 SlideSpec 缺少页面合同字段`,
        detail: "SlideSpec 必须能追溯 audienceQuestion、coreClaim、mustProve 和 recommendedVisualForm。",
        action: "重新生成或修复 SlidePagePlan 后再进入导出。"
      }));
    }
    if (project.layoutPlans?.length && (!slideSpec.layoutPlanId || !slideSpec.selectedLayout || !slideSpec.layoutFamily || !slideSpec.informationDensity)) {
      issues.push(issue({
        id: `slide-spec-${index + 1}-layout-plan-thin`,
        severity: "error",
        title: `第 ${index + 1} 页 SlideSpec 缺少版式执行字段`,
        detail: "SlideSpec 必须能追溯 layoutPlanId、selectedLayout、layoutFamily 和 informationDensity。",
        action: "重新生成 LayoutPlan，并让 DeckSpec / SlideSpec 绑定版式执行合同。"
      }));
    }
    if (project.slideEvidenceMaps?.length && (!Number.isFinite(Number(slideSpec.evidenceCoverage)) || !Number.isFinite(Number(slideSpec.sourceConfidence)))) {
      issues.push(issue({
        id: `slide-spec-${index + 1}-evidence-thin`,
        severity: "error",
        title: `第 ${index + 1} 页 SlideSpec 缺少证据追踪字段`,
        detail: "SlideSpec 必须记录 evidenceCoverage 和 sourceConfidence，供评审中枢与导出质量闸门读取。",
        action: "重新从 SlideEvidenceMap 派生 DeckSpec / SlideSpec。"
      }));
    }
    if (slideSpec.selectedLayout) {
      const expectedLayout = slideLayoutForSelectedLayout(slideSpec.selectedLayout);
      if (slideSpec.layoutIntent !== expectedLayout) {
        issues.push(issue({
          id: `slide-spec-${index + 1}-layout-intent-mismatch`,
          severity: "error",
          title: `第 ${index + 1} 页 SlideSpec 版式不一致`,
          detail: "SlideSpec.layoutIntent 没有使用 selectedLayout 对应的可导出版式。",
          action: "重新从 LayoutPlan 派生 SlideSpec。"
        }));
      }
    }
  });

  if (!seed) {
    issues.push(issue({
      id: "unknown-ppt-type",
      severity: "error",
      title: "PPT 类型未识别",
      detail: "项目没有稳定识别到 PPT 类型，无法应用类型专属必备页面。",
      action: "先执行 PPT 类型识别和评分规则生成。"
    }));
  } else if (project.contentPlan?.slidePlan?.length) {
    const requiredByContentPlan = project.contentPlan.slidePlan.filter((page) => page.priority !== "optional");
    const missingRequired = requiredByContentPlan.filter((page) =>
      !matchesRequiredPage(project, page.titleIntent, [
        page.role,
        page.titleIntent,
        page.mustProve,
        ...(page.suggestedEvidence || []).slice(0, 3)
      ])
    );
    if (missingRequired.length) {
      issues.push(issue({
        id: "content-plan-required-pages-missing",
        severity: "error",
        title: "缺少 ContentPlan 必备页面",
        detail: `${project.contentPlan.pptType} 必须覆盖：${missingRequired.map((page) => page.titleIntent || page.role).slice(0, 6).join("、")}。`,
        action: "回到 ContentPlan / SlidePagePlan 修复缺失页面后再导出。"
      }));
    }
  } else {
    const missingRequired = seed.requiredPages.filter((page) => !matchesRequiredPage(project, page.title, page.requiredKeywords));
    if (missingRequired.length) {
      issues.push(issue({
        id: "required-pages-missing",
        severity: "error",
        title: "缺少类型必备页面",
        detail: `${seed.label} 必须覆盖：${missingRequired.map((page) => page.title).slice(0, 6).join("、")}。`,
        action: "应用评审中枢自动修复或重新生成页面策划。"
      }));
    }
  }

  if (slides.length < 8) {
    issues.push(issue({
      id: "too-few-slides",
      severity: "error",
      title: "页数不足",
      detail: `当前只有 ${slides.length} 页，不能覆盖完整策划链路。`,
      action: "补齐必备页面后再导出。"
    }));
  }

  slides.forEach((slide, index) => {
    const text = slideText(slide);
    const slideSpec = findSpecForSlide(project, slide, index);
    if (MOJIBAKE_PATTERN.test(text)) {
      issues.push(issue({
        id: `slide-${index + 1}-mojibake`,
        severity: "error",
        title: `第 ${index + 1} 页存在乱码`,
        detail: "该页标题、正文或模块文本中包含乱码字符。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "重新清洗该页文本。"
      }));
    }
    if (QUESTION_MARK_PLACEHOLDER_PATTERN.test(text)) {
      issues.push(issue({
        id: `slide-${index + 1}-question-mark-placeholder`,
        severity: "error",
        title: `第 ${index + 1} 页存在连续问号`,
        detail: "该页包含三个及以上连续问号，不能作为课堂成品导出。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "修复该页内容来源后重新生成。"
      }));
    }
    if (INTERNAL_FIELD_PATTERN.test(text)) {
      issues.push(issue({
        id: `slide-${index + 1}-internal-field`,
        severity: "error",
        title: `第 ${index + 1} 页暴露工程字段`,
        detail: "该页含内部字段或 section 类型名，导出会像调试稿。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "用中文业务表达替换内部字段。"
      }));
    }
    if (PLACEHOLDER_PATTERN.test(text)) {
      issues.push(issue({
        id: `slide-${index + 1}-placeholder`,
        severity: "error",
        title: `第 ${index + 1} 页有占位痕迹`,
        detail: "该页含占位、待替换、图片素材或调试痕迹。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "替换为真实信息。"
      }));
    }
    if (spec && !slideSpec) {
      issues.push(issue({
        id: `slide-${index + 1}-missing-spec`,
        severity: "warn",
        title: `第 ${index + 1} 页没有 SlideSpec`,
        detail: "该页没有绑定页面合同。",
        slideId: slide.id,
        slideTitle: slide.title,
        action: "重新应用策划审核。"
      }));
    }
    if (slideSpec && !hasStructuredSections(slide)) {
      issues.push(issue({
        id: `slide-${index + 1}-missing-structure`,
        severity: "warn",
        title: `第 ${index + 1} 页缺少结构化模块`,
        detail: `该页应承担「${slideSpec.role}」角色，但缺少可编辑结构化 sections。`,
        slideId: slide.id,
        slideTitle: slide.title,
        action: "补充 table、timeline、tips-grid、stat-card 等模块。"
      }));
    }
  });

  const hardErrors = issues.filter((item) => item.severity === "error").length;
  const score = Math.max(0, Math.min(100, (project.quality?.score || 80) - hardErrors * 18 - issues.filter((item) => item.severity === "warn").length * 3));
  const contentPlanBacked = Boolean(project.contentPlan?.slidePlan?.length && project.deckSpec?.slideSpecs?.some((spec) => spec.contentPlanSlideId));
  const pagePlanBacked = Boolean(project.slidePagePlans?.length && project.deckSpec?.slideSpecs?.some((spec) => spec.pagePlanId));
  const layoutPlanBacked = Boolean(project.layoutPlans?.length && project.deckSpec?.slideSpecs?.some((spec) => spec.layoutPlanId && spec.selectedLayout && spec.layoutFamily));
  const passBar = contentPlanBacked && pagePlanBacked && layoutPlanBacked ? Math.min(qualityBar, 80) : Math.min(qualityBar, 84);
  const ok = hardErrors === 0 && score >= passBar;
  const trimmedIssues = issues.slice(0, 24);
  return {
    ok,
    score,
    qualityBar: passBar,
    pptType,
    pptTypeLabel: seed?.label || project.reviewCenter?.pptTypeLabel || "未识别",
    issues: trimmedIssues,
    explanation: explainExportGate({
      ok,
      score,
      qualityBar: passBar,
      pptTypeLabel: seed?.label || project.reviewCenter?.pptTypeLabel || "未识别",
      issues: trimmedIssues
    })
  };
}
