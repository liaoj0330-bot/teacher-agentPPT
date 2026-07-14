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
