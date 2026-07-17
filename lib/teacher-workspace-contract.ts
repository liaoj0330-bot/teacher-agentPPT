export type TeacherGeneratedVisuals = {
  cover?: string;
  slides?: Record<string, string>;
};

export type TeacherVersionRow = {
  versionId: string;
  versionNumber: number;
  operation: string;
  summary: string;
  lifecycleStatus: string;
  teacherReadiness: string;
  isCurrent: boolean;
  createdAt: string;
};

export type TeacherChatRow = {
  id: string;
  role: string;
  content: string;
  status: string;
  suggestedPatch: Record<string, unknown> | null;
  appliedVersionId: string | null;
  createdAt: string;
};

export type TeacherMaterialRow = {
  name?: string;
  title?: string;
  origin?: string;
  addedAt?: string;
};

export type TeacherExportMeta = {
  artifactId?: string;
  deliveryClass?: string;
  deckSpecHash?: string;
  pageCount?: string;
  visualQA?: string;
  commercialReady?: string;
};

export type TeacherFeedbackCategory = "textbook" | "content" | "pacing" | "layout" | "export" | "usability" | "privacy" | "other";
export type TeacherFeedbackSeverity = "P0" | "P1" | "P2" | "P3";
export type TeacherFeedbackStatus = "new" | "triaged" | "in_progress" | "waiting_teacher" | "resolved" | "closed" | "duplicate";

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
