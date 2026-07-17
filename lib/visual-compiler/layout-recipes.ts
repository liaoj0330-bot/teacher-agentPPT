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
  | "summary-checkout"
  | "physics-experiment-bench"
  | "physics-reasoning-chain"
  | "physics-direction-workbench"
  | "chinese-close-reading"
  | "chinese-evidence-path"
  | "chinese-expression-studio";

export type TeacherSubjectVisualProfile = "physics" | "chinese" | "general";

export type LayoutRecipeContext = {
  subject?: TeacherSubjectVisualProfile;
  previousFamily?: SceneCompositionFamily;
  familyUseCounts?: Partial<Record<SceneCompositionFamily, number>>;
};

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
  },
  "physics-experiment-bench": {
    recipeId: "teacher-physics-experiment-bench/v1", label: "物理实验台", family: "physics-experiment-bench",
    useWhen: "实验观察、器材操作、现象记录", avoidWhen: "文本赏析或课后作业",
    densityBudget: { level: "balanced", maxCharacters: 330, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 18, captionMinPt: 10 },
    visualStrategy: "左侧实验装置与现象，右侧按条件、观察、解释形成记录链",
    visualBounds: { x: 0.78, y: 1.55, width: 6.18, height: 4.9 },
    textBounds: [
      { x: 7.3, y: 1.55, width: 5.23, height: 1.35 },
      { x: 7.3, y: 3.18, width: 5.23, height: 1.35 },
      { x: 7.3, y: 4.81, width: 5.23, height: 1.64 }
    ],
    colors: { background: "F5FAFB", ink: "132A32", muted: "5F6F75", accent: "087F8C", soft: "DDF3F5", line: "B4DDE1" }
  },
  "physics-reasoning-chain": {
    recipeId: "teacher-physics-reasoning-chain/v1", label: "物理因果链", family: "physics-reasoning-chain",
    useWhen: "规律归纳、概念关系、方向判断链", avoidWhen: "封面或单纯作业清单",
    densityBudget: { level: "dense", maxCharacters: 390, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 17, captionMinPt: 10 },
    visualStrategy: "上方给出物理状态，下方用三个并列步骤呈现条件、响应和结论",
    visualBounds: { x: 9.12, y: 1.52, width: 3.41, height: 1.72 },
    textBounds: [
      { x: 0.78, y: 1.52, width: 7.98, height: 1.72 },
      { x: 0.78, y: 3.62, width: 3.72, height: 2.78 },
      { x: 4.8, y: 3.62, width: 3.72, height: 2.78 },
      { x: 8.82, y: 3.62, width: 3.71, height: 2.78 }
    ],
    colors: { background: "F7FAFC", ink: "172033", muted: "647078", accent: "256A8A", soft: "E4F0F5", line: "BDD3DD" }
  },
  "physics-direction-workbench": {
    recipeId: "teacher-physics-direction-workbench/v1", label: "方向判断工坊", family: "physics-direction-workbench",
    useWhen: "方向判断、变式练习、纠错校验", avoidWhen: "新课封面或目标陈述",
    densityBudget: { level: "dense", maxCharacters: 370, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 17, captionMinPt: 10 },
    visualStrategy: "中央状态图作为判断锚点，两侧分别放条件读取和校验反馈",
    visualBounds: { x: 4.48, y: 1.55, width: 4.37, height: 4.85 },
    textBounds: [
      { x: 0.78, y: 1.55, width: 3.32, height: 2.18 },
      { x: 0.78, y: 4.04, width: 3.32, height: 2.36 },
      { x: 9.23, y: 1.55, width: 3.3, height: 2.18 },
      { x: 9.23, y: 4.04, width: 3.3, height: 2.36 }
    ],
    colors: { background: "FBFAF6", ink: "172033", muted: "696D72", accent: "C45B1A", soft: "FCEBDD", line: "EDCCB6" }
  },
  "chinese-close-reading": {
    recipeId: "teacher-chinese-close-reading/v1", label: "文本细读", family: "chinese-close-reading",
    useWhen: "词句品读、关键段落、朗读批注", avoidWhen: "实验记录或数据表",
    densityBudget: { level: "dense", maxCharacters: 430, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 18, captionMinPt: 10 },
    visualStrategy: "左侧保留文本证据，右侧分层承载画面还原、批注和情感解释",
    visualBounds: { x: 9.42, y: 4.45, width: 3.11, height: 1.95 },
    textBounds: [
      { x: 0.78, y: 1.55, width: 7.05, height: 4.85 },
      { x: 8.15, y: 1.55, width: 4.38, height: 1.18 },
      { x: 8.15, y: 3.03, width: 4.38, height: 1.12 }
    ],
    colors: { background: "FFFCF7", ink: "29241F", muted: "71675F", accent: "A4472A", soft: "F7EADF", line: "E7CFC0" }
  },
  "chinese-evidence-path": {
    recipeId: "teacher-chinese-evidence-path/v1", label: "语文证据链", family: "chinese-evidence-path",
    useWhen: "人物形象、情感主旨、线索结构、证据回扣", avoidWhen: "单纯作业布置",
    densityBudget: { level: "dense", maxCharacters: 390, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 17, captionMinPt: 10 },
    visualStrategy: "顶部形成文本记忆锚点，下方用词句、画面、解释三栏闭合证据链",
    visualBounds: { x: 9.34, y: 1.52, width: 3.19, height: 1.62 },
    textBounds: [
      { x: 0.78, y: 1.52, width: 8.2, height: 1.62 },
      { x: 0.78, y: 3.52, width: 3.72, height: 2.88 },
      { x: 4.8, y: 3.52, width: 3.72, height: 2.88 },
      { x: 8.82, y: 3.52, width: 3.71, height: 2.88 }
    ],
    colors: { background: "FAFBF7", ink: "24291F", muted: "68705F", accent: "687A2F", soft: "EEF1DF", line: "D6DDBD" }
  },
  "chinese-expression-studio": {
    recipeId: "teacher-chinese-expression-studio/v1", label: "表达迁移", family: "chinese-expression-studio",
    useWhen: "仿写、表达迁移、片段写作、分享修改", avoidWhen: "首次概念定义",
    densityBudget: { level: "balanced", maxCharacters: 360, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 18, captionMinPt: 10 },
    visualStrategy: "左侧情境触发，右侧依次呈现表达任务、方法支架和修改标准",
    visualBounds: { x: 0.78, y: 1.55, width: 4.18, height: 4.85 },
    textBounds: [
      { x: 5.32, y: 1.55, width: 7.21, height: 1.24 },
      { x: 5.32, y: 3.08, width: 7.21, height: 1.46 },
      { x: 5.32, y: 4.83, width: 7.21, height: 1.57 }
    ],
    colors: { background: "FAF8FC", ink: "2C2430", muted: "716779", accent: "7A4D8C", soft: "F0E6F4", line: "DAC9E1" }
  }
};

function recipeText(spec: SlideSpec, layoutId = "") {
  return [
    spec.role,
    spec.pagePurpose,
    spec.finalTitle || spec.title,
    spec.claim,
    spec.mustProve,
    spec.leadSentence,
    spec.recommendedVisualForm,
    ...(spec.visibleBlocks || []).flatMap((block) => [block.title, block.body]),
    layoutId
  ].filter(Boolean).join(" ").toLowerCase();
}

function recipeHeadline(spec: SlideSpec) {
  return [spec.role, spec.pagePurpose, spec.finalTitle || spec.title].filter(Boolean).join(" ").toLowerCase();
}

function chooseRecipe(candidates: SceneCompositionFamily[], context: LayoutRecipeContext) {
  const uniqueCandidates = [...new Set(candidates)];
  return uniqueCandidates
    .map((family, index) => ({
      recipe: recipes[family],
      score: 100 - index * 12
        - (family === context.previousFamily ? 20 : 0)
        - (context.familyUseCounts?.[family] || 0) * 3
    }))
    .sort((left, right) => right.score - left.score)[0].recipe;
}

export function inferTeacherSubjectVisualProfile(text: string): TeacherSubjectVisualProfile {
  const value = text.toLowerCase();
  const physicsScore = (/物理/.test(value) ? 8 : 0)
    + ([/磁通量/, /楞次/, /电磁/, /磁场/, /感应电流/, /线圈/, /右手螺旋/, /受力/, /运动状态/].filter((term) => term.test(value)).length * 2);
  const chineseScore = (/语文/.test(value) ? 8 : 0)
    + ([/课文/, /词句/, /段落/, /朗读/, /批注/, /人物/, /情感/, /动作描写/, /文本证据/, /朱自清/, /背影/].filter((term) => term.test(value)).length * 2);
  if (physicsScore >= 4 && physicsScore > chineseScore) return "physics";
  if (chineseScore >= 4 && chineseScore > physicsScore) return "chinese";
  return "general";
}

export function resolveLayoutRecipe(spec: SlideSpec, layoutId = "", context: LayoutRecipeContext = {}): LayoutRecipe {
  const value = recipeText(spec, layoutId);
  const headline = recipeHeadline(spec);
  if (spec.page === 1 || /封面|cover/.test(value)) return recipes["cover-hero"];
  if (/学习目标|评价方式|达成标准|objective/.test(value)) return recipes["objectives-triad"];
  if (/总结|离堂|课后|作业|回顾|summary|assignment/.test(value)) return recipes["summary-checkout"];

  if (context.subject === "physics") {
    if (/判断|方向|磁极|右手|变式|纠错|错误|检测|练习|再判|校验/.test(headline)) {
      return chooseRecipe(["physics-direction-workbench", "physics-reasoning-chain", "misconception-repair", "practice-workspace"], context);
    }
    if (/实验|检流计|观察|记录|预测|演示/.test(headline)) {
      return chooseRecipe(["physics-experiment-bench", "physics-reasoning-chain", "context-visual-left"], context);
    }
    if (/规律|定律|磁通量|变化|响应|阻碍|解释|归纳|核心概念|迁移/.test(headline)) {
      return chooseRecipe(["physics-reasoning-chain", "concept-editorial", "physics-direction-workbench"], context);
    }
    if (/实验|器材|检流计|观察|记录|现象|预测|演示/.test(value)) {
      return chooseRecipe(["physics-experiment-bench", "physics-reasoning-chain", "context-visual-left"], context);
    }
    if (/判断|方向|磁极|右手|变式|纠错|错误|检测|练习|再判|校验/.test(value)) {
      return chooseRecipe(["physics-direction-workbench", "physics-reasoning-chain", "misconception-repair", "practice-workspace"], context);
    }
    if (/规律|定律|磁通量|变化|响应|阻碍|解释|归纳|核心概念|迁移/.test(value)) {
      return chooseRecipe(["physics-reasoning-chain", "concept-editorial", "physics-direction-workbench"], context);
    }
  }

  if (context.subject === "chinese") {
    if (/仿写|表达|写作|片段|迁移|分享|修改|短答|练习|任务/.test(headline)) {
      return chooseRecipe(["chinese-expression-studio", "practice-workspace", "chinese-evidence-path"], context);
    }
    if (/证据|人物|父爱|形象|情感|线索|结构|叙事|主旨|照应|为什么|为何/.test(headline)) {
      return chooseRecipe(["chinese-evidence-path", "chinese-close-reading", "concept-editorial"], context);
    }
    if (/词句|段落|细读|精读|品读|朗读|批注|动作|描写|原文|攀|缩|倾/.test(headline)) {
      return chooseRecipe(["chinese-close-reading", "chinese-evidence-path", "concept-editorial"], context);
    }
    if (/词句|段落|细读|精读|品读|朗读|批注|动作|描写|原文|攀|缩|倾/.test(value)) {
      return chooseRecipe(["chinese-close-reading", "chinese-evidence-path", "concept-editorial"], context);
    }
    if (/证据|人物|父爱|形象|情感|线索|结构|叙事|主旨|照应|为什么/.test(value)) {
      return chooseRecipe(["chinese-evidence-path", "chinese-close-reading", "concept-editorial"], context);
    }
    if (/仿写|表达|写作|片段|迁移|分享|修改|短答|练习|任务/.test(value)) {
      return chooseRecipe(["chinese-expression-studio", "practice-workspace", "chinese-evidence-path"], context);
    }
  }

  if (/情境|导入|前置|已有知识|context|prior/.test(value)) return recipes["context-visual-left"];
  if (/例题|示范|推导|worked|example/.test(value)) return recipes["worked-example"];
  if (/纠错|错因|易错|再练习|misconception/.test(value)) return recipes["misconception-repair"];
  if (/练习|互动|探究|操作|反馈|practice|inquiry/.test(value)) return recipes["practice-workspace"];
  if (/迁移/.test(value)) return recipes["summary-checkout"];
  if (/比较|对比|参数|comparison|compare/.test(value)) return recipes["comparison-stage"];
  return recipes["concept-editorial"];
}

export function teacherLayoutRecipeCatalog() {
  return Object.values(recipes);
}
