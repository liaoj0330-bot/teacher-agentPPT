import type { CanvasProject } from "@/lib/canvas-data";
import type {
  TeacherChatRow,
  TeacherFeedbackCategory,
  TeacherFeedbackSeverity,
  TeacherFeedbackStatus,
  TeacherFeedbackTicket,
  TeacherVersionRow,
} from "@/lib/teacher-workspace-contract";
import type { TeacherDeckScoreReportV3 } from "@/lib/teacher-deck-scoring-v3";
import type { TeacherTrialValidation } from "@/lib/teacher-trial-evidence";

export type TeacherVersionSnapshot = {
  message?: string;
  versionId?: string;
  versionNumber?: number;
  lifecycleStatus?: string;
  engineeringStatus?: string;
  teacherReadiness?: string;
  deckSpec: NonNullable<CanvasProject["deckSpec"]>;
  slides: CanvasProject["slides"];
  contentPlan?: CanvasProject["contentPlan"];
  sourceDocuments?: unknown[];
  isCurrent?: boolean;
  renderManifest?: Record<string, string>;
  renderManifestArtifactId?: string | null;
  teacherScoreV3?: TeacherDeckScoreReportV3;
  teacherTrialValidation?: TeacherTrialValidation;
};

async function readJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export async function readTeacherVersion(projectId: string, versionId: string): Promise<TeacherVersionSnapshot> {
  const response = await fetch(`/api/courseware-version?projectId=${encodeURIComponent(projectId)}&versionId=${encodeURIComponent(versionId)}`);
  const data = await readJson<Partial<TeacherVersionSnapshot>>(response);
  if (!response.ok || !data?.deckSpec || !Array.isArray(data.slides)) {
    throw new Error(data?.message || "服务器版本读取失败");
  }
  return data as TeacherVersionSnapshot;
}

export async function readTeacherVersions(projectId: string): Promise<TeacherVersionRow[]> {
  const response = await fetch(`/api/courseware-versions?projectId=${encodeURIComponent(projectId)}`);
  const data = await readJson<{ message?: string; versions?: TeacherVersionRow[] }>(response);
  if (!response.ok || !data?.versions) throw new Error(data?.message || "版本历史读取失败");
  return data.versions;
}

export async function readTeacherChat(projectId: string): Promise<TeacherChatRow[]> {
  const response = await fetch(`/api/courseware-chat?projectId=${encodeURIComponent(projectId)}`);
  const data = await readJson<{ message?: string; messages?: TeacherChatRow[] }>(response);
  if (!response.ok || !data?.messages) throw new Error(data?.message || "课件对话读取失败");
  return data.messages;
}
export type TeacherCommitSuccess = {
  kind: "success";
  versionId: string;
  versionNumber?: number;
  artifactId?: string | null;
  deduped?: boolean;
};

export type TeacherCommitConflict = {
  kind: "conflict";
  message?: string;
};

export async function commitTeacherWorkspaceVersion(input: {
  projectId: string;
  baseVersionId: string;
  operation: string;
  payload?: Record<string, unknown>;
}): Promise<TeacherCommitSuccess | TeacherCommitConflict> {
  const response = await fetch("/api/courseware-version", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      idempotencyKey: `${input.operation}-${input.baseVersionId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      payload: input.payload ?? {},
    }),
  });
  const data = await readJson<{
    code?: string;
    message?: string;
    versionId?: string;
    versionNumber?: number;
    artifactId?: string | null;
    deduped?: boolean;
  }>(response);
  if (response.status === 409) return { kind: "conflict", message: data?.message };
  if (!response.ok || !data?.versionId) throw new Error(data?.message || `保存失败（${input.operation}）`);
  return {
    kind: "success",
    versionId: data.versionId,
    versionNumber: data.versionNumber,
    artifactId: data.artifactId,
    deduped: data.deduped,
  };
}

export async function submitTeacherFeedback(input: {
  projectId?: string;
  versionId?: string;
  subject?: string;
  topic?: string;
  pageNumber?: number;
  pageId?: string;
  taskId?: string;
  category: TeacherFeedbackCategory;
  severity?: TeacherFeedbackSeverity;
  message: string;
  clientMetadata?: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<{ ticket: TeacherFeedbackTicket; deduped: boolean }> {
  const response = await fetch("/api/teacher-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson<{ message?: string; ticket?: TeacherFeedbackTicket; deduped?: boolean }>(response);
  if (!response.ok || !data?.ticket) throw new Error(data?.message || "反馈提交失败");
  return { ticket: data.ticket, deduped: data.deduped === true };
}

export async function listTeacherFeedback(input: {
  projectId?: string;
  status?: TeacherFeedbackStatus;
  category?: TeacherFeedbackCategory;
  limit?: number;
} = {}): Promise<TeacherFeedbackTicket[]> {
  const query = new URLSearchParams();
  if (input.projectId) query.set("projectId", input.projectId);
  if (input.status) query.set("status", input.status);
  if (input.category) query.set("category", input.category);
  if (input.limit) query.set("limit", String(input.limit));
  const response = await fetch(`/api/teacher-feedback${query.size ? `?${query}` : ""}`);
  const data = await readJson<{ message?: string; tickets?: TeacherFeedbackTicket[] }>(response);
  if (!response.ok || !data?.tickets) throw new Error(data?.message || "反馈列表读取失败");
  return data.tickets;
}

export async function updateTeacherFeedback(ticketId: string, input: {
  status?: TeacherFeedbackStatus;
  severity?: TeacherFeedbackSeverity;
  assignee?: string | null;
}): Promise<TeacherFeedbackTicket> {
  const response = await fetch(`/api/teacher-feedback/${encodeURIComponent(ticketId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await readJson<{ message?: string; ticket?: TeacherFeedbackTicket }>(response);
  if (!response.ok || !data?.ticket) throw new Error(data?.message || "反馈工单更新失败");
  return data.ticket;
}
