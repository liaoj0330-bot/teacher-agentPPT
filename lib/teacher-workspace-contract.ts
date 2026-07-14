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