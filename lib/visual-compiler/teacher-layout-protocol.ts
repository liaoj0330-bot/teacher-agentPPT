import type { InformationDensity } from "@/lib/ppt-agent/layout-plan";
import type { LayoutContract, LayoutSlotContract, LayoutSlotKind, VisualRect } from "@/lib/visual-compiler/contracts";

const canvas = { width: 13.3333, height: 7.5, unit: "in" as const };
const title: VisualRect = { x: 0.72, y: 0.42, width: 11.89, height: 0.72 };

type SlotSeed = [name: string, kind: LayoutSlotKind, required: boolean, bounds: VisualRect, maxCharacters?: number, maxItems?: number];

function slot(layoutId: string, seed: SlotSeed): LayoutSlotContract {
  return { slotId: `${layoutId}:${seed[0]}`, name: seed[0], kind: seed[1], required: seed[2], bounds: seed[3], maxCharacters: seed[4], maxItems: seed[5] };
}

function layout(input: { id: string; name: string; family: string; roles: string[]; density: InformationDensity[]; maxCharacters: number; maxItems: number; slots: SlotSeed[] }): LayoutContract {
  return {
    schemaVersion: "teacher-layout-contract/v1",
    layoutId: input.id,
    name: input.name,
    family: input.family,
    source: "teacher_builtin",
    sourceKey: "teacher-visual-protocol/v1",
    canvas,
    pageRoles: input.roles,
    densities: input.density,
    slots: input.slots.map((seed) => slot(input.id, seed)),
    constraints: { maxCharacters: input.maxCharacters, maxItems: input.maxItems, minBodyFontPt: 16, minCaptionFontPt: 10, safeMarginIn: 0.24 },
    capabilities: { browser: true, pptx: true, editable: true },
    warnings: []
  };
}

export const teacherLayoutProtocol: LayoutContract[] = [
  layout({ id: "tm01_teacher_math_cover", name: "课程封面", family: "teacher_cover", roles: ["课程封面", "课题定调"], density: ["low"], maxCharacters: 150, maxItems: 3, slots: [
    ["title", "title", true, { x: 0.82, y: 1.38, width: 6.1, height: 1.25 }, 34], ["subtitle", "subtitle", false, { x: 0.88, y: 2.86, width: 5.9, height: 0.72 }, 64],
    ["coreQuestion", "body", true, { x: 0.88, y: 4.18, width: 5.9, height: 1.1 }, 86], ["heroVisual", "image", false, { x: 7.3, y: 0.72, width: 5.25, height: 5.95 }], ["lessonMeta", "meta", false, { x: 0.88, y: 6.36, width: 6.0, height: 0.32 }, 48]
  ] }),
  layout({ id: "tm02_learning_objectives", name: "学习目标", family: "teacher_objectives", roles: ["学习目标", "评价方式"], density: ["medium"], maxCharacters: 260, maxItems: 5, slots: [
    ["title", "title", true, title, 28], ["objectiveGrid", "body", true, { x: 0.78, y: 1.55, width: 8.15, height: 4.85 }, 210, 4], ["studentAction", "interaction", false, { x: 9.18, y: 1.55, width: 3.35, height: 2.15 }, 72], ["masteryCheck", "interaction", true, { x: 9.18, y: 3.98, width: 3.35, height: 2.42 }, 82]
  ] }),
  layout({ id: "tm03_prior_knowledge_context", name: "情境与前置知识", family: "teacher_context", roles: ["前置知识", "情境导入"], density: ["medium"], maxCharacters: 300, maxItems: 5, slots: [
    ["title", "title", true, title, 28], ["contextVisual", "image", false, { x: 0.78, y: 1.55, width: 5.25, height: 4.85 }], ["priorKnowledge", "body", true, { x: 6.28, y: 1.55, width: 6.25, height: 2.62 }, 150], ["studentPrompt", "interaction", true, { x: 6.28, y: 4.42, width: 6.25, height: 1.98 }, 96]
  ] }),
  layout({ id: "tm04_concept_definition", name: "概念建构", family: "teacher_concept", roles: ["概念定义", "概念讲解"], density: ["medium"], maxCharacters: 340, maxItems: 5, slots: [
    ["title", "title", true, title, 28], ["definition", "body", true, { x: 0.78, y: 1.55, width: 7.65, height: 2.2 }, 150], ["keyProperties", "body", true, { x: 0.78, y: 4.0, width: 7.65, height: 2.35 }, 150], ["conceptCheck", "interaction", true, { x: 8.7, y: 1.55, width: 3.83, height: 4.8 }, 92]
  ] }),
  layout({ id: "tm05_table_formula_graph", name: "表式图映射", family: "teacher_mapping", roles: ["表示方式映射", "表式图"], density: ["high"], maxCharacters: 260, maxItems: 6, slots: [
    ["title", "title", true, title, 28], ["valueTable", "table", true, { x: 0.78, y: 1.55, width: 3.6, height: 4.85 }], ["formula", "formula", true, { x: 4.65, y: 1.55, width: 3.45, height: 4.85 }, 100], ["coordinateGraph", "chart", true, { x: 8.37, y: 1.55, width: 4.16, height: 4.85 }]
  ] }),
  layout({ id: "tm06_parameter_comparison", name: "参数与方法对比", family: "teacher_compare", roles: ["参数比较", "方法对比"], density: ["medium", "high"], maxCharacters: 300, maxItems: 5, slots: [
    ["title", "title", true, title, 28], ["leftComparison", "chart", true, { x: 0.78, y: 1.55, width: 5.62, height: 3.9 }], ["rightComparison", "chart", true, { x: 6.68, y: 1.55, width: 5.85, height: 3.9 }], ["comparisonConclusion", "body", true, { x: 0.78, y: 5.7, width: 11.75, height: 0.72 }, 110]
  ] }),
  layout({ id: "tm07_worked_example", name: "例题分步推导", family: "teacher_example", roles: ["例题分步讲解", "例题讲解"], density: ["medium"], maxCharacters: 380, maxItems: 6, slots: [
    ["title", "title", true, title, 28], ["problem", "body", true, { x: 0.78, y: 1.48, width: 11.75, height: 0.85 }, 100], ["reasoningSteps", "body", true, { x: 0.78, y: 2.62, width: 8.2, height: 3.78 }, 230, 5], ["keyDecision", "interaction", true, { x: 9.25, y: 2.62, width: 3.28, height: 1.72 }, 76], ["studentCheck", "interaction", true, { x: 9.25, y: 4.64, width: 3.28, height: 1.76 }, 76]
  ] }),
  layout({ id: "tm08_interaction_practice", name: "课堂练习", family: "teacher_practice", roles: ["课堂互动", "练习反馈", "课堂练习"], density: ["medium"], maxCharacters: 320, maxItems: 5, slots: [
    ["title", "title", true, title, 28], ["problem", "body", true, { x: 0.78, y: 1.55, width: 7.55, height: 3.18 }, 180], ["answerArea", "interaction", true, { x: 0.78, y: 5.02, width: 7.55, height: 1.38 }, 80], ["hint", "body", false, { x: 8.62, y: 1.55, width: 3.91, height: 1.72 }, 72], ["feedback", "interaction", true, { x: 8.62, y: 3.55, width: 3.91, height: 2.85 }, 92]
  ] }),
  layout({ id: "tm09_summary_assignment", name: "总结与自检", family: "teacher_summary", roles: ["课堂总结", "总结", "作业"], density: ["medium"], maxCharacters: 300, maxItems: 6, slots: [
    ["title", "title", true, title, 28], ["conceptSummary", "body", true, { x: 0.78, y: 1.55, width: 7.55, height: 4.85 }, 210], ["selfCheck", "interaction", true, { x: 8.62, y: 1.55, width: 3.91, height: 2.2 }, 82], ["assignment", "body", true, { x: 8.62, y: 4.02, width: 3.91, height: 2.38 }, 92]
  ] }),
  layout({ id: "tm10_image_explanation", name: "图像观察与解释", family: "teacher_image_explanation", roles: ["图文解释", "观察发现"], density: ["medium"], maxCharacters: 240, maxItems: 4, slots: [
    ["title", "title", true, title, 28], ["mainVisual", "image", true, { x: 0.78, y: 1.55, width: 7.65, height: 4.85 }], ["observation", "body", true, { x: 8.7, y: 1.55, width: 3.83, height: 2.62 }, 110], ["explanation", "interaction", true, { x: 8.7, y: 4.42, width: 3.83, height: 1.98 }, 92]
  ] }),
  layout({ id: "tm11_misconception_correction", name: "易错辨析", family: "teacher_misconception", roles: ["易错提醒", "错误辨析"], density: ["medium"], maxCharacters: 300, maxItems: 5, slots: [
    ["title", "title", true, title, 28], ["wrongReasoning", "body", true, { x: 0.78, y: 1.55, width: 5.52, height: 3.75 }, 130], ["correctReasoning", "body", true, { x: 6.58, y: 1.55, width: 5.95, height: 3.75 }, 150], ["diagnosticQuestion", "interaction", true, { x: 0.78, y: 5.58, width: 11.75, height: 0.82 }, 92]
  ] }),
  layout({ id: "tm12_class_feedback", name: "课堂反馈", family: "teacher_feedback", roles: ["课堂反馈", "学情反馈"], density: ["medium", "high"], maxCharacters: 260, maxItems: 6, slots: [
    ["title", "title", true, title, 28], ["responseDistribution", "chart", true, { x: 0.78, y: 1.55, width: 5.55, height: 4.85 }], ["observedDifficulty", "body", true, { x: 6.62, y: 1.55, width: 5.91, height: 2.25 }, 120], ["reteachAction", "interaction", true, { x: 6.62, y: 4.08, width: 5.91, height: 2.32 }, 110]
  ] }),
  layout({ id: "tm13_assignment_extension", name: "作业与拓展", family: "teacher_assignment", roles: ["作业布置", "拓展任务"], density: ["medium"], maxCharacters: 300, maxItems: 6, slots: [
    ["title", "title", true, title, 28], ["coreAssignment", "body", true, { x: 0.78, y: 1.55, width: 5.72, height: 4.85 }, 150], ["extensionTask", "body", true, { x: 6.78, y: 1.55, width: 5.75, height: 3.2 }, 130], ["submissionCheck", "interaction", true, { x: 6.78, y: 5.02, width: 5.75, height: 1.38 }, 82]
  ] })
];

export function mergeTeacherLayoutProtocol(layouts: LayoutContract[]) {
  const teacherIds = new Set(teacherLayoutProtocol.map((item) => item.layoutId));
  return [...teacherLayoutProtocol, ...layouts.filter((item) => !teacherIds.has(item.layoutId))];
}
