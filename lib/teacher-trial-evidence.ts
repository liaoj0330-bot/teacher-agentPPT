export const teacherTrialRubricKeys = [
  "goalAchievement",
  "pacing",
  "interaction",
  "practiceFeedback",
  "teacherNotesUsability",
] as const;

export type TeacherTrialRubricKey = (typeof teacherTrialRubricKeys)[number];

export type TeacherTrialEvidenceInput = {
  trialStartedAt?: string;
  trialEndedAt?: string;
  plannedDurationMinutes?: number;
  actualDurationMinutes?: number;
  classSize?: number;
  software?: string;
  device?: string;
  rubric?: Partial<Record<TeacherTrialRubricKey, number>>;
  issues?: string[];
  reuseDecision?: "as_is" | "after_revision" | "reject";
  teacherComment?: string;
};

export type TeacherTrialEvidence = {
  schemaVersion: "teacher-classroom-trial/v1";
  kind: "teacher_trial_evidence";
  evidenceId: string;
  reviewerUserId: string;
  trialStartedAt: string;
  trialEndedAt: string;
  plannedDurationMinutes: number;
  actualDurationMinutes: number;
  classSize?: number;
  software?: string;
  device?: string;
  rubric: Record<TeacherTrialRubricKey, number>;
  issues: string[];
  reuseDecision: "as_is" | "after_revision" | "reject";
  teacherComment?: string;
  confirmedAt: string;
};

export type TeacherTrialValidation = {
  status: "pending" | "complete" | "invalid";
  evidenceId: string | null;
  reviewerUserId: string | null;
  rubricAverage: number | null;
  actualDurationMinutes: number | null;
  errors: string[];
};

const validIso = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const validScore = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;

export function validateTeacherTrialEvidence(value: unknown): TeacherTrialValidation {
  if (!value || typeof value !== "object") {
    return { status: "pending", evidenceId: null, reviewerUserId: null, rubricAverage: null, actualDurationMinutes: null, errors: [] };
  }
  const evidence = value as Partial<TeacherTrialEvidence>;
  const errors: string[] = [];
  if (evidence.schemaVersion !== "teacher-classroom-trial/v1" || evidence.kind !== "teacher_trial_evidence") errors.push("试讲证据版本无效");
  if (!evidence.evidenceId) errors.push("缺少试讲证据 ID");
  if (!evidence.reviewerUserId) errors.push("缺少复核教师身份");
  if (!validIso(evidence.trialStartedAt) || !validIso(evidence.trialEndedAt)) errors.push("缺少有效试讲起止时间");
  else if (Date.parse(evidence.trialEndedAt!) <= Date.parse(evidence.trialStartedAt!)) errors.push("试讲结束时间必须晚于开始时间");
  if (!Number.isFinite(evidence.plannedDurationMinutes) || Number(evidence.plannedDurationMinutes) <= 0) errors.push("缺少计划时长");
  if (!Number.isFinite(evidence.actualDurationMinutes) || Number(evidence.actualDurationMinutes) <= 0) errors.push("缺少实际时长");
  const rubric = evidence.rubric || ({} as TeacherTrialEvidence["rubric"]);
  const missingRubric = teacherTrialRubricKeys.filter((key) => !validScore(rubric[key]));
  if (missingRubric.length) errors.push(`试讲量表不完整：${missingRubric.join(",")}`);
  if (!evidence.reuseDecision || !["as_is", "after_revision", "reject"].includes(evidence.reuseDecision)) errors.push("缺少复用结论");
  const scores = teacherTrialRubricKeys.map((key) => rubric[key]).filter(validScore) as number[];
  return {
    status: errors.length ? "invalid" : "complete",
    evidenceId: evidence.evidenceId || null,
    reviewerUserId: evidence.reviewerUserId || null,
    rubricAverage: scores.length === teacherTrialRubricKeys.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null,
    actualDurationMinutes: Number.isFinite(evidence.actualDurationMinutes) ? Number(evidence.actualDurationMinutes) : null,
    errors,
  };
}

export function createTeacherTrialEvidence(input: TeacherTrialEvidenceInput, reviewerUserId: string): TeacherTrialEvidence {
  const evidence: TeacherTrialEvidence = {
    schemaVersion: "teacher-classroom-trial/v1",
    kind: "teacher_trial_evidence",
    evidenceId: `trial-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    reviewerUserId,
    trialStartedAt: String(input.trialStartedAt || ""),
    trialEndedAt: String(input.trialEndedAt || ""),
    plannedDurationMinutes: Number(input.plannedDurationMinutes || 0),
    actualDurationMinutes: Number(input.actualDurationMinutes || 0),
    ...(Number.isFinite(input.classSize) ? { classSize: Number(input.classSize) } : {}),
    ...(input.software?.trim() ? { software: input.software.trim() } : {}),
    ...(input.device?.trim() ? { device: input.device.trim() } : {}),
    rubric: Object.fromEntries(teacherTrialRubricKeys.map((key) => [key, Number(input.rubric?.[key] || 0)])) as Record<TeacherTrialRubricKey, number>,
    issues: (input.issues || []).map((issue) => String(issue).trim()).filter(Boolean),
    reuseDecision: input.reuseDecision || "reject",
    ...(input.teacherComment?.trim() ? { teacherComment: input.teacherComment.trim() } : {}),
    confirmedAt: new Date().toISOString(),
  };
  const validation = validateTeacherTrialEvidence(evidence);
  if (validation.status !== "complete") throw new Error(validation.errors.join("；"));
  return evidence;
}

export function findTeacherTrialEvidence(sourceDocuments: unknown[]): TeacherTrialEvidence | null {
  for (let index = sourceDocuments.length - 1; index >= 0; index -= 1) {
    const candidate = sourceDocuments[index];
    if (candidate && typeof candidate === "object" && (candidate as { kind?: unknown }).kind === "teacher_trial_evidence") {
      return candidate as TeacherTrialEvidence;
    }
  }
  return null;
}
