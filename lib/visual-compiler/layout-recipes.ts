import type { SlideSpec } from "@/lib/canvas-data";
import type { VisualRect } from "@/lib/visual-compiler/contracts";

export type SceneCompositionFamily =
  | "cover-hero"
  | "objectives-triad"
  | "context-visual-left"
  | "concept-editorial"
  | "comparison-stage"
  | "worked-example"
  | "practice-workspace"
  | "misconception-repair"
  | "summary-checkout";

export type LayoutRecipe = {
  recipeId: string;
  label: string;
  family: SceneCompositionFamily;
  useWhen: string;
  avoidWhen: string;
  densityBudget: { level: "sparse" | "balanced" | "dense"; maxCharacters: number; maxBlocks: number };
  typographyBudget: { titlePt: number; bodyMinPt: number; bodyPreferredPt: number; captionMinPt: number };
  visualStrategy: string;
  titleBounds?: VisualRect;
  visualBounds: VisualRect;
  textBounds: VisualRect[];
  colors: { background: string; ink: string; muted: string; accent: string; soft: string; line: string };
};

const title = { x: 0.72, y: 0.42, width: 11.89, height: 0.78 };

const recipes: Record<SceneCompositionFamily, LayoutRecipe> = {
  "cover-hero": {
    recipeId: "teacher-cover-hero/v1", label: "主题定调", family: "cover-hero",
    useWhen: "课程封面、单元开场", avoidWhen: "密集正文或表格",
    densityBudget: { level: "sparse", maxCharacters: 150, maxBlocks: 3 },
    typographyBudget: { titlePt: 34, bodyMinPt: 16, bodyPreferredPt: 18, captionMinPt: 10 },
    visualStrategy: "右侧沉浸课堂主视觉，左侧只保留主题、主问题和课程信息",
    titleBounds: { x: 0.82, y: 1.24, width: 5.95, height: 1.32 },
    visualBounds: { x: 7.18, y: 0.52, width: 5.55, height: 6.38 },
    textBounds: [{ x: 0.88, y: 3.72, width: 5.78, height: 2.18 }],
    colors: { background: "F7FBFA", ink: "172033", muted: "667085", accent: "0E7C66", soft: "DDF2EC", line: "B9DCD3" }
  },
  "objectives-triad": {
    recipeId: "teacher-objectives-triad/v1", label: "目标与评价", family: "objectives-triad",
    useWhen: "学习目标、达成标准", avoidWhen: "长篇概念讲解",
    densityBudget: { level: "balanced", maxCharacters: 300, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 18, captionMinPt: 10 },
    visualStrategy: "左侧两级目标，右上视觉提示，右下达成检查",
    visualBounds: { x: 9.05, y: 1.55, width: 3.48, height: 2.55 },
    textBounds: [
      { x: 0.78, y: 1.55, width: 7.92, height: 0.78 },
      { x: 0.78, y: 2.68, width: 3.72, height: 1.42 },
      { x: 4.82, y: 2.68, width: 3.88, height: 1.42 },
      { x: 0.78, y: 4.42, width: 7.92, height: 1.86 },
      { x: 9.05, y: 4.42, width: 3.48, height: 1.86 }
    ],
    colors: { background: "F8FAFF", ink: "172033", muted: "667085", accent: "2563EB", soft: "EAF1FF", line: "C8D8F5" }
  },
  "context-visual-left": {
    recipeId: "teacher-context-visual-left/v1", label: "情境观察", family: "context-visual-left",
    useWhen: "情境导入、前置知识、观察发现", avoidWhen: "总结与作业",
    densityBudget: { level: "balanced", maxCharacters: 300, maxBlocks: 4 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 18, captionMinPt: 10 },
    visualStrategy: "左侧真实情境，右侧已有经验与待解决问题",
    visualBounds: { x: 0.78, y: 1.55, width: 5.28, height: 4.85 },
    textBounds: [
      { x: 6.42, y: 1.55, width: 6.1, height: 2.22 },
      { x: 6.42, y: 4.08, width: 6.1, height: 2.32 }
    ],
    colors: { background: "FFFCF6", ink: "172033", muted: "6B7280", accent: "D97706", soft: "FFF0D2", line: "F0D6A4" }
  },
  "concept-editorial": {
    recipeId: "teacher-concept-editorial/v1", label: "概念建构", family: "concept-editorial",
    useWhen: "概念、算理、定义、关键条件", avoidWhen: "纯练习或作业",
    densityBudget: { level: "balanced", maxCharacters: 360, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 18, captionMinPt: 10 },
    visualStrategy: "左侧定义与解释分层，右侧图像承担直观证明",
    visualBounds: { x: 8.48, y: 1.55, width: 4.05, height: 4.85 },
    textBounds: [
      { x: 0.78, y: 1.55, width: 7.28, height: 2.15 },
      { x: 0.78, y: 4.02, width: 7.28, height: 2.38 }
    ],
    colors: { background: "F8FBFA", ink: "172033", muted: "667085", accent: "0F766E", soft: "DFF5EF", line: "B8DDD5" }
  },
  "comparison-stage": {
    recipeId: "teacher-comparison-stage/v1", label: "对比推理", family: "comparison-stage",
    useWhen: "方法比较、参数比较、两类判断", avoidWhen: "单一结论封面",
    densityBudget: { level: "dense", maxCharacters: 340, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 17, captionMinPt: 10 },
    visualStrategy: "上方视觉建立比较对象，下方并列解释差异和结论",
    visualBounds: { x: 7.5, y: 1.55, width: 5.03, height: 2.68 },
    textBounds: [
      { x: 0.78, y: 1.55, width: 6.32, height: 2.68 },
      { x: 0.78, y: 4.55, width: 5.65, height: 1.85 },
      { x: 6.72, y: 4.55, width: 5.81, height: 1.85 }
    ],
    colors: { background: "F9FAFC", ink: "172033", muted: "667085", accent: "5B5BD6", soft: "ECECFF", line: "CCCCEE" }
  },
  "worked-example": {
    recipeId: "teacher-worked-example/v1", label: "例题推导", family: "worked-example",
    useWhen: "例题、示范、步骤推导", avoidWhen: "目标总览",
    densityBudget: { level: "dense", maxCharacters: 420, maxBlocks: 6 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 17, captionMinPt: 10 },
    visualStrategy: "左侧题目材料，右侧按题目、步骤、检验推进",
    visualBounds: { x: 0.78, y: 1.55, width: 5.12, height: 4.85 },
    textBounds: [
      { x: 6.25, y: 1.55, width: 6.28, height: 1.18 },
      { x: 6.25, y: 3.02, width: 6.28, height: 2.08 },
      { x: 6.25, y: 5.4, width: 6.28, height: 1.0 }
    ],
    colors: { background: "FFF9F6", ink: "172033", muted: "6B7280", accent: "E9503F", soft: "FFE8DF", line: "F3C5B7" }
  },
  "practice-workspace": {
    recipeId: "teacher-practice-workspace/v1", label: "课堂任务", family: "practice-workspace",
    useWhen: "课堂练习、操作探究、互动反馈", avoidWhen: "概念封面",
    densityBudget: { level: "dense", maxCharacters: 360, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 17, captionMinPt: 10 },
    visualStrategy: "左侧任务、作答和反馈，右侧操作图或题目图",
    visualBounds: { x: 8.55, y: 1.55, width: 3.98, height: 4.85 },
    textBounds: [
      { x: 0.78, y: 1.55, width: 7.35, height: 1.55 },
      { x: 0.78, y: 3.4, width: 7.35, height: 1.35 },
      { x: 0.78, y: 5.05, width: 7.35, height: 1.35 }
    ],
    colors: { background: "F7FAFF", ink: "172033", muted: "667085", accent: "2F6FEC", soft: "E7F0FF", line: "C6D8F6" }
  },
  "misconception-repair": {
    recipeId: "teacher-misconception-repair/v1", label: "纠错闭环", family: "misconception-repair",
    useWhen: "易错辨析、错因诊断、再练习", avoidWhen: "封面或目录",
    densityBudget: { level: "dense", maxCharacters: 360, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 17, captionMinPt: 10 },
    visualStrategy: "左侧错误与修正，右上诊断图，右下再验任务",
    visualBounds: { x: 8.75, y: 1.55, width: 3.78, height: 2.65 },
    textBounds: [
      { x: 0.78, y: 1.55, width: 7.55, height: 0.82 },
      { x: 0.78, y: 2.72, width: 7.55, height: 3.68 },
      { x: 8.75, y: 4.52, width: 3.78, height: 1.88 }
    ],
    colors: { background: "FFF9FA", ink: "172033", muted: "6B7280", accent: "BE3455", soft: "FFE8ED", line: "F1C4CE" }
  },
  "summary-checkout": {
    recipeId: "teacher-summary-checkout/v1", label: "总结与迁移", family: "summary-checkout",
    useWhen: "课堂总结、作业、迁移任务", avoidWhen: "新概念首次讲解",
    densityBudget: { level: "balanced", maxCharacters: 340, maxBlocks: 6 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 17, captionMinPt: 10 },
    visualStrategy: "左侧知识闭环与迁移任务，右侧用图形成记忆锚点",
    visualBounds: { x: 8.68, y: 1.55, width: 3.85, height: 4.85 },
    textBounds: [
      { x: 0.78, y: 1.55, width: 7.48, height: 2.45 },
      { x: 0.78, y: 4.32, width: 7.48, height: 2.08 }
    ],
    colors: { background: "F8FBF7", ink: "172033", muted: "667085", accent: "3F7D20", soft: "E8F5DF", line: "C9E2BB" }
  }
};

export function resolveLayoutRecipe(spec: SlideSpec, layoutId = ""): LayoutRecipe {
  const value = `${spec.role} ${spec.pagePurpose || ""} ${spec.finalTitle || spec.title} ${spec.recommendedVisualForm || ""} ${layoutId}`.toLowerCase();
  if (spec.page === 1 || /封面|cover/.test(value)) return recipes["cover-hero"];
  if (/学习目标|评价方式|objective/.test(value)) return recipes["objectives-triad"];
  if (/情境|导入|前置|已有知识|context|prior/.test(value)) return recipes["context-visual-left"];
  if (/例题|示范|推导|worked|example/.test(value)) return recipes["worked-example"];
  if (/纠错|错因|易错|再练习|misconception/.test(value)) return recipes["misconception-repair"];
  if (/练习|互动|探究|操作|反馈|practice|inquiry/.test(value)) return recipes["practice-workspace"];
  if (/总结|作业|回顾|迁移|summary|assignment/.test(value)) return recipes["summary-checkout"];
  if (/比较|对比|参数|comparison|compare/.test(value)) return recipes["comparison-stage"];
  return recipes["concept-editorial"];
}

export function teacherLayoutRecipeCatalog() {
  return Object.values(recipes);
}
