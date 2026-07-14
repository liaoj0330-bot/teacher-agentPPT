import type { CanvasProject, TeacherTheme, TeacherVisualMode } from "@/lib/canvas-data";
import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import type { LayoutPlan } from "@/lib/ppt-agent/layout-plan";
import type { TeacherLessonType } from "@/lib/teacher-template-registry";

export type TeacherCoursewareTask = {
  scenario: "teacher_courseware";
  planningMode: "professional";
  /** Product scenario. This must reach planning; workbench mode alone is not a teaching strategy. */
  generationMode?: "chapter_prep" | "lesson_plan" | "optimize_existing";
  lessonType?: TeacherLessonType;
  templateId?: string;
  schoolStage: string;
  grade: string;
  subject: string;
  topic: string;
  duration: string;
  // 鈹€鈹€ Extended fields (Phase 2 / 069) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  /** Independent teaching requirements 鈥?must NOT be folded into pastedMaterials */
  teachingRequirements?: string;
  /** Textbook name / edition used for this lesson */
  textbook?: string;
  /** Chapter or unit reference within the textbook */
  chapter?: string;
  // 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
  uploadedFiles: unknown[];
  pastedMaterials: string;
  teacherStyle: {
    visualMode: TeacherVisualMode;
    theme: TeacherTheme;
  };
  /** Teacher-confirmed plan used to compile the deck. */
  deckPlan?: TeacherDeckPlan;
};

export type TeacherDeckPlanPage = {
  id: string;
  role: string;
  titleIntent: string;
  pagePurpose: string;
  mustProve: string;
  layoutHint?: string;
  priority?: "required" | "recommended";
};

export type TeacherDeckPlanStatus =
  | "draft"
  | "generating"
  | "reviewing"
  | "confirmed"
  | "compiling"
  | "ready"
  | "failed";

export type TeacherDeckPlanProgress = {
  totalPages: number;
  completedPages: number;
  completedPageIds?: string[];
  activePageId?: string;
  failedPageIds: string[];
  updatedAt: string;
};

export type TeacherDeckPlanFailure = {
  code: string;
  message: string;
  retryable: boolean;
  failedAt: string;
  resumeStatus: Exclude<TeacherDeckPlanStatus, "failed">;
};

export type TeacherDeckPlanTransition = {
  from: TeacherDeckPlanStatus;
  to: TeacherDeckPlanStatus;
  event: string;
  at: string;
};

export type TeacherDeckPlan = {
  planId: string;
  status: TeacherDeckPlanStatus;
  pageCount: number;
  confirmedAt?: string;
  pages: TeacherDeckPlanPage[];
  projectId?: string;
  requestId?: string;
  revision?: number;
  progress?: TeacherDeckPlanProgress;
  failure?: TeacherDeckPlanFailure;
  transitions?: TeacherDeckPlanTransition[];
};

export type WorkspaceBootstrapPayload = {
  scenario: "teacher_courseware";
  workspaceMode: "teacher_courseware";
  task: TeacherCoursewareTask;
  contentPlan: ContentPlan;
  slidePagePlan: SlidePagePlan[];
  layoutPlan: LayoutPlan[];
  slides: CanvasProject["slides"];
  sourceDocuments: CanvasProject["sourceDocuments"];
  generationWarnings: string[];
  project: CanvasProject;
  templateId?: string;
  projectId: string;
  requestId: string;
  versionId: string;
  versionNumber: number;
  lifecycleStatus: string;
  deckPlan?: TeacherDeckPlan;
};

export type WorkspaceIdentity = Pick<
  WorkspaceBootstrapPayload,
  "projectId" | "requestId" | "versionId" | "versionNumber" | "lifecycleStatus"
> & {
  projectType: "teacher_courseware";
  /** Filled by GET /api/courseware-version after workspace hydration */
  engineeringStatus?: string;
  /** Filled by GET /api/courseware-version after workspace hydration */
  teacherReadiness?: string;
};

export const teacherWorkspaceBootstrapKey = "sandun.teacher-courseware.bootstrap.v1";
export const teacherWorkspaceIdentityKey = "sandun.teacher-courseware.identity.v1";
