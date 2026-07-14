import type { CanvasProject } from "@/lib/canvas-data";

const forbidden = ["领导决策", "客户收益", "商业机会", "机会风险", "决策依据", "资料边界", "复盘口径", "行业报告", "研究报告", "ENGINEERING_DEMO_MATERIAL", "工程验收", "系统提示词"];
const requiredRoles = ["learning_objectives", "concept_explanation", "worked_example", "practice", "summary"];
export type TeacherSemanticValidation = { passed: boolean; p0Issues: string[]; p1Warnings: string[]; missingRoles: string[]; forbiddenPhrases: string[]; topicMismatch: boolean };
export function validateTeacherCoursewareSemantics(input: { project: Pick<CanvasProject, "title" | "slides">; topic: string; roles?: string[] }): TeacherSemanticValidation {
  const visible = [input.project.title, ...input.project.slides.flatMap((slide) => [slide.title, slide.subtitle, ...(slide.bullets || [])])].join(" ");
  const forbiddenPhrases = forbidden.filter((phrase) => visible.includes(phrase));
  const roles = input.roles || [];
  const missingRoles = requiredRoles.filter((role) => !roles.includes(role));
  const topicToken = input.topic.replace(/[的与和、，。\s]/g, "").slice(0, 4);
  const topicMismatch = Boolean(topicToken) && !visible.replace(/[的与和、，。\s]/g, "").includes(topicToken);
  const p0Issues = [...forbiddenPhrases.map((item) => `禁止语义：${item}`), ...missingRoles.map((item) => `缺少教学角色：${item}`)];
  return { passed: p0Issues.length === 0 && !topicMismatch, p0Issues, p1Warnings: topicMismatch ? ["课件内容与课题的一致性不足。"] : [], missingRoles, forbiddenPhrases, topicMismatch };
}
