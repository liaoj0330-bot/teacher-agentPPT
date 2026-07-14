import type { ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";

export type BrainPptMaterialStatus = "sufficient" | "insufficient" | "partial" | "missing_required" | "unknown";
export type BrainPptCapabilityStatus = "available" | "partial" | "unavailable" | "need_materials" | "need_tool_build";
export type BrainPptHandoffStatus = "ready_for_ppt_agent" | "preflight_required";

export type BrainPptBrief = {
  schema_version: "BRAIN_PPT_CONTRACT_V1";
  run_id: string;
  created_at: string;
  source: string;
  raw_input: string;
  ppt_intent: {
    project_topic: string;
    ppt_type: string;
    target_audience: string;
    report_scenario: string;
    recommended_slide_count: string;
    style_direction: string;
  };
  material_check: {
    material_status: BrainPptMaterialStatus;
    available_materials: string[];
    missing_materials: string[];
    can_do_now: string[];
    cannot_do_now: string[];
    required_materials: string[];
    reason: string;
  };
  capability_check: {
    capability_status: BrainPptCapabilityStatus;
    can_execute_now: string[];
    cannot_execute_now: string[];
    required_tool: string[];
    required_agent: string[];
    required_materials: string[];
    fallback_paths: string[];
    risk_notes: string[];
  };
  project_match?: Record<string, unknown>;
  handoff_status: BrainPptHandoffStatus;
  allowed_actions: string[];
  forbidden_actions: string[];
  next_confirmation_questions: string[];
  result_writeback: {
    root: string;
    expected_files: string[];
  };
  api_status: {
    model_call_required_now: boolean;
    search_required_now: boolean;
    image2_required_now: boolean;
    formal_pptx_allowed_now: boolean;
  };
};

export type BrainConnectorInput = {
  prompt: string;
  planningMode: "quick" | "professional";
  userPreferences: {
    audience: string;
    scenario: string;
    styleDirection: string;
    slideCount: string;
    projectTopic: string;
    source: "brain-ppt-contract";
  };
  researchSources: unknown[];
  uploadedAssets: unknown[];
  disablePublicSearch: boolean;
  provider: "local";
  forceLocal: boolean;
  pptTypeHint: ContentPlanPPTType | "general";
};

export type BrainWorkspaceContextKind =
  | "project_archive"
  | "candidate_material"
  | "aesthetic_rule"
  | "visual_asset";

export type BrainWorkspaceContextItem = {
  kind: BrainWorkspaceContextKind;
  path: string;
  relative_path: string;
  name: string;
  extension: string;
  size_bytes: number;
  modified_at: string;
  match_reason: string;
  parsed_content: false;
};

export type BrainWorkspaceContextScope = {
  id: string;
  label: string;
  path: string;
  exists: boolean;
};

export type BrainWorkspaceContext = {
  schema_version: "BRAIN_PPT_WORKSPACE_CONTEXT_V1";
  generated_at: string;
  workspace_root: string;
  query_terms: string[];
  scopes: BrainWorkspaceContextScope[];
  matched_project_archives: BrainWorkspaceContextItem[];
  candidate_materials: BrainWorkspaceContextItem[];
  aesthetic_rules: BrainWorkspaceContextItem[];
  visual_assets: BrainWorkspaceContextItem[];
  missing_scopes: string[];
  safety: {
    metadata_only: true;
    parsed_file_contents: false;
    provider_key_touched: false;
    skipped_secret_like_files: true;
  };
};

export type BrainContextReport = {
  schema_version: "BRAIN_PPT_CONTEXT_REPORT_V1";
  run_id: string;
  generated_at: string;
  source_brief_path: string;
  writeback_root: string;
  handoff_status: BrainPptHandoffStatus;
  can_generate_formal_pptx: boolean;
  connector_input: BrainConnectorInput;
  workspace_context: BrainWorkspaceContext;
  material_summary: {
    status: BrainPptMaterialStatus;
    available_materials: string[];
    missing_materials: string[];
    required_materials: string[];
    reason: string;
  };
  quality_entrypoints: {
    evidence_to_slide: string;
    visual_intent: string;
    page_quality_rubric: string;
    repair_plan: string;
  };
  next_actions: string[];
  risk_notes: string[];
};

export type BrainApiStatus = {
  schema_version: "BRAIN_PPT_API_STATUS_V1";
  run_id: string;
  generated_at: string;
  model: {
    attempted: boolean;
    provider: "none" | "openai" | "local";
    fallback_used: boolean;
    failure_reason: string;
  };
  search: {
    attempted: boolean;
    provider: string;
    fallback_used: boolean;
    failure_reason: string;
  };
  image2: {
    attempted: boolean;
    provider: string;
    fallback_used: boolean;
    failure_reason: string;
  };
  file_parse: {
    attempted: boolean;
    parsed_count: number;
    failed_count: number;
    failure_reason: string;
  };
  pptx_export: {
    attempted: boolean;
    status: "not_requested" | "blocked_by_materials" | "ready_after_quality_gate";
    file_path: string;
    failure_reason: string;
  };
  safety: {
    provider_key_touched: false;
    fake_search_success: false;
    fake_image2_success: false;
    fake_file_parse_success: false;
    fake_export_success: false;
  };
};

export type BrainPptAgentResult = {
  schema_version: "BRAIN_PPT_AGENT_RESULT_V1";
  run_id: string;
  generated_at: string;
  status: "preflight_required" | "ready_for_generation";
  formal_pptx_generated: false;
  brain_context_report_path: string;
  api_status_path: string;
  preflight_checklist_path: string;
  low_evidence_pages: string[];
  unsupported_claims: string[];
  missing_materials: string[];
  next_suggestions: string[];
};

export type SandunPreflightResult = {
  run_id: string;
  status: "available" | "sandun_unavailable" | "brief_incomplete" | "need_materials" | "ready_for_generation";
  sandun_status: "available" | "unavailable";
  can_continue: boolean;
  missing_materials: string[];
  provider_status: "available" | "unconfigured" | "unavailable" | "unknown" | "not_attempted";
  search_status: "available" | "unconfigured" | "unavailable" | "unknown" | "not_attempted";
  image2_status: "available" | "unconfigured" | "unavailable" | "unknown" | "not_attempted";
  file_parse_status: "available" | "unavailable" | "unknown" | "not_attempted";
  export_allowed: boolean;
  risks: string[];
  next_actions: string[];
  created_at: string;
};
