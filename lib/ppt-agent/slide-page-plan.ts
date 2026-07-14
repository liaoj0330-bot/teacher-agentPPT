import type { ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";

export type RecommendedVisualForm =
  | "bullet_list"
  | "card_grid"
  | "comparison_table"
  | "process_flow"
  | "timeline"
  | "metric_dashboard"
  | "matrix"
  | "architecture_diagram"
  | "roadmap"
  | "map_route"
  | "risk_table"
  | "quote_highlight"
  | "case_card"
  | "summary_action"
  | "coordinate_graph"
  | "table_formula_graph_mapping"
  | "parameter_compare"
  | "worked_example_steps"
  | "practice_feedback"
  | "concept_relation";

export type PageContentBlock = {
  type:
    | "question"
    | "claim"
    | "evidence"
    | "data"
    | "case"
    | "steps"
    | "comparison"
    | "risk"
    | "recommendation"
    | "action";
  title: string;
  body: string;
  evidenceNeed?: string;
  priority: "must" | "should" | "optional";
};

export type InformationHierarchy = {
  primary: string;
  secondary: string[];
  tertiary: string[];
};

export type SlidePagePlan = {
  pagePlanId: string;
  planId: string;
  contentPlanSlideId?: string;
  pptType: ContentPlanPPTType;
  role: string;
  pageIndex: number;
  audienceQuestion: string;
  coreClaim: string;
  pagePurpose: string;
  mustProve: string;
  evidenceNeed: string[];
  contentBlocks: PageContentBlock[];
  informationHierarchy: InformationHierarchy;
  recommendedVisualForm: RecommendedVisualForm;
  layoutIntent: string;
  writingStyle: string;
  avoidPatterns: string[];
  qualityChecks: string[];
  generationWarnings: string[];
  studentAction?: string;
  masteryCheck?: string;
  childOutputRequired?: boolean;
  visualNeed?: string;
  contentLimit?: string;
};

export type SlidePagePlanSummary = Pick<
  SlidePagePlan,
  | "pagePlanId"
  | "pageIndex"
  | "role"
  | "audienceQuestion"
  | "coreClaim"
  | "mustProve"
  | "recommendedVisualForm"
  | "generationWarnings"
>;

export const recommendedVisualForms: RecommendedVisualForm[] = [
  "bullet_list",
  "card_grid",
  "comparison_table",
  "process_flow",
  "timeline",
  "metric_dashboard",
  "matrix",
  "architecture_diagram",
  "roadmap",
  "map_route",
  "risk_table",
  "quote_highlight",
  "case_card",
  "summary_action",
  "coordinate_graph",
  "table_formula_graph_mapping",
  "parameter_compare",
  "worked_example_steps",
  "practice_feedback",
  "concept_relation"
];
