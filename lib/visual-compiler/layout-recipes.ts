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
  | "chinese-expression-studio"
  | "math-equation-workbench"
  | "math-problem-steps"
  | "math-graph-lab"
  | "chemistry-reaction-bench"
  | "chemistry-particle-model"
  | "chemistry-safety-lab"
  | "biology-structure-map"
  | "biology-process-cycle"
  | "biology-observation-lab"
  | "history-timeline-source"
  | "history-cause-map"
  | "history-debate-forum"
  | "geography-map-fieldwork"
  | "geography-systems-chain"
  | "geography-data-dashboard"
  | "english-language-drill"
  | "english-dialogue-studio"
  | "english-reading-evidence";

export type TeacherSubjectVisualProfile = "physics" | "chinese" | "math" | "chemistry" | "biology" | "history" | "geography" | "english" | "general";

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

function makeSubjectRecipe(input: {
  recipeId: string;
  label: string;
  family: Exclude<SceneCompositionFamily, "cover-hero" | "objectives-triad" | "context-visual-left" | "concept-editorial" | "comparison-stage" | "worked-example" | "practice-workspace" | "misconception-repair" | "summary-checkout" | "physics-experiment-bench" | "physics-reasoning-chain" | "physics-direction-workbench" | "chinese-close-reading" | "chinese-evidence-path" | "chinese-expression-studio">;
  useWhen: string;
  avoidWhen: string;
  visualStrategy: string;
  colors: LayoutRecipe["colors"];
}): LayoutRecipe {
  return {
    recipeId: input.recipeId,
    label: input.label,
    family: input.family,
    useWhen: input.useWhen,
    avoidWhen: input.avoidWhen,
    densityBudget: { level: "balanced", maxCharacters: 360, maxBlocks: 5 },
    typographyBudget: { titlePt: 32, bodyMinPt: 16, bodyPreferredPt: 18, captionMinPt: 10 },
    visualStrategy: input.visualStrategy,
    visualBounds: { x: 7.72, y: 1.55, width: 4.78, height: 4.86 },
    textBounds: [
      { x: 0.78, y: 1.55, width: 6.45, height: 2.18 },
      { x: 0.78, y: 4.04, width: 6.45, height: 2.37 }
    ],
    colors: input.colors
  };
}

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
  },
  "math-equation-workbench": makeSubjectRecipe({ recipeId: "teacher-math-equation-workbench/v1", label: "数学等式工作台", family: "math-equation-workbench", useWhen: "方程、函数、证明的关系建立", avoidWhen: "纯总结页", visualStrategy: "条件与等式变形并列，关系块承载推理", colors: { background: "F6FAFF", ink: "16253D", muted: "5D6B82", accent: "1F6FEB", soft: "E4F0FF", line: "B9D2F4" } }),
  "math-problem-steps": makeSubjectRecipe({ recipeId: "teacher-math-problem-steps/v1", label: "数学例题阶梯", family: "math-problem-steps", useWhen: "例题、分步计算、纠错迁移", avoidWhen: "新课情境导入", visualStrategy: "阶梯式步骤和检验回路呈现解题过程", colors: { background: "FFF9F3", ink: "2B241C", muted: "766B5E", accent: "D97706", soft: "FFF0D8", line: "EBCB99" } }),
  "math-graph-lab": makeSubjectRecipe({ recipeId: "teacher-math-graph-lab/v1", label: "数学图像实验室", family: "math-graph-lab", useWhen: "函数图像、坐标、统计概率", avoidWhen: "纯文字背诵", visualStrategy: "坐标轴、变量变化与观察结论同屏", colors: { background: "F8FBF8", ink: "1F3327", muted: "61756A", accent: "218739", soft: "E3F3E5", line: "B9DDBC" } }),
  "chemistry-reaction-bench": makeSubjectRecipe({ recipeId: "teacher-chemistry-reaction-bench/v1", label: "化学反应台", family: "chemistry-reaction-bench", useWhen: "实验现象、反应条件、方程式", avoidWhen: "章节复习总表", visualStrategy: "反应物、条件、现象和生成物形成观察链", colors: { background: "F5FBFA", ink: "16312E", muted: "607875", accent: "0F8A78", soft: "DDF3ED", line: "B7DDD4" } }),
  "chemistry-particle-model": makeSubjectRecipe({ recipeId: "teacher-chemistry-particle-model/v1", label: "化学微观模型", family: "chemistry-particle-model", useWhen: "微观粒子、结构解释、守恒", avoidWhen: "记忆作业页", visualStrategy: "粒子群和反应前后对照解释宏观现象", colors: { background: "FAF8FF", ink: "27213A", muted: "706A83", accent: "7C3AED", soft: "EEE7FF", line: "D5C8F5" } }),
  "chemistry-safety-lab": makeSubjectRecipe({ recipeId: "teacher-chemistry-safety-lab/v1", label: "化学实验安全", family: "chemistry-safety-lab", useWhen: "器材规范、危险预判、实验评价", avoidWhen: "概念首次定义", visualStrategy: "器材、风险点和规范动作三段呈现", colors: { background: "FFF9F6", ink: "3A231D", muted: "7B675F", accent: "C2410C", soft: "FFE8DF", line: "F0C4B4" } }),
  "biology-structure-map": makeSubjectRecipe({ recipeId: "teacher-biology-structure-map/v1", label: "生物结构地图", family: "biology-structure-map", useWhen: "细胞、器官、结构与功能", avoidWhen: "实验数据复盘", visualStrategy: "中心结构配合标注分区和功能证据", colors: { background: "F5FBF8", ink: "18342A", muted: "60786D", accent: "15803D", soft: "DCF4E5", line: "B6DFC4" } }),
  "biology-process-cycle": makeSubjectRecipe({ recipeId: "teacher-biology-process-cycle/v1", label: "生物过程循环", family: "biology-process-cycle", useWhen: "生命过程、反馈调节、遗传流程", avoidWhen: "单个名词释义", visualStrategy: "循环节点和条件箭头承载生命过程", colors: { background: "F7FAFF", ink: "1D2E49", muted: "62718A", accent: "2563EB", soft: "E6F0FF", line: "BDD2F2" } }),
  "biology-observation-lab": makeSubjectRecipe({ recipeId: "teacher-biology-observation-lab/v1", label: "生物观察实验", family: "biology-observation-lab", useWhen: "观察记录、实验变量、证据归纳", avoidWhen: "课后作业清单", visualStrategy: "观察窗口与变量、记录、结论证据栏并列", colors: { background: "FFFCF5", ink: "2F2A1E", muted: "776E59", accent: "A16207", soft: "FFF0C9", line: "E8D39A" } }),
  "history-timeline-source": makeSubjectRecipe({ recipeId: "teacher-history-timeline-source/v1", label: "历史时序证据", family: "history-timeline-source", useWhen: "年代、事件演进、史料定位", avoidWhen: "单一观点辩论", visualStrategy: "时间线与史料卡片并置", colors: { background: "FBF8F1", ink: "33291D", muted: "7A6B56", accent: "9A5B13", soft: "F4E8D1", line: "DEC9A7" } }),
  "history-cause-map": makeSubjectRecipe({ recipeId: "teacher-history-cause-map/v1", label: "历史因果地图", family: "history-cause-map", useWhen: "背景、原因、影响、比较", avoidWhen: "单纯年代记忆", visualStrategy: "中心事件向前后展开原因与影响", colors: { background: "F8FAFC", ink: "263344", muted: "657386", accent: "475569", soft: "E8EEF5", line: "C5D2E0" } }),
  "history-debate-forum": makeSubjectRecipe({ recipeId: "teacher-history-debate-forum/v1", label: "历史观点论坛", family: "history-debate-forum", useWhen: "史料解读、观点论证、课堂辩论", avoidWhen: "基础事实导入", visualStrategy: "左右观点台与中央证据台区分材料和判断", colors: { background: "FAF8FC", ink: "30273B", muted: "716982", accent: "8B5CF6", soft: "F0E9FF", line: "D7C8F3" } }),
  "geography-map-fieldwork": makeSubjectRecipe({ recipeId: "teacher-geography-map-fieldwork/v1", label: "地理地图考察", family: "geography-map-fieldwork", useWhen: "地图判读、区域定位、地理考察", avoidWhen: "纯概念总结", visualStrategy: "地图定位与观察记录、空间证据并列", colors: { background: "F4FBFA", ink: "183936", muted: "5F7772", accent: "0F766E", soft: "DDF3EF", line: "B8DDD7" } }),
  "geography-systems-chain": makeSubjectRecipe({ recipeId: "teacher-geography-systems-chain/v1", label: "地理系统链", family: "geography-systems-chain", useWhen: "自然过程、人地关系、区域系统", avoidWhen: "单点读图题", visualStrategy: "输入、过程、反馈三段链路表达要素作用", colors: { background: "F8FBFF", ink: "1E3147", muted: "60748A", accent: "0369A1", soft: "E0F2FE", line: "B7D9ED" } }),
  "geography-data-dashboard": makeSubjectRecipe({ recipeId: "teacher-geography-data-dashboard/v1", label: "地理数据看板", family: "geography-data-dashboard", useWhen: "统计图表、人口资源、比较分析", avoidWhen: "情境故事开场", visualStrategy: "图表、指标和数据结论并列", colors: { background: "FFFDF5", ink: "302A1C", muted: "796F55", accent: "B45309", soft: "FFF1C7", line: "E6D39D" } }),
  "english-language-drill": makeSubjectRecipe({ recipeId: "teacher-english-language-drill/v1", label: "英语语言操练", family: "english-language-drill", useWhen: "词汇、句型、语法操练", avoidWhen: "长篇阅读理解", visualStrategy: "输入、替换、输出三格操练台", colors: { background: "F4FAFF", ink: "1D3049", muted: "61748B", accent: "2563EB", soft: "E2EFFF", line: "BBD2F0" } }),
  "english-dialogue-studio": makeSubjectRecipe({ recipeId: "teacher-english-dialogue-studio/v1", label: "英语对话工作室", family: "english-dialogue-studio", useWhen: "问答、角色扮演、交际任务", avoidWhen: "单词默写页", visualStrategy: "左右对话气泡配交际任务卡", colors: { background: "FFF9F5", ink: "35251D", muted: "78675D", accent: "EA580C", soft: "FFE8DC", line: "F0C5B5" } }),
  "english-reading-evidence": makeSubjectRecipe({ recipeId: "teacher-english-reading-evidence/v1", label: "英语阅读证据", family: "english-reading-evidence", useWhen: "阅读篇章、信息定位、表达迁移", avoidWhen: "纯语音操练", visualStrategy: "篇章证据与定位、解释、复述任务并列", colors: { background: "F8FAF6", ink: "233222", muted: "687565", accent: "4D7C0F", soft: "EBF5DE", line: "C9E0B1" } })
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
        - (context.familyUseCounts?.[family] || 0) * 12
    }))
    .sort((left, right) => right.score - left.score)[0].recipe;
}

export function inferTeacherSubjectVisualProfile(text: string): TeacherSubjectVisualProfile {
  const value = text.toLowerCase();
  const scores: Array<[TeacherSubjectVisualProfile, number]> = [
    ["physics", (/物理/.test(value) ? 8 : 0) + [/磁通量/, /楞次/, /电磁/, /磁场/, /感应电流/, /线圈/, /右手螺旋/, /受力/, /运动状态/].filter((term) => term.test(value)).length * 2],
    ["chinese", (/语文/.test(value) ? 8 : 0) + [/课文/, /词句/, /段落/, /朗读/, /批注/, /人物/, /情感/, /动作描写/, /文本证据/, /朱自清/, /背影/].filter((term) => term.test(value)).length * 2],
    ["math", (/数学/.test(value) ? 8 : 0) + [/方程/, /函数/, /几何/, /坐标/, /证明/, /概率/, /统计/, /解析式/].filter((term) => term.test(value)).length * 2],
    ["chemistry", (/化学/.test(value) ? 8 : 0) + [/反应物/, /生成物/, /化学方程式/, /分子/, /原子/, /离子/, /试剂/, /溶液/, /实验安全/].filter((term) => term.test(value)).length * 2],
    ["biology", (/生物/.test(value) ? 8 : 0) + [/细胞/, /器官/, /遗传/, /生态/, /光合作用/, /生命活动/, /显微镜/, /结构与功能/].filter((term) => term.test(value)).length * 2],
    ["history", (/历史/.test(value) ? 8 : 0) + [/史料/, /朝代/, /年代/, /历史事件/, /背景/, /影响/, /改革/, /文明/].filter((term) => term.test(value)).length * 2],
    ["geography", (/地理/.test(value) ? 8 : 0) + [/地图/, /区域/, /气候/, /地形/, /人口/, /资源/, /经纬度/, /人地关系/].filter((term) => term.test(value)).length * 2],
    ["english", (/英语|english/.test(value) ? 8 : 0) + [/vocabulary/, /grammar/, /dialogue/, /reading/, /speaking/, /词汇/, /句型/, /对话/, /阅读/].filter((term) => term.test(value)).length * 2]
  ];
  const [profile, score] = scores.sort((left, right) => right[1] - left[1])[0];
  if (score >= 4) return profile;
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

  if (context.subject === "math") {
    if (/图像|坐标|统计|概率|作图|变化趋势/.test(value)) return chooseRecipe(["math-graph-lab", "math-equation-workbench", "math-problem-steps"], context);
    if (/例题|计算|解题|变式|纠错|检验|练习/.test(value)) return chooseRecipe(["math-problem-steps", "math-equation-workbench", "math-graph-lab"], context);
    return chooseRecipe(["math-equation-workbench", "math-problem-steps", "math-graph-lab"], context);
  }

  if (context.subject === "chemistry") {
    if (/安全|规范|器材|风险|操作/.test(value)) return chooseRecipe(["chemistry-safety-lab", "chemistry-reaction-bench", "chemistry-particle-model"], context);
    if (/微观|粒子|分子|原子|离子|结构|守恒/.test(value)) return chooseRecipe(["chemistry-particle-model", "chemistry-reaction-bench", "chemistry-safety-lab"], context);
    return chooseRecipe(["chemistry-reaction-bench", "chemistry-particle-model", "chemistry-safety-lab"], context);
  }

  if (context.subject === "biology") {
    if (/观察|实验|变量|显微镜|记录/.test(value)) return chooseRecipe(["biology-observation-lab", "biology-structure-map", "biology-process-cycle"], context);
    if (/过程|循环|调节|代谢|遗传|生态/.test(value)) return chooseRecipe(["biology-process-cycle", "biology-structure-map", "biology-observation-lab"], context);
    return chooseRecipe(["biology-structure-map", "biology-process-cycle", "biology-observation-lab"], context);
  }

  if (context.subject === "history") {
    if (/观点|辩论|评价|论证|不同看法/.test(value)) return chooseRecipe(["history-debate-forum", "history-timeline-source", "history-cause-map"], context);
    if (/原因|背景|影响|因果|比较/.test(value)) return chooseRecipe(["history-cause-map", "history-timeline-source", "history-debate-forum"], context);
    return chooseRecipe(["history-timeline-source", "history-cause-map", "history-debate-forum"], context);
  }

  if (context.subject === "geography") {
    if (/数据|统计|图表|人口|资源|指标/.test(value)) return chooseRecipe(["geography-data-dashboard", "geography-map-fieldwork", "geography-systems-chain"], context);
    if (/过程|系统|循环|人地|影响|反馈/.test(value)) return chooseRecipe(["geography-systems-chain", "geography-map-fieldwork", "geography-data-dashboard"], context);
    return chooseRecipe(["geography-map-fieldwork", "geography-systems-chain", "geography-data-dashboard"], context);
  }

  if (context.subject === "english") {
    if (/阅读|篇章|定位|主旨|细节|reading|text/.test(value)) return chooseRecipe(["english-reading-evidence", "english-language-drill", "english-dialogue-studio"], context);
    if (/对话|角色|问答|交际|口语|dialogue|speaking|role/.test(value)) return chooseRecipe(["english-dialogue-studio", "english-language-drill", "english-reading-evidence"], context);
    return chooseRecipe(["english-language-drill", "english-dialogue-studio", "english-reading-evidence"], context);
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
