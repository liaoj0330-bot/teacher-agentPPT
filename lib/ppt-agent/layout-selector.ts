import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import type { LayoutDefinition } from "@/lib/ppt-agent/layout-library";
import {
  getCandidateLayoutsForVisualForm,
  layoutLibrary,
  pptTypeMatchesLayout,
  roleMatchesLayout,
  visualFormToPreferredLayoutIds
} from "@/lib/ppt-agent/layout-library";
import type { InformationDensity, LayoutPlan } from "@/lib/ppt-agent/layout-plan";
import type { RecommendedVisualForm, SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import { cleanText } from "@/lib/text-sanitize";

type LayoutSelectorMode = "quick" | "professional";

export type LayoutSelectorInput = {
  contentPlan: ContentPlan;
  slidePagePlan: SlidePagePlan;
  availableLayouts?: LayoutDefinition[];
  themeHint?: string;
  mode?: LayoutSelectorMode;
  existingPlans?: LayoutPlan[];
};

function unique<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function estimateDensity(plan: SlidePagePlan): InformationDensity {
  const textLength = [
    plan.coreClaim,
    plan.mustProve,
    ...plan.contentBlocks.flatMap((block) => [block.title, block.body]),
    ...plan.evidenceNeed
  ].join("").length;
  if (plan.recommendedVisualForm === "quote_highlight" || /封面|开场|定调/.test(plan.role)) {
    return "low";
  }
  if (textLength > 380 || plan.contentBlocks.length >= 5 || plan.evidenceNeed.length >= 5) {
    return "high";
  }
  if (["metric_dashboard", "matrix", "comparison_table", "risk_table", "architecture_diagram"].includes(plan.recommendedVisualForm)) {
    return "high";
  }
  return "medium";
}

function visualSlotsFor(form: RecommendedVisualForm) {
  const slots: Record<RecommendedVisualForm, string[]> = {
    bullet_list: ["icon", "callout"],
    card_grid: ["cardIcons", "cardFrames"],
    comparison_table: ["tableGrid", "decisionMarker"],
    process_flow: ["stepConnector", "flowNodes"],
    timeline: ["timeAxis", "milestones"],
    roadmap: ["roadAxis", "actionMarkers"],
    map_route: ["routeLine", "stopMarkers"],
    metric_dashboard: ["metricCards", "barOrDonutChart"],
    matrix: ["axisGrid", "mappingCells"],
    architecture_diagram: ["layerBlocks", "moduleConnectors"],
    risk_table: ["riskRows", "severityMarkers"],
    quote_highlight: ["quoteBlock", "accentShape"],
    case_card: ["caseCards", "evidenceBadge"],
    summary_action: ["actionCards", "decisionMarker"],
    coordinate_graph: ["axis", "ticks", "origin", "editableLine", "labels"],
    table_formula_graph_mapping: ["valueTable", "formula", "coordinateGraph", "mappingArrows"],
    parameter_compare: ["comparisonAxes", "editableLines", "parameterLegend"],
    worked_example_steps: ["problem", "known", "derivationSteps", "keyDecision", "conclusion"],
    practice_feedback: ["problem", "answerArea", "hint", "feedback"],
    concept_relation: ["conceptNodes", "relationLines", "definition", "selfCheck"]
  };
  return slots[form] || ["editableShapes"];
}

function slotsFor(layout: LayoutDefinition, plan: SlidePagePlan) {
  const contentDriven = plan.contentBlocks.map((block) => block.type);
  const evidenceDriven = plan.evidenceNeed.length ? ["evidenceNote"] : [];
  return unique([...layout.requiredSlots, ...contentDriven, ...evidenceDriven, ...layout.optionalSlots.slice(0, 2)]).slice(0, 9);
}

function densityScore(layout: LayoutDefinition, density: InformationDensity) {
  if (layout.informationDensity.includes(density)) return 12;
  if (density === "high" && layout.informationDensity.includes("medium")) return 6;
  if (density === "low" && layout.informationDensity.includes("medium")) return 5;
  return -6;
}

function scoreLayout(input: LayoutSelectorInput, layout: LayoutDefinition, density: InformationDensity) {
  const { contentPlan, slidePagePlan, existingPlans = [] } = input;
  const preferred = new Set(visualFormToPreferredLayoutIds[slidePagePlan.recommendedVisualForm] || []);
  const roleText = `${slidePagePlan.role} ${slidePagePlan.pagePurpose} ${slidePagePlan.mustProve} ${slidePagePlan.coreClaim}`;
  const textLength = cleanText(roleText).length + slidePagePlan.contentBlocks.reduce((sum, block) => sum + cleanText(block.body).length, 0);
  const sameLayoutCount = existingPlans.filter((plan) => plan.selectedLayout === layout.layoutId).length;
  const sameFamilyCount = existingPlans.filter((plan) => plan.layoutFamily === layout.layoutFamily).length;
  const visualScore = layout.supportedVisualForms.includes(slidePagePlan.recommendedVisualForm)
    ? 54
    : preferred.has(layout.layoutId)
      ? 42
      : 0;
  const roleScore = roleMatchesLayout(layout, roleText) ? 18 : 0;
  const typeScore = pptTypeMatchesLayout(layout, contentPlan.pptType) ? 12 : -4;
  const densityFit = densityScore(layout, density);
  const lengthScore = textLength <= layout.maxTextLength ? 8 : Math.max(-10, 8 - Math.ceil((textLength - layout.maxTextLength) / 60) * 3);
  const itemScore = slidePagePlan.contentBlocks.length <= layout.maxItems ? 5 : -6;
  const diversityPenalty = sameLayoutCount * 8 + sameFamilyCount * 3;
  return visualScore + roleScore + typeScore + densityFit + lengthScore + itemScore - diversityPenalty;
}

function fallbackReasonFor(layout: LayoutDefinition, plan: SlidePagePlan, density: InformationDensity) {
  const reasons: string[] = [];
  if (!layout.supportedVisualForms.includes(plan.recommendedVisualForm)) {
    reasons.push("推荐表达形式没有精确命中，选择相邻的可导出版式");
  }
  if (!roleMatchesLayout(layout, `${plan.role} ${plan.pagePurpose} ${plan.mustProve}`)) {
    reasons.push("页面角色与候选版式不是强匹配，按整套内容多样性做了调整");
  }
  if (!layout.informationDensity.includes(density)) {
    reasons.push("信息密度与版式建议存在轻微偏差，已用槽位限制控制文字量");
  }
  return reasons.length ? reasons.join("；") : undefined;
}

export function materializeLayoutPlan(input: {
  contentPlan: ContentPlan;
  slidePagePlan: SlidePagePlan;
  layout: LayoutDefinition;
  density?: InformationDensity;
  fallbackReason?: string;
  warnings?: string[];
}): LayoutPlan {
  const { contentPlan, slidePagePlan, layout } = input;
  const density = input.density || estimateDensity(slidePagePlan);
  const fallbackReason = input.fallbackReason || fallbackReasonFor(layout, slidePagePlan, density);
  return {
    layoutPlanId: `${slidePagePlan.pagePlanId}-layout`,
    pagePlanId: slidePagePlan.pagePlanId,
    planId: slidePagePlan.planId,
    pptType: contentPlan.pptType,
    role: cleanText(slidePagePlan.role, "页面论证"),
    pageIndex: slidePagePlan.pageIndex,
    recommendedVisualForm: slidePagePlan.recommendedVisualForm,
    selectedLayout: layout.layoutId,
    layoutFamily: layout.layoutFamily,
    informationDensity: density,
    contentSlots: slotsFor(layout, slidePagePlan),
    visualSlots: visualSlotsFor(slidePagePlan.recommendedVisualForm),
    hierarchyRules: [
      "核心观点最大，证明任务次之，补充信息最小。",
      "每页只保留一个主判断，其他内容服务这个判断。",
      density === "high" ? "高密度页面优先用表格、矩阵或指标卡拆分信息。" : "低密度页面保留留白，用短句强化判断。"
    ],
    spacingRules: [
      "标题区、主体区和来源区分开，避免文字贴边。",
      "主体模块不超过两层嵌套，卡片和表格保持统一边距。",
      density === "high" ? "压缩解释性长句，优先保留关键词和证据口径。" : "保留足够留白，让页面显得像正式汇报稿。"
    ],
    typographyHints: [
      "标题使用观点句，正文使用短句。",
      "关键数字、阶段、动作使用加粗或色块强调。",
      "来源和备注字号最小，但必须可读。"
    ],
    exportHints: [
      "导出时使用可编辑文本、形状、表格和图表。",
      "不要把整页合成为图片。",
      "来源说明进入页脚或可编辑备注区域。"
    ],
    previewHints: [
      "网页预览使用同一套页面顺序和内容槽位。",
      "预览重点呈现标题、核心判断和主体模块。",
      "移动端可以折叠辅助证据，但不能改变页面角色。"
    ],
    fallbackReason,
    warnings: unique([
      ...(input.warnings || []),
      slidePagePlan.contentBlocks.length > layout.maxItems ? "内容块超过建议上限，生成时需要合并相近信息。" : "",
      cleanText(slidePagePlan.coreClaim).length > 72 ? "核心观点偏长，页面标题需要进一步压缩。" : ""
    ]).slice(0, 4)
  };
}

export function selectLayoutForSlidePagePlan(input: LayoutSelectorInput): LayoutPlan {
  if (input.contentPlan.playbookId === "teacher_math_science_v1") {
    const mode = input.contentPlan.teacherContext?.generationMode;
    const lockedByMode = {
      chapter_prep: [
        "tm01_teacher_math_cover", "tm05_table_formula_graph", "tm02_learning_objectives", "tm06_parameter_comparison",
        "tm05_table_formula_graph", "tm04_concept_definition", "tm07_worked_example", "tm08_interaction_practice", "tm09_summary_assignment",
      ],
      lesson_plan: [
        "tm01_teacher_math_cover", "tm02_learning_objectives", "tm03_prior_knowledge_context", "tm04_concept_definition",
        "tm08_interaction_practice", "tm06_parameter_comparison", "tm08_interaction_practice", "tm09_summary_assignment", "tm09_summary_assignment",
      ],
      optimize_existing: [
        "tm01_teacher_math_cover", "tm06_parameter_comparison", "tm06_parameter_comparison", "tm06_parameter_comparison",
        "tm06_parameter_comparison", "tm06_parameter_comparison", "tm06_parameter_comparison", "tm06_parameter_comparison", "tm06_parameter_comparison",
      ],
    } as const;
    const defaultIds = [
      "tm01_teacher_math_cover", "tm02_learning_objectives", "tm03_prior_knowledge_context", "tm04_concept_definition",
      "tm05_table_formula_graph", "tm06_parameter_comparison", "tm07_worked_example", "tm08_interaction_practice", "tm09_summary_assignment",
    ] as const;
    const sequence = mode ? lockedByMode[mode] : defaultIds;
    const desired = sequence[Math.min(input.slidePagePlan.pageIndex - 1, sequence.length - 1)];
    const locked = layoutLibrary.find((layout) => layout.layoutId === desired)
      || layoutLibrary.find((layout) => layout.layoutId === "tm09_summary_assignment");
    if (!locked) throw new Error(`LAYOUT_GAP: teacher math role ${input.slidePagePlan.role}`);
    return materializeLayoutPlan({ contentPlan: input.contentPlan, slidePagePlan: input.slidePagePlan, layout: locked });
  }
  const density = estimateDensity(input.slidePagePlan);
  const candidates = input.availableLayouts?.length
    ? input.availableLayouts
    : getCandidateLayoutsForVisualForm(input.slidePagePlan.recommendedVisualForm);
  const pool = candidates.length ? candidates : layoutLibrary;
  const scored = pool
    .map((layout) => ({ layout, score: scoreLayout(input, layout, density) }))
    .sort((a, b) => b.score - a.score);
  const selected = scored[0]?.layout || layoutLibrary.find((layout) => layout.layoutId === "bullet_insight")!;
  return materializeLayoutPlan({
    contentPlan: input.contentPlan,
    slidePagePlan: input.slidePagePlan,
    layout: selected,
    density
  });
}
