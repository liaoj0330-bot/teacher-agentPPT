import { prisma } from "@/lib/db";

export const TEACHER_FEEDBACK_CATEGORIES = [
  "textbook",
  "content",
  "pacing",
  "layout",
  "export",
  "usability",
  "privacy",
  "other",
] as const;

export const TEACHER_FEEDBACK_SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
export const TEACHER_FEEDBACK_STATUSES = ["new", "triaged", "in_progress", "waiting_teacher", "resolved", "closed", "duplicate"] as const;

export type TeacherFeedbackCategory = (typeof TEACHER_FEEDBACK_CATEGORIES)[number];
export type TeacherFeedbackSeverity = (typeof TEACHER_FEEDBACK_SEVERITIES)[number];
export type TeacherFeedbackStatus = (typeof TEACHER_FEEDBACK_STATUSES)[number];

export type TeacherFeedbackTicket = {
  id: string;
  projectId: string | null;
  versionId: string | null;
  subject: string;
  topic: string;
  pageNumber: number | null;
  pageId: string | null;
  taskId: string | null;
  category: TeacherFeedbackCategory;
  severity: TeacherFeedbackSeverity;
  message: string;
  clientMetadata: Record<string, unknown>;
  status: TeacherFeedbackStatus;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
};

export class TeacherFeedbackError extends Error {
  constructor(public code: "invalid_input" | "context_not_found" | "not_found", message: string) {
    super(message);
  }
}

type FeedbackRow = {
  id: string;
  projectId: string | null;
  versionId: string | null;
  subject: string;
  topic: string;
  pageNumber: number | null;
  pageId: string | null;
  taskId: string | null;
  category: string;
  severity: string;
  message: string;
  clientMetadataJson: string;
  status: string;
  assignee: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
};

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function publicTicket(row: FeedbackRow): TeacherFeedbackTicket {
  return {
    id: row.id,
    projectId: row.projectId,
    versionId: row.versionId,
    subject: row.subject,
    topic: row.topic,
    pageNumber: row.pageNumber,
    pageId: row.pageId,
    taskId: row.taskId,
    category: row.category as TeacherFeedbackCategory,
    severity: row.severity as TeacherFeedbackSeverity,
    message: row.message,
    clientMetadata: parseObject(row.clientMetadataJson),
    status: row.status as TeacherFeedbackStatus,
    assignee: row.assignee,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

const SENSITIVE_METADATA_KEY = /authorization|cookie|password|secret|token|api.?key/i;

function safeMetadataValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return undefined;
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeMetadataValue(item, depth + 1));
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_METADATA_KEY.test(key))
      .slice(0, 40)
      .map(([key, item]) => [key.slice(0, 80), safeMetadataValue(item, depth + 1)])
      .filter(([, item]) => item !== undefined),
  );
}

function metadataJson(value: unknown): string {
  const safe = safeMetadataValue(value);
  const serialized = JSON.stringify(safe && typeof safe === "object" && !Array.isArray(safe) ? safe : {});
  return serialized.length <= 8_000 ? serialized : JSON.stringify({ truncated: true });
}

export async function createTeacherFeedback(userId: string, input: {
  projectId?: unknown;
  versionId?: unknown;
  subject?: unknown;
  topic?: unknown;
  pageNumber?: unknown;
  pageId?: unknown;
  taskId?: unknown;
  category?: unknown;
  severity?: unknown;
  message?: unknown;
  clientMetadata?: unknown;
  idempotencyKey?: unknown;
}) {
  const category = cleanText(input.category, 32) as TeacherFeedbackCategory;
  const severity = (cleanText(input.severity, 32) || "P2") as TeacherFeedbackSeverity;
  const message = cleanText(input.message, 4_000);
  const idempotencyKey = cleanText(input.idempotencyKey, 160);
  let projectId = cleanText(input.projectId, 80) || null;
  const versionId = cleanText(input.versionId, 80) || null;
  const pageNumber = Number.isInteger(input.pageNumber) && Number(input.pageNumber) > 0
    ? Math.min(Number(input.pageNumber), 10_000)
    : null;

  if (!TEACHER_FEEDBACK_CATEGORIES.includes(category) || !TEACHER_FEEDBACK_SEVERITIES.includes(severity)) {
    throw new TeacherFeedbackError("invalid_input", "反馈分类或影响程度无效");
  }
  if (message.length < 3 || !idempotencyKey) {
    throw new TeacherFeedbackError("invalid_input", "请填写至少 3 个字的反馈，并提供幂等键");
  }
  const clientMetadata = input.clientMetadata && typeof input.clientMetadata === "object" && !Array.isArray(input.clientMetadata)
    ? input.clientMetadata as Record<string, unknown>
    : {};
  if (clientMetadata.permissionToContact !== true) {
    throw new TeacherFeedbackError("invalid_input", "请确认允许内测运营人员就此反馈联系你");
  }

  if (projectId) {
    const project = await prisma.coursewareProject.findFirst({ where: { id: projectId, userId }, select: { id: true } });
    if (!project) throw new TeacherFeedbackError("context_not_found", "课件不存在或无权反馈");
  }
  if (versionId) {
    const version = await prisma.coursewareVersion.findFirst({
      where: { id: versionId, project: { userId }, ...(projectId ? { projectId } : {}) },
      select: { projectId: true },
    });
    if (!version) throw new TeacherFeedbackError("context_not_found", "课件版本不存在或不属于当前课件");
    projectId ??= version.projectId;
  }

  const existing = await prisma.feedbackTicket.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey } },
  });
  if (existing) return { ticket: publicTicket(existing), deduped: true };

  try {
    const created = await prisma.feedbackTicket.create({
      data: {
        userId,
        projectId,
        versionId,
        subject: cleanText(input.subject, 80),
        topic: cleanText(input.topic, 240),
        pageNumber,
        pageId: cleanText(input.pageId, 100) || null,
        taskId: cleanText(input.taskId, 100) || null,
        category,
        severity,
        message,
        clientMetadataJson: metadataJson(clientMetadata),
        idempotencyKey,
      },
    });
    return { ticket: publicTicket(created), deduped: false };
  } catch (error) {
    const duplicate = await prisma.feedbackTicket.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
    if (duplicate) return { ticket: publicTicket(duplicate), deduped: true };
    throw error;
  }
}

export async function listTeacherFeedback(userId: string, input: {
  projectId?: string;
  status?: string;
  category?: string;
  limit?: number;
}) {
  const status = input.status as TeacherFeedbackStatus | undefined;
  const category = input.category as TeacherFeedbackCategory | undefined;
  if (status && !TEACHER_FEEDBACK_STATUSES.includes(status)) throw new TeacherFeedbackError("invalid_input", "反馈状态无效");
  if (category && !TEACHER_FEEDBACK_CATEGORIES.includes(category)) throw new TeacherFeedbackError("invalid_input", "反馈分类无效");
  const requestedLimit = Number.isFinite(input.limit) ? Number(input.limit) : 50;
  const rows = await prisma.feedbackTicket.findMany({
    where: {
      userId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(requestedLimit, 100)),
  });
  return rows.map(publicTicket);
}

export async function updateTeacherFeedback(userId: string, ticketId: string, input: {
  status?: unknown;
  severity?: unknown;
  assignee?: unknown;
}) {
  const existing = await prisma.feedbackTicket.findFirst({ where: { id: ticketId, userId } });
  if (!existing) throw new TeacherFeedbackError("not_found", "反馈工单不存在");
  const status = input.status === undefined ? undefined : cleanText(input.status, 32) as TeacherFeedbackStatus;
  const severity = input.severity === undefined ? undefined : cleanText(input.severity, 32) as TeacherFeedbackSeverity;
  if (status && !TEACHER_FEEDBACK_STATUSES.includes(status)) throw new TeacherFeedbackError("invalid_input", "反馈状态无效");
  if (severity && !TEACHER_FEEDBACK_SEVERITIES.includes(severity)) throw new TeacherFeedbackError("invalid_input", "影响程度无效");
  if (status === undefined && severity === undefined && input.assignee === undefined) {
    throw new TeacherFeedbackError("invalid_input", "没有可更新的工单字段");
  }
  const assignee = input.assignee === undefined ? undefined : cleanText(input.assignee, 120) || null;
  const resolvedAt = status === "resolved" || status === "closed"
    ? existing.resolvedAt ?? new Date()
    : status
      ? null
      : undefined;
  const updated = await prisma.feedbackTicket.update({
    where: { id: ticketId },
    data: { status, severity, assignee, resolvedAt },
  });
  return publicTicket(updated);
}
