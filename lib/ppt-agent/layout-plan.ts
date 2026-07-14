import type { ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import type { RecommendedVisualForm } from "@/lib/ppt-agent/slide-page-plan";

export type LayoutId =
  | "cover_clean"
  | "agenda_list"
  | "section_divider"
  | "bullet_insight"
  | "card_grid"
  | "comparison_table"
  | "process_flow"
  | "timeline"
  | "roadmap"
  | "metric_dashboard"
  | "matrix"
  | "architecture_diagram"
  | "risk_table"
  | "case_card"
  | "quote_highlight"
  | "summary_action"
  | "tm01_teacher_math_cover"
  | "tm02_learning_objectives"
  | "tm03_prior_knowledge_context"
  | "tm04_concept_definition"
  | "tm05_table_formula_graph"
  | "tm06_parameter_comparison"
  | "tm07_worked_example"
  | "tm08_interaction_practice"
  | "tm09_summary_assignment";

export type LayoutFamily =
  | "cover"
  | "agenda"
  | "section"
  | "insight"
  | "cards"
  | "table"
  | "flow"
  | "timeline"
  | "roadmap"
  | "dashboard"
  | "matrix"
  | "architecture"
  | "risk"
  | "case"
  | "quote"
  | "summary"
  | "teacher_cover"
  | "teacher_objectives"
  | "teacher_context"
  | "teacher_concept"
  | "teacher_mapping"
  | "teacher_compare"
  | "teacher_example"
  | "teacher_practice"
  | "teacher_summary";

export type InformationDensity = "low" | "medium" | "high";

export type LayoutPlan = {
  layoutPlanId: string;
  pagePlanId: string;
  planId: string;
  pptType: ContentPlanPPTType;
  role: string;
  pageIndex: number;
  recommendedVisualForm: RecommendedVisualForm;
  selectedLayout: LayoutId;
  layoutFamily: LayoutFamily;
  informationDensity: InformationDensity;
  contentSlots: string[];
  visualSlots: string[];
  hierarchyRules: string[];
  spacingRules: string[];
  typographyHints: string[];
  exportHints: string[];
  previewHints: string[];
  fallbackReason?: string;
  warnings: string[];
};

export type LayoutPlanSummary = Pick<
  LayoutPlan,
  | "layoutPlanId"
  | "pagePlanId"
  | "pageIndex"
  | "role"
  | "recommendedVisualForm"
  | "selectedLayout"
  | "layoutFamily"
  | "informationDensity"
  | "fallbackReason"
  | "warnings"
>;
