import type { SlideLayout } from "@/lib/canvas-data";
import type { ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import type { LayoutFamily, LayoutId, InformationDensity } from "@/lib/ppt-agent/layout-plan";
import type { RecommendedVisualForm } from "@/lib/ppt-agent/slide-page-plan";
import { cleanText } from "@/lib/text-sanitize";

export type LayoutDefinition = {
  layoutId: LayoutId;
  layoutName: string;
  layoutFamily: LayoutFamily;
  supportedVisualForms: RecommendedVisualForm[];
  supportedRoles: string[];
  supportedPptTypes: Array<ContentPlanPPTType | "any">;
  informationDensity: InformationDensity[];
  requiredSlots: string[];
  optionalSlots: string[];
  maxTextLength: number;
  maxItems: number;
  bestFor: string[];
  avoidFor: string[];
  exportCompatibility: "editable-shapes";
  previewCompatibility: "section-preview";
  maxTitleLength?: number;
  maxItemLength?: number;
  typographyScale?: { title: number; subtitle: number; body: number; caption: number };
  graphicRatio?: number;
  tableRatio?: number;
  formulaRegion?: string;
  studentActionRegion?: string;
  masteryCheckRegion?: string;
  visualModes?: string[];
};

export const layoutLibrary: LayoutDefinition[] = [
  ...(([ 
    ["tm01_teacher_math_cover", "TM01 Teacher Math Cover", "teacher_cover", ["quote_highlight", "concept_relation"], ["课程封面"], ["title", "subtitle", "lessonMeta"], ["coreQuestion", "topicMark"], 18, 2, 30, 0.42, 0, "right-lower", "bottom", "bottom-right", ["封面", "课题定调"], ["正文讲解", "密集表格"]],
    ["tm02_learning_objectives", "TM02 Learning Objectives", "teacher_objectives", ["concept_relation", "card_grid"], ["学习目标"], ["title", "objectiveGrid"], ["studentAction", "masteryCheck"], 16, 4, 24, 0.34, 0, "none", "bottom-left", "bottom-right", ["学习目标", "评价方式"], ["长段正文"]],
    ["tm03_prior_knowledge_context", "TM03 Prior Knowledge and Context", "teacher_context", ["coordinate_graph", "concept_relation"], ["前置知识", "情境导入"], ["title", "context", "priorKnowledge"], ["coordinateSketch", "studentAction"], 20, 4, 26, 0.46, 0, "left-lower", "bottom", "bottom-right", ["前置知识", "情境导入"], ["无上下文的新知结论"]],
    ["tm04_concept_definition", "TM04 Concept Definition", "teacher_concept", ["concept_relation"], ["概念定义"], ["title", "definition", "keyVariables"], ["counterExample", "studentAction"], 18, 4, 24, 0.38, 0, "center", "bottom-left", "bottom-right", ["定义", "变量关系"], ["多概念并列"]],
    ["tm05_table_formula_graph", "TM05 Table Formula Graph", "teacher_mapping", ["table_formula_graph_mapping"], ["表示方式映射"], ["title", "valueTable", "formula", "coordinateGraph"], ["mappingArrow", "studentAction"], 22, 5, 20, 0.44, 0.26, "center", "bottom-left", "bottom-right", ["表格解析式图像映射"], ["纯文字结论"]],
    ["tm06_parameter_comparison", "TM06 Parameter Comparison", "teacher_compare", ["parameter_compare"], ["参数比较"], ["title", "graphComparison", "parameterLegend"], ["studentAction", "masteryCheck"], 20, 4, 22, 0.62, 0, "top-center", "bottom-left", "bottom-right", ["参数对比", "多图比较"], ["没有图像的参数结论"]],
    ["tm07_worked_example", "TM07 Worked Example", "teacher_example", ["worked_example_steps"], ["例题分步讲解"], ["title", "problem", "known", "steps", "conclusion"], ["studentAction", "keyDecision"], 20, 5, 24, 0.28, 0, "top-left", "bottom-left", "bottom-right", ["例题", "分步推导"], ["整段答案"]],
    ["tm08_interaction_practice", "TM08 Interaction and Practice", "teacher_practice", ["practice_feedback"], ["课堂互动", "练习反馈"], ["title", "problem", "answerArea", "feedback"], ["hint", "peerCheck"], 20, 5, 24, 0.30, 0, "top-left", "center", "bottom-right", ["课堂练习", "检查反馈"], ["只写请完成练习"]],
    ["tm09_summary_assignment", "TM09 Summary and Assignment", "teacher_summary", ["concept_relation", "summary_action"], ["总结", "作业延伸"], ["title", "conceptSummary", "assignment"], ["selfCheck", "extension"], 18, 5, 24, 0.36, 0, "center-left", "bottom-left", "bottom-right", ["总结", "作业"], ["与本课无关的行动计划"]]
  ] as const).map((item) => ({
    layoutId: item[0], layoutName: item[1], layoutFamily: item[2], supportedVisualForms: [...item[3]], supportedRoles: [...item[4]],
    supportedPptTypes: ["courseware"], informationDensity: item[0] === "tm01_teacher_math_cover" ? ["low"] : ["medium"],
    requiredSlots: [...item[5]], optionalSlots: [...item[6]], maxTitleLength: item[7], maxItems: item[8], maxItemLength: item[9],
    maxTextLength: item[8] * item[9] + 120, typographyScale: { title: 28, subtitle: 16, body: 18, caption: 11 },
    graphicRatio: item[10], tableRatio: item[11], formulaRegion: item[12], studentActionRegion: item[13], masteryCheckRegion: item[14],
    visualModes: ["teaching_grid"], bestFor: [...item[15]], avoidFor: [...item[16]], exportCompatibility: "editable-shapes" as const, previewCompatibility: "section-preview" as const
  })) as LayoutDefinition[]),
  {
    layoutId: "cover_clean",
    layoutName: "Clean cover",
    layoutFamily: "cover",
    supportedVisualForms: ["quote_highlight", "bullet_list"],
    supportedRoles: ["封面", "开场", "定调", "定位", "结论", "主题"],
    supportedPptTypes: ["any"],
    informationDensity: ["low"],
    requiredSlots: ["title", "subtitle", "audience", "decisionGoal"],
    optionalSlots: ["tags", "keyMetric", "heroVisual"],
    maxTextLength: 180,
    maxItems: 4,
    bestFor: ["建立第一判断", "说明受众和目标", "给整套内容定调"],
    avoidFor: ["多指标堆叠", "长表格", "密集流程"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "agenda_list",
    layoutName: "Agenda list",
    layoutFamily: "agenda",
    supportedVisualForms: ["bullet_list", "roadmap", "timeline"],
    supportedRoles: ["目录", "总览", "结构", "学习目标", "路线总览", "行程主线"],
    supportedPptTypes: ["general", "courseware", "travel_plan", "project_report", "research_report"],
    informationDensity: ["low", "medium"],
    requiredSlots: ["title", "structureList", "mainThread"],
    optionalSlots: ["pageCount", "decisionQuestion", "tags"],
    maxTextLength: 260,
    maxItems: 7,
    bestFor: ["先建立整体路线", "让受众知道后续判断顺序"],
    avoidFor: ["复杂数据表", "高密度证据"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "section_divider",
    layoutName: "Section divider",
    layoutFamily: "section",
    supportedVisualForms: ["quote_highlight", "bullet_list"],
    supportedRoles: ["章节", "转场", "分段", "过渡"],
    supportedPptTypes: ["any"],
    informationDensity: ["low"],
    requiredSlots: ["sectionTitle", "sectionClaim"],
    optionalSlots: ["sectionIndex", "keywords"],
    maxTextLength: 160,
    maxItems: 3,
    bestFor: ["章节转场", "强调阶段性结论"],
    avoidFor: ["正文论证页", "表格页"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "bullet_insight",
    layoutName: "Insight bullets",
    layoutFamily: "insight",
    supportedVisualForms: ["bullet_list", "quote_highlight"],
    supportedRoles: ["背景", "问题", "洞察", "说明", "现状", "导入", "政策依据"],
    supportedPptTypes: ["any"],
    informationDensity: ["low", "medium"],
    requiredSlots: ["title", "primaryClaim", "supportingPoints"],
    optionalSlots: ["evidenceNote", "riskHint", "action"],
    maxTextLength: 420,
    maxItems: 5,
    bestFor: ["轻量说明", "把问题转成判断", "观点先行的背景页"],
    avoidFor: ["多主体关系", "复杂时间计划"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "card_grid",
    layoutName: "Card grid",
    layoutFamily: "cards",
    supportedVisualForms: ["card_grid", "case_card", "bullet_list"],
    supportedRoles: ["场景", "功能", "案例", "景点", "创意", "练习", "能力", "亮点"],
    supportedPptTypes: ["product_intro", "company_profile", "courseware", "travel_plan", "activity_plan", "business_plan", "general"],
    informationDensity: ["medium", "high"],
    requiredSlots: ["title", "cards"],
    optionalSlots: ["cardTags", "evidenceNote", "callout"],
    maxTextLength: 520,
    maxItems: 6,
    bestFor: ["并列模块", "案例或场景展开", "多点但同层级的信息"],
    avoidFor: ["严格流程", "财务明细表"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "comparison_table",
    layoutName: "Comparison table",
    layoutFamily: "table",
    supportedVisualForms: ["comparison_table", "risk_table"],
    supportedRoles: ["对比", "差异", "现状差距", "选择", "竞品", "风险"],
    supportedPptTypes: ["product_intro", "proposal", "research_report", "policy_interpretation", "financial_report", "travel_plan", "general"],
    informationDensity: ["medium", "high"],
    requiredSlots: ["title", "comparisonRows"],
    optionalSlots: ["decisionHint", "sourceNote"],
    maxTextLength: 560,
    maxItems: 5,
    bestFor: ["取舍判断", "方案选择", "差距说明"],
    avoidFor: ["开场封面", "路线动线"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "process_flow",
    layoutName: "Process flow",
    layoutFamily: "flow",
    supportedVisualForms: ["process_flow", "architecture_diagram", "roadmap"],
    supportedRoles: ["流程", "路径", "方案", "任务", "工作流", "落实", "交付", "商业模式"],
    supportedPptTypes: ["project_report", "product_intro", "proposal", "business_plan", "courseware", "policy_interpretation", "general"],
    informationDensity: ["medium"],
    requiredSlots: ["title", "steps"],
    optionalSlots: ["owner", "inputOutput", "riskHint"],
    maxTextLength: 500,
    maxItems: 6,
    bestFor: ["步骤机制", "业务闭环", "从输入到输出的过程"],
    avoidFor: ["纯指标页", "大段引用"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "timeline",
    layoutName: "Timeline",
    layoutFamily: "timeline",
    supportedVisualForms: ["timeline", "map_route", "roadmap"],
    supportedRoles: ["阶段", "计划", "周期", "路线", "时间", "里程碑", "课程结构", "执行流程"],
    supportedPptTypes: ["project_report", "travel_plan", "courseware", "activity_plan", "proposal", "company_profile", "financial_report", "general"],
    informationDensity: ["low", "medium"],
    requiredSlots: ["title", "timeSteps"],
    optionalSlots: ["milestones", "owner", "notes"],
    maxTextLength: 460,
    maxItems: 6,
    bestFor: ["时间顺序", "阶段推进", "路线安排"],
    avoidFor: ["多维矩阵", "财务拆解"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "roadmap",
    layoutName: "Roadmap",
    layoutFamily: "roadmap",
    supportedVisualForms: ["roadmap", "map_route", "timeline", "summary_action"],
    supportedRoles: ["下一步", "行动", "试点", "采购", "合作", "复盘", "推进", "路线"],
    supportedPptTypes: ["project_report", "product_intro", "proposal", "business_plan", "travel_plan", "policy_interpretation", "general"],
    informationDensity: ["medium"],
    requiredSlots: ["title", "actionSteps"],
    optionalSlots: ["owner", "deadline", "decisionPoint"],
    maxTextLength: 420,
    maxItems: 5,
    bestFor: ["行动收束", "推进路线", "会后决策"],
    avoidFor: ["开场介绍", "复杂对比"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "metric_dashboard",
    layoutName: "Metric dashboard",
    layoutFamily: "dashboard",
    supportedVisualForms: ["metric_dashboard"],
    supportedRoles: ["指标", "目标", "预算", "财报", "资金", "成效", "验收", "数据"],
    supportedPptTypes: ["financial_report", "project_report", "business_plan", "travel_plan", "proposal", "activity_plan", "research_report", "general"],
    informationDensity: ["medium", "high"],
    requiredSlots: ["title", "metrics"],
    optionalSlots: ["barChart", "weightChart", "sourceNote"],
    maxTextLength: 460,
    maxItems: 6,
    bestFor: ["目标和指标", "预算结构", "验收口径"],
    avoidFor: ["纯叙事页", "章节转场"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "matrix",
    layoutName: "Matrix",
    layoutFamily: "matrix",
    supportedVisualForms: ["matrix", "card_grid"],
    supportedRoles: ["责任", "分工", "结构", "业务", "资源", "知识", "主体", "场景", "能力"],
    supportedPptTypes: ["project_report", "product_intro", "proposal", "company_profile", "courseware", "activity_plan", "policy_interpretation", "general"],
    informationDensity: ["medium", "high"],
    requiredSlots: ["title", "matrixRows"],
    optionalSlots: ["axisLabels", "evidenceNote", "owner"],
    maxTextLength: 580,
    maxItems: 6,
    bestFor: ["角色对应关系", "能力和场景映射", "责任分工"],
    avoidFor: ["封面", "长路线"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "architecture_diagram",
    layoutName: "Architecture diagram",
    layoutFamily: "architecture",
    supportedVisualForms: ["architecture_diagram", "process_flow", "matrix"],
    supportedRoles: ["架构", "系统", "蓝图", "模块", "能力", "平台", "产品说明"],
    supportedPptTypes: ["project_report", "product_intro", "proposal", "policy_interpretation", "business_plan", "general"],
    informationDensity: ["medium", "high"],
    requiredSlots: ["title", "layers", "modules"],
    optionalSlots: ["integrationPoint", "dataFlow", "governance"],
    maxTextLength: 560,
    maxItems: 7,
    bestFor: ["系统层级", "产品蓝图", "模块关系"],
    avoidFor: ["财务指标页", "纯行动清单"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "risk_table",
    layoutName: "Risk table",
    layoutFamily: "risk",
    supportedVisualForms: ["risk_table", "comparison_table"],
    supportedRoles: ["风险", "应对", "备选", "异常", "避坑", "安全", "治理"],
    supportedPptTypes: ["project_report", "proposal", "travel_plan", "financial_report", "activity_plan", "policy_interpretation", "research_report", "general"],
    informationDensity: ["medium", "high"],
    requiredSlots: ["title", "riskRows"],
    optionalSlots: ["severity", "owner", "mitigation"],
    maxTextLength: 560,
    maxItems: 5,
    bestFor: ["风险、原因、影响和动作", "避坑提醒", "治理机制"],
    avoidFor: ["封面", "案例故事"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "case_card",
    layoutName: "Case card",
    layoutFamily: "case",
    supportedVisualForms: ["case_card", "card_grid"],
    supportedRoles: ["案例", "客户", "景点", "餐饮", "练习", "示范", "创意"],
    supportedPptTypes: ["product_intro", "company_profile", "travel_plan", "courseware", "activity_plan", "business_plan", "research_report", "general"],
    informationDensity: ["medium"],
    requiredSlots: ["title", "cases"],
    optionalSlots: ["result", "evidenceNote", "imageHint"],
    maxTextLength: 500,
    maxItems: 4,
    bestFor: ["用样例证明观点", "把抽象内容落到场景"],
    avoidFor: ["严格责任分工", "财务总览"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "quote_highlight",
    layoutName: "Quote highlight",
    layoutFamily: "quote",
    supportedVisualForms: ["quote_highlight", "bullet_list"],
    supportedRoles: ["结论", "判断", "洞察", "核心观点", "开场", "政策依据"],
    supportedPptTypes: ["any"],
    informationDensity: ["low"],
    requiredSlots: ["title", "primaryClaim"],
    optionalSlots: ["supportingPoints", "sourceNote", "tags"],
    maxTextLength: 260,
    maxItems: 4,
    bestFor: ["突出一句核心判断", "章节定调", "把复杂内容先压成观点"],
    avoidFor: ["高密度表格", "完整流程"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  },
  {
    layoutId: "summary_action",
    layoutName: "Summary action",
    layoutFamily: "summary",
    supportedVisualForms: ["summary_action", "roadmap", "bullet_list"],
    supportedRoles: ["收束", "总结", "下一步", "行动", "决策", "采购", "复盘", "合作"],
    supportedPptTypes: ["any"],
    informationDensity: ["low", "medium"],
    requiredSlots: ["title", "decision", "actions"],
    optionalSlots: ["owner", "deadline", "successCriteria"],
    maxTextLength: 360,
    maxItems: 5,
    bestFor: ["把结论转成下一步动作", "明确会后决策", "收束交付"],
    avoidFor: ["开场封面", "复杂证据页"],
    exportCompatibility: "editable-shapes",
    previewCompatibility: "section-preview"
  }
];

export const visualFormToPreferredLayoutIds: Record<RecommendedVisualForm, LayoutId[]> = {
  bullet_list: ["bullet_insight", "agenda_list", "quote_highlight", "summary_action"],
  card_grid: ["card_grid", "matrix", "case_card"],
  comparison_table: ["comparison_table", "risk_table"],
  process_flow: ["process_flow", "architecture_diagram"],
  timeline: ["timeline", "roadmap"],
  roadmap: ["roadmap", "summary_action", "timeline"],
  metric_dashboard: ["metric_dashboard"],
  matrix: ["matrix", "architecture_diagram", "card_grid"],
  architecture_diagram: ["architecture_diagram", "process_flow", "matrix"],
  risk_table: ["risk_table", "comparison_table"],
  case_card: ["case_card", "card_grid"],
  quote_highlight: ["quote_highlight", "cover_clean", "bullet_insight"],
  map_route: ["roadmap", "timeline", "process_flow"],
  summary_action: ["summary_action", "roadmap"],
  coordinate_graph: ["tm03_prior_knowledge_context"],
  table_formula_graph_mapping: ["tm05_table_formula_graph"],
  parameter_compare: ["tm06_parameter_comparison"],
  worked_example_steps: ["tm07_worked_example"],
  practice_feedback: ["tm08_interaction_practice"],
  concept_relation: ["tm04_concept_definition", "tm02_learning_objectives", "tm09_summary_assignment", "tm01_teacher_math_cover"]
};

export const selectedLayoutToSlideLayout: Record<LayoutId, SlideLayout> = {
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
  summary_action: "closing",
  tm01_teacher_math_cover: "cover",
  tm02_learning_objectives: "agenda",
  tm03_prior_knowledge_context: "split",
  tm04_concept_definition: "matrix",
  tm05_table_formula_graph: "comparison",
  tm06_parameter_comparison: "comparison",
  tm07_worked_example: "process",
  tm08_interaction_practice: "checklist",
  tm09_summary_assignment: "closing"
};

const layoutById = new Map(layoutLibrary.map((layout) => [layout.layoutId, layout]));

export function getLayoutDefinition(layoutId: string | undefined) {
  return layoutId ? layoutById.get(layoutId as LayoutId) : undefined;
}

export function isKnownLayoutId(layoutId: string | undefined): layoutId is LayoutId {
  return Boolean(getLayoutDefinition(layoutId));
}

export function getCandidateLayoutsForVisualForm(form: RecommendedVisualForm) {
  const preferred = new Set(visualFormToPreferredLayoutIds[form] || []);
  return layoutLibrary
    .filter((layout) => layout.supportedVisualForms.includes(form) || preferred.has(layout.layoutId))
    .sort((a, b) => Number(preferred.has(b.layoutId)) - Number(preferred.has(a.layoutId)));
}

export function roleMatchesLayout(layout: LayoutDefinition, roleText: string) {
  const clean = cleanText(roleText);
  return layout.supportedRoles.some((role) => clean.includes(role));
}

export function pptTypeMatchesLayout(layout: LayoutDefinition, pptType: ContentPlanPPTType) {
  return layout.supportedPptTypes.includes("any") || layout.supportedPptTypes.includes(pptType);
}

export function slideLayoutForSelectedLayout(selectedLayout: LayoutId | string | undefined): SlideLayout {
  return selectedLayout && isKnownLayoutId(selectedLayout) ? selectedLayoutToSlideLayout[selectedLayout] : "split";
}

export function layoutIds() {
  return layoutLibrary.map((layout) => layout.layoutId);
}
