import type { SlideLayout } from "@/lib/canvas-data";

export type ContentPlanPPTType =
  | "project_report"
  | "product_intro"
  | "business_plan"
  | "financial_report"
  | "courseware"
  | "travel_plan"
  | "company_profile"
  | "proposal"
  | "research_report"
  | "activity_plan"
  | "policy_interpretation"
  | "general";

export type ContentScope = {
  include: string[];
  exclude: string[];
  avoid: string[];
};

export type ContentPlanSlide = {
  id: string;
  role: string;
  titleIntent: string;
  pagePurpose: string;
  mustProve: string;
  suggestedEvidence: string[];
  avoid: string[];
  priority: "required" | "recommended" | "optional";
  layoutHint?: SlideLayout;
  audienceQuestion?: string;
  studentAction?: string;
  masteryCheck?: string;
  childOutputRequired?: boolean;
  visualNeed?: string;
  contentLimit?: string;
  lessonEventId?: string;
};

export type LessonEventType = "opening" | "objective" | "activate" | "explain" | "model" | "inquire" | "practice" | "feedback" | "transfer" | "assess" | "closing";

export type LessonEvent = {
  id: string;
  type: LessonEventType;
  title: string;
  durationMinutes: number;
  teacherAction: string;
  studentAction: string;
  expectedResponse: string;
  evidenceOfLearning: string;
  fallbackAction: string;
  slideIds: string[];
};

export type LessonPlan = {
  totalMinutes: number;
  events: LessonEvent[];
};

export type LessonArchitecture =
  | "play_based_discovery"
  | "experiment_inquiry"
  | "close_reading"
  | "concept_building"
  | "representation_modeling"
  | "evidence_experiment"
  | "observation_systems"
  | "source_inquiry"
  | "spatial_reasoning"
  | "communicative_task_cycle"
  | "skill_practice"
  | "review_consolidation"
  | "general_lesson";

export type LessonBlueprint = {
  blueprintId: string;
  planId: string;
  status: "teacher_confirmation_required" | "teacher_confirmed";
  architecture: LessonArchitecture;
  architectureReason: string;
  lessonPromise: string;
  drivingQuestion: string;
  learnerAssumptions: string[];
  keyDifficulties: Array<{
    focus: string;
    reason: string;
    breakthrough: string;
  }>;
  objectives: Array<{
    id: string;
    statement: string;
    evidence: string;
    successCriteria: string;
  }>;
  lessonPlan: LessonPlan;
  presentationPlan: {
    strategyVersion?: "lesson_pacing_v1";
    recommendedPageCount: number;
    minimumPageCount?: number;
    maximumPageCount?: number;
    drivers?: string[];
    rationale: string;
    screenPrinciples: string[];
    teacherOnlyPrinciples: string[];
  };
  teacherDecisions: Array<{
    id: string;
    question: string;
    assumption: string;
    requiredBeforeGeneration: boolean;
  }>;
};

export type TeacherDeliveryPack = {
  packId: string;
  planId: string;
  readiness: "teacher_review_required" | "ready_for_teacher_review";
  teacherNotes: Array<
    Pick<LessonEvent, "title" | "durationMinutes" | "teacherAction" | "studentAction" | "expectedResponse" | "fallbackAction" | "slideIds"> & {
      pageId: string;
      lessonEventId: string;
      prompt: string;
    }
  >;
  answerKey: Array<{ eventId: string; slideIds: string[]; answer: string; scoringCriteria: string; sourceStatus: "derived_from_plan" | "teacher_material_required" }>;
  boardPlan: { title: string; columns: Array<{ heading: string; items: string[] }> };
  homework: Array<{ level: "基础" | "提高" | "迁移"; task: string; successCriteria: string }>;
};

export type ContentPlan = {
  planId: string;
  pptType: ContentPlanPPTType;
  userIntent: string;
  audience: string;
  decisionGoal: string;
  coreMessage: string;
  narrativeStrategy: string;
  contentScope: ContentScope;
  evidenceNeeds: string[];
  keyQuestions: string[];
  slidePlan: ContentPlanSlide[];
  qualityChecklist: string[];
  styleDirection: string;
  layoutDirection: string;
  riskWarnings: string[];
  generationWarnings: string[];
  playbookId: string;
  createdAt: string;
  teachingObjectives?: string[];
  teachingChain?: string[];
  lessonBlueprint?: LessonBlueprint;
  lessonPlan?: LessonPlan;
  deliveryPack?: TeacherDeliveryPack;
  teacherContext?: {
    subject: string;
    topic: string;
    schoolStage?: string;
    grade?: string;
    duration?: string;
    visualMode?: string;
    theme?: string;
    sourceMaterial?: string;
    teachingRequirements?: string;
    textbook?: string;
    chapter?: string;
    generationMode?: "chapter_prep" | "lesson_plan" | "optimize_existing";
  };
};

export type ContentPlanSummary = Pick<
  ContentPlan,
  | "planId"
  | "pptType"
  | "userIntent"
  | "audience"
  | "decisionGoal"
  | "coreMessage"
  | "narrativeStrategy"
  | "qualityChecklist"
  | "riskWarnings"
>;
