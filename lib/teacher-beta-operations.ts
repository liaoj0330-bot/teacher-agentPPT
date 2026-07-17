export const teacherBetaSupportedSubjects = [
  "语文",
  "数学",
  "英语",
  "物理",
  "化学",
  "生物",
  "历史",
  "地理",
] as const;

export type TeacherBetaTaskState = "idle" | "queued" | "running" | "succeeded" | "failed";

export type TeacherBetaNotice = {
  id: string;
  title: string;
  detail?: string;
  tone?: "info" | "warning" | "critical";
};

export type TeacherBetaOperations = {
  cohortLabel: string;
  supportedSubjects: readonly string[];
  quota: {
    remaining: number | null;
    total?: number | null;
    unit?: string;
  };
  task: {
    state: TeacherBetaTaskState;
    label: string;
    detail?: string;
    progress?: number | null;
  };
  notices: readonly TeacherBetaNotice[];
  feedbackEnabled?: boolean;
};

export const defaultTeacherBetaOperations: TeacherBetaOperations = {
  cohortLabel: "首批教师内测",
  supportedSubjects: teacherBetaSupportedSubjects,
  quota: { remaining: null, unit: "次生成" },
  task: { state: "idle", label: "当前没有运行中的任务" },
  notices: [
    {
      id: "beta-scope",
      title: "内测期间请核对教材版本和章节",
      detail: "导出后如遇字体、换行或内容问题，请从反馈入口提交。",
      tone: "info",
    },
  ],
  feedbackEnabled: true,
};

export function clampTeacherBetaProgress(progress?: number | null) {
  if (!Number.isFinite(progress)) return null;
  return Math.max(0, Math.min(100, Math.round(progress as number)));
}
