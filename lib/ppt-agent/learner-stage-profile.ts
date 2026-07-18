import type { LessonArchitecture } from "@/lib/ppt-agent/content-plan";

export type LearnerStageId =
  | "early_childhood"
  | "primary"
  | "secondary"
  | "vocational"
  | "higher_education"
  | "unknown";

export type LearnerStageProfile = {
  id: LearnerStageId;
  label: string;
  architectureOverride?: LessonArchitecture;
  defaultBaseline: string;
  defaultDifficulty: string;
  screenPrinciples: string[];
  teacherOnlyPrinciples: string[];
};

const profiles: Record<LearnerStageId, LearnerStageProfile> = {
  early_childhood: {
    id: "early_childhood",
    label: "幼儿园",
    architectureOverride: "play_based_discovery",
    defaultBaseline: "幼儿能够在生活情境中观察、指认，并用动作或短句表达自己的发现。",
    defaultDifficulty: "幼儿的注意保持时间有限，需要通过实物操作、游戏规则和重复表达稳定经验。",
    screenPrinciples: [
      "一屏只呈现一个观察、操作或表达任务。",
      "先让幼儿看、摆、数、说，再出现教师归纳。",
      "使用生活化短句和明确动作，避免抽象术语与长段说明。",
    ],
    teacherOnlyPrinciples: [
      "游戏规则、材料准备、观察点和备用动作保留在教师端。",
      "不要求幼儿阅读课堂目标、评价术语或抽象概念定义。",
    ],
  },
  primary: {
    id: "primary",
    label: "小学",
    defaultBaseline: "学生具备与本课相关的生活经验和基础知识，能够完成短时独立任务。",
    defaultDifficulty: "学生需要借助具体情境、操作和图示，把直观经验逐步转成学科表达。",
    screenPrinciples: ["先呈现具体任务，再连接图示、语言或符号。", "每屏保留一个明确的学生动作和检查点。"],
    teacherOnlyPrinciples: ["追问、分层提示和备用示例保留在教师端。"],
  },
  secondary: {
    id: "secondary",
    label: "中学",
    defaultBaseline: "学生具备本课所需的基本前置知识，能够进行独立分析和规范表达。",
    defaultDifficulty: "学生可能记住结论，但尚不能稳定说明证据、推理过程或适用边界。",
    screenPrinciples: ["学生当前要观察、思考或完成的任务上屏。", "证据、步骤和反馈按课堂节奏分步呈现。"],
    teacherOnlyPrinciples: ["追问、预期回答、备用动作和时间提醒保留在教师端。"],
  },
  vocational: {
    id: "vocational",
    label: "中职",
    defaultBaseline: "学生具备基础知识和一定操作经验，需要把知识与真实工作任务建立联系。",
    defaultDifficulty: "学生可能能模仿操作，但对标准、原因和异常处理说明不足。",
    screenPrinciples: ["以真实任务、操作步骤和质量标准组织画面。", "示范后立即安排可检查的独立操作。"],
    teacherOnlyPrinciples: ["安全边界、设备条件和异常处理保留在教师端。"],
  },
  higher_education: {
    id: "higher_education",
    label: "大学",
    defaultBaseline: "学生具备课程所需的基础理论，能够阅读材料并完成较长的独立任务。",
    defaultDifficulty: "学生可能缺少对理论假设、证据质量和复杂情境应用的系统判断。",
    screenPrinciples: ["围绕问题、证据、模型和应用组织信息。", "保留讨论、推导或案例判断所需的完整材料。"],
    teacherOnlyPrinciples: ["拓展资料、争议边界和评价量规保留在教师端。"],
  },
  unknown: {
    id: "unknown",
    label: "未确认学段",
    defaultBaseline: "学生的前置知识尚待教师确认。",
    defaultDifficulty: "常见困难尚待教师确认。",
    screenPrinciples: ["学生当前要观察、思考或完成的任务上屏。"],
    teacherOnlyPrinciples: ["未确认的学情假设必须要求教师复核。"],
  },
};

export function resolveLearnerStageProfile(schoolStage?: string, grade?: string): LearnerStageProfile {
  const normalized = `${schoolStage || ""} ${grade || ""}`.trim();
  if (/幼儿园|托班|小班|中班|大班|学前/.test(normalized)) return profiles.early_childhood;
  if (/小学|一年级|二年级|三年级|四年级|五年级|六年级/.test(normalized)) return profiles.primary;
  if (/初中|高中|七年级|八年级|九年级|高一|高二|高三/.test(normalized)) return profiles.secondary;
  if (/中职|职高|技校/.test(normalized)) return profiles.vocational;
  if (/大学|大专|本科|研究生/.test(normalized)) return profiles.higher_education;
  return profiles.unknown;
}
