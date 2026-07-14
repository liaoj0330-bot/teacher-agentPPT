import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, type Dirent } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import pptxgen from "pptxgenjs";
import type { ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import { cleanText } from "@/lib/text-sanitize";
import {
  buildCritiqueReport,
  buildDeckSpec,
  buildExportGate,
  buildQualityRubric,
  buildRepairPlan,
  buildReviewedDraftResult,
  critiqueReportMarkdown,
  deckSpecMarkdown,
  exportGateMarkdown,
  qualityRubricMarkdown,
  repairPlanMarkdown
} from "@/lib/brain-ppt/quality-contracts";
import type {
  BrainApiStatus,
  BrainConnectorInput,
  BrainContextReport,
  BrainWorkspaceContext,
  BrainWorkspaceContextItem,
  BrainWorkspaceContextKind,
  BrainWorkspaceContextScope,
  BrainPptAgentResult,
  BrainPptBrief,
  SandunPreflightResult
} from "@/lib/brain-ppt/contract";

export const DEFAULT_BRAIN_PPT_ROOT = process.env.BRAIN_PPT_ROOT || process.cwd();

const SECRET_LIKE_FILE = /(^|[\\/])(\.env|.*(?:key|token|secret|credential|provider|auth).*)$/i;
const VISUAL_ASSET_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]);
const DOCUMENT_EXTENSIONS = new Set(["md", "txt", "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "json", "jsonl"]);
const MAX_CONTEXT_ITEMS_PER_KIND = 12;
const MAX_CONTEXT_DEPTH = 4;
const MAX_CONTEXT_VISITED = 260;

type YcsfSandunExecutorPackage = {
  schema_version?: string;
  package_id?: string;
  created_at?: string;
  status?: string;
  export_allowed?: boolean;
  matter?: {
    matter_id?: string;
    title?: string;
    task_type?: string;
    project?: string;
    topic?: string;
    audience?: string;
    purpose?: string;
    page_count_target?: string;
    output_level?: string;
    current_stage?: string;
  };
  brain_context?: {
    user_request?: string;
    known_constraints?: string[];
    available_materials?: string[];
    project_facts?: string[];
    verified_materials?: string[];
    evidence_pack?: string[];
    unverified_draft_notes?: string[];
    style_rules?: string[];
    quality_rules?: string[];
    forbidden_claims?: string[];
    missing_materials?: string[];
  };
  executor?: {
    name?: string;
    mode?: string;
    allowed_actions?: string[];
    blocked_actions?: string[];
  };
  writeback?: {
    expected_outputs?: string[];
    writeback_path?: string;
    status_update_target?: string;
  };
};

function nowIso() {
  return new Date().toISOString();
}

function isWithin(rootPath: string, targetPath: string) {
  const root = resolve(/*turbopackIgnore: true*/ rootPath).toLowerCase();
  const target = resolve(/*turbopackIgnore: true*/ targetPath).toLowerCase();
  return target === root || target.startsWith(`${root}\\`) || target.startsWith(`${root}/`);
}

function safeJoin(rootPath: string, ...parts: string[]) {
  const root = resolve(/*turbopackIgnore: true*/ rootPath);
  const target = resolve(/*turbopackIgnore: true*/ root, ...parts);
  if (!isWithin(root, target)) {
    throw new Error("Path is outside Brain PPT root");
  }
  return target;
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(path: string, value: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function normalizePlanType(value: string): ContentPlanPPTType | "general" {
  const clean = cleanText(value).toLowerCase();
  if (clean === "project_report") return "project_report";
  if (clean.includes("project")) return "project_report";
  if (clean.includes("product")) return "product_intro";
  if (clean.includes("proposal")) return "proposal";
  if (clean.includes("policy")) return "policy_interpretation";
  if (clean.includes("course")) return "courseware";
  if (clean.includes("financial")) return "financial_report";
  return "general";
}

function inferWorkspaceRoot(rootPath: string) {
  const resolved = resolve(rootPath);
  if (/\\_YCSF_Entrance\\20_agenthub_ycsf_console$/i.test(resolved)) {
    return resolve(resolved, "..", "..");
  }
  return process.env.BRAIN_WORKSPACE_ROOT || resolved;
}

function safeFileExtension(fileName: string) {
  const parts = fileName.split(".");
  return parts.length > 1 ? String(parts.pop() || "").toLowerCase() : "";
}

function isSupportedContextFile(fileName: string, kind: BrainWorkspaceContextKind) {
  const extension = safeFileExtension(fileName);
  if (kind === "visual_asset") return VISUAL_ASSET_EXTENSIONS.has(extension);
  return DOCUMENT_EXTENSIONS.has(extension);
}

function isSecretLikePath(path: string) {
  return SECRET_LIKE_FILE.test(path);
}

function compactTerms(values: string[]) {
  return Array.from(new Set(values.map(item => cleanText(item).toLowerCase()).filter(item => item.length >= 2))).slice(0, 24);
}

function extractQueryTerms(brief: BrainPptBrief) {
  const source = [
    brief.raw_input,
    brief.ppt_intent.project_topic,
    brief.ppt_intent.target_audience,
    brief.ppt_intent.report_scenario,
    brief.ppt_intent.style_direction
  ].join(" ");
  const explicit = ["ai_workspace", "ai", "aigc", "高校", "产教", "融合", "平台", "项目", "档案", "汇报", "ppt", "验收", "政策"]
    .filter(term => source.toLowerCase().includes(term.toLowerCase()));
  const wordLike = source.match(/[A-Za-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/g) || [];
  return compactTerms([...explicit, ...wordLike]);
}

function matchReason(path: string, queryTerms: string[]) {
  const lower = path.toLowerCase();
  const matched = queryTerms.filter(term => lower.includes(term.toLowerCase())).slice(0, 6);
  return matched.length ? `matched_terms:${matched.join(",")}` : "scope_candidate";
}

function itemFromPath(input: {
  kind: BrainWorkspaceContextKind;
  path: string;
  basePath: string;
  queryTerms: string[];
}): BrainWorkspaceContextItem | null {
  if (isSecretLikePath(input.path)) return null;
  const name = input.path.split(/[\\/]/).pop() || input.path;
  if (!isSupportedContextFile(name, input.kind)) return null;
  const stat = statSync(input.path);
  if (!stat.isFile()) return null;
  return {
    kind: input.kind,
    path: input.path,
    relative_path: relative(input.basePath, input.path) || name,
    name,
    extension: safeFileExtension(name),
    size_bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
    match_reason: matchReason(input.path, input.queryTerms),
    parsed_content: false
  };
}

function scanScope(input: {
  kind: BrainWorkspaceContextKind;
  scopePath: string;
  queryTerms: string[];
  limit?: number;
}): BrainWorkspaceContextItem[] {
  // Runtime workspace discovery is intentionally dynamic: Brain PPT handoffs point
  // at user-owned folders outside this Next app, so the exact paths cannot be
  // statically imported without breaking the connector contract.
  if (!existsSync(input.scopePath)) return [];
  const items: BrainWorkspaceContextItem[] = [];
  let visited = 0;
  const walk = (dir: string, depth: number) => {
    if (items.length >= (input.limit || MAX_CONTEXT_ITEMS_PER_KIND)) return;
    if (depth > MAX_CONTEXT_DEPTH || visited > MAX_CONTEXT_VISITED) return;
    visited += 1;
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (items.length >= (input.limit || MAX_CONTEXT_ITEMS_PER_KIND)) return;
      const fullPath = resolve(/*turbopackIgnore: true*/ dir, entry.name);
      if (isSecretLikePath(fullPath)) continue;
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
        continue;
      }
      const lower = fullPath.toLowerCase();
      const matched = input.queryTerms.length === 0 || input.queryTerms.some(term => lower.includes(term.toLowerCase()));
      if (!matched) continue;
      const item = itemFromPath({ kind: input.kind, path: fullPath, basePath: input.scopePath, queryTerms: input.queryTerms });
      if (item) items.push(item);
    }
  };
  walk(input.scopePath, 0);
  return items;
}

function sourceForConnector(item: BrainWorkspaceContextItem) {
  return {
    kind: item.kind,
    name: item.name,
    path: item.path,
    relative_path: item.relative_path,
    extension: item.extension,
    parsed_content: item.parsed_content,
    match_reason: item.match_reason
  };
}

function buildWorkspaceContext(rootPath: string, brief: BrainPptBrief): BrainWorkspaceContext {
  const workspaceRoot = inferWorkspaceRoot(rootPath);
  const queryTerms = extractQueryTerms(brief);
  const scopes: Array<BrainWorkspaceContextScope & { kind: BrainWorkspaceContextKind }> = [
    {
      id: "project_archives",
      label: "AI_Workspace project archives",
      path: resolve(workspaceRoot, "01_项目档案"),
      exists: existsSync(resolve(workspaceRoot, "01_项目档案")),
      kind: "project_archive"
    },
    {
      id: "candidate_pool",
      label: "YCSF candidate pool",
      path: safeJoin(rootPath, "candidate_pool"),
      exists: existsSync(safeJoin(rootPath, "candidate_pool")),
      kind: "candidate_material"
    },
    {
      id: "external_references",
      label: "YCSF external references",
      path: safeJoin(rootPath, "external_references"),
      exists: existsSync(safeJoin(rootPath, "external_references")),
      kind: "candidate_material"
    },
    {
      id: "aesthetic_rule_candidates",
      label: "YCSF aesthetic rule candidates",
      path: safeJoin(rootPath, "aesthetic_rule_candidates"),
      exists: existsSync(safeJoin(rootPath, "aesthetic_rule_candidates")),
      kind: "aesthetic_rule"
    },
    {
      id: "workspace_ai_rules",
      label: "AI_Workspace AI rules",
      path: resolve(workspaceRoot, "99_AI规则"),
      exists: existsSync(resolve(workspaceRoot, "99_AI规则")),
      kind: "aesthetic_rule"
    },
    {
      id: "workspace_visual_assets",
      label: "AI_Workspace visual references",
      path: resolve(workspaceRoot, "07_素材参考"),
      exists: existsSync(resolve(workspaceRoot, "07_素材参考")),
      kind: "visual_asset"
    },
    {
      id: "workspace_screenshots",
      label: "AI_Workspace screenshot archive",
      path: resolve(workspaceRoot, "08_截图归档"),
      exists: existsSync(resolve(workspaceRoot, "08_截图归档")),
      kind: "visual_asset"
    }
  ];

  const matchedProjectArchives = scopes
    .filter(scope => scope.kind === "project_archive")
    .flatMap(scope => scanScope({ kind: scope.kind, scopePath: scope.path, queryTerms }));
  const candidateMaterials = scopes
    .filter(scope => scope.kind === "candidate_material")
    .flatMap(scope => scanScope({ kind: scope.kind, scopePath: scope.path, queryTerms }));
  const aestheticRules = scopes
    .filter(scope => scope.kind === "aesthetic_rule")
    .flatMap(scope => scanScope({ kind: scope.kind, scopePath: scope.path, queryTerms }));
  const visualAssets = scopes
    .filter(scope => scope.kind === "visual_asset")
    .flatMap(scope => scanScope({ kind: scope.kind, scopePath: scope.path, queryTerms }));

  return {
    schema_version: "BRAIN_PPT_WORKSPACE_CONTEXT_V1",
    generated_at: nowIso(),
    workspace_root: workspaceRoot,
    query_terms: queryTerms,
    scopes: scopes.map(({ kind: _kind, ...scope }) => scope),
    matched_project_archives: matchedProjectArchives.slice(0, MAX_CONTEXT_ITEMS_PER_KIND),
    candidate_materials: candidateMaterials.slice(0, MAX_CONTEXT_ITEMS_PER_KIND),
    aesthetic_rules: aestheticRules.slice(0, MAX_CONTEXT_ITEMS_PER_KIND),
    visual_assets: visualAssets.slice(0, MAX_CONTEXT_ITEMS_PER_KIND),
    missing_scopes: scopes.filter(scope => !scope.exists).map(scope => scope.path),
    safety: {
      metadata_only: true,
      parsed_file_contents: false,
      provider_key_touched: false,
      skipped_secret_like_files: true
    }
  };
}

function validateBrief(value: unknown, briefPath: string): BrainPptBrief {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ppt_brief JSON: ${briefPath}`);
  }
  const brief = value as BrainPptBrief;
  if (brief.schema_version !== "BRAIN_PPT_CONTRACT_V1") {
    throw new Error(`Unsupported ppt_brief schema_version: ${String((value as Record<string, unknown>).schema_version || "")}`);
  }
  if (!brief.run_id || !brief.raw_input || !brief.ppt_intent || !brief.material_check || !brief.capability_check) {
    throw new Error("ppt_brief missing required fields");
  }
  return brief;
}

function readBrief(briefPath: string): BrainPptBrief {
  if (!existsSync(briefPath)) throw new Error(`ppt_brief not found: ${briefPath}`);
  const data = JSON.parse(readFileSync(briefPath, "utf8"));
  return validateBrief(data, briefPath);
}

function buildConnectorInput(brief: BrainPptBrief, workspaceContext: BrainWorkspaceContext): BrainConnectorInput {
  const formalAllowed = brief.material_check.material_status === "sufficient" && brief.api_status.formal_pptx_allowed_now;
  const style = cleanText(brief.ppt_intent.style_direction, "专业、清晰、可核验");
  const prompt = [
    brief.raw_input,
    "",
    `项目主题：${brief.ppt_intent.project_topic}`,
    `目标受众：${brief.ppt_intent.target_audience}`,
    `汇报场景：${brief.ppt_intent.report_scenario}`,
    `风格要求：${style}`,
    `页数建议：${brief.ppt_intent.recommended_slide_count}`
  ].join("\n");

  return {
    prompt,
    planningMode: "professional",
    userPreferences: {
      audience: cleanText(brief.ppt_intent.target_audience, "待确认"),
      scenario: cleanText(brief.ppt_intent.report_scenario, "待确认"),
      styleDirection: style,
      slideCount: cleanText(brief.ppt_intent.recommended_slide_count, "8-12 页"),
      projectTopic: cleanText(brief.ppt_intent.project_topic, "待确认项目主题"),
      source: "brain-ppt-contract"
    },
    researchSources: [
      ...workspaceContext.matched_project_archives.map(sourceForConnector),
      ...workspaceContext.candidate_materials.map(sourceForConnector),
      ...workspaceContext.aesthetic_rules.map(sourceForConnector)
    ],
    uploadedAssets: workspaceContext.visual_assets.map(sourceForConnector),
    disablePublicSearch: !formalAllowed,
    provider: "local",
    forceLocal: true,
    pptTypeHint: normalizePlanType(brief.ppt_intent.ppt_type)
  };
}

function nextActions(brief: BrainPptBrief): string[] {
  const missing = brief.material_check.missing_materials || [];
  if (brief.handoff_status === "preflight_required" || brief.material_check.material_status !== "sufficient") {
    return [
      "补齐项目档案、政策依据、验收标准或真实案例材料后再进入正式 PPTX 生成。",
      "先由 Sandun 生成 brain_context_report 与 preflight_checklist，供言出法随回问用户。",
      ...brief.next_confirmation_questions
    ];
  }
  return [
    "可以进入 Sandun PPT Agent 生成前置流程，但仍需经过证据映射、质量评分和导出闸门。",
    missing.length ? `仍需关注缺失资料：${missing.join("、")}` : "进入生成前先确认是否允许真实搜索和图片生成。"
  ];
}

function buildContextReport(input: {
  brief: BrainPptBrief;
  briefPath: string;
  writebackRoot: string;
  connectorInput: BrainConnectorInput;
  workspaceContext: BrainWorkspaceContext;
}): BrainContextReport {
  const { brief, briefPath, writebackRoot, connectorInput, workspaceContext } = input;
  const formalAllowed = brief.material_check.material_status === "sufficient" && brief.api_status.formal_pptx_allowed_now;
  return {
    schema_version: "BRAIN_PPT_CONTEXT_REPORT_V1",
    run_id: brief.run_id,
    generated_at: nowIso(),
    source_brief_path: briefPath,
    writeback_root: writebackRoot,
    handoff_status: formalAllowed ? "ready_for_ppt_agent" : "preflight_required",
    can_generate_formal_pptx: formalAllowed,
    connector_input: connectorInput,
    workspace_context: workspaceContext,
    material_summary: {
      status: brief.material_check.material_status,
      available_materials: brief.material_check.available_materials || [],
      missing_materials: brief.material_check.missing_materials || [],
      required_materials: brief.material_check.required_materials || [],
      reason: cleanText(brief.material_check.reason)
    },
    quality_entrypoints: {
      evidence_to_slide: "Use existing SlideEvidenceMap after formal generation is allowed.",
      visual_intent: "Use SlidePagePlan.recommendedVisualForm and layoutIntent.",
      page_quality_rubric: "Score clarity, evidence, logic, professionalism, visual hierarchy, empty claims and unsupported conclusions.",
      repair_plan: "Separate auto_fixable items from requires_user_confirmation items."
    },
    next_actions: nextActions(brief),
    risk_notes: [
      ...brief.capability_check.risk_notes,
      "Loop is in trusted preflight mode; no fake model/search/image/export success is allowed.",
      "Workspace context is metadata-only and does not mean source files were parsed."
    ]
  };
}

function buildApiStatus(brief: BrainPptBrief): BrainApiStatus {
  const blocked = brief.material_check.material_status !== "sufficient";
  return {
    schema_version: "BRAIN_PPT_API_STATUS_V1",
    run_id: brief.run_id,
    generated_at: nowIso(),
    model: {
      attempted: false,
      provider: "none",
      fallback_used: blocked,
      failure_reason: blocked ? "Skipped because materials are not sufficient for formal generation." : "Not attempted in trusted-link smoke mode."
    },
    search: {
      attempted: false,
      provider: "none",
      fallback_used: false,
      failure_reason: blocked ? "Skipped because brief is in preflight_required mode." : "Not attempted by BrainConnector preflight."
    },
    image2: {
      attempted: false,
      provider: "none",
      fallback_used: false,
      failure_reason: "Not attempted by trusted-link preflight."
    },
    file_parse: {
      attempted: false,
      parsed_count: 0,
      failed_count: 0,
      failure_reason: "No uploaded file was parsed by BrainConnector in this run."
    },
    pptx_export: {
      attempted: false,
      status: blocked ? "blocked_by_materials" : "ready_after_quality_gate",
      file_path: "",
      failure_reason: blocked ? "Formal PPTX export blocked by material_check." : "Export not requested in trusted-link smoke mode."
    },
    safety: {
      provider_key_touched: false,
      fake_search_success: false,
      fake_image2_success: false,
      fake_file_parse_success: false,
      fake_export_success: false
    }
  };
}

function checklistMarkdown(brief: BrainPptBrief, report: BrainContextReport): string {
  const missing = brief.material_check.missing_materials.length ? brief.material_check.missing_materials : ["待确认资料"];
  return [
    "# PPT 前置确认清单",
    "",
    `- run_id: ${brief.run_id}`,
    `- handoff_status: ${report.handoff_status}`,
    `- material_status: ${brief.material_check.material_status}`,
    `- formal_pptx_allowed: ${report.can_generate_formal_pptx ? "yes" : "no"}`,
    "",
    "## 当前不能直接生成正式 PPTX 的原因",
    "",
    brief.material_check.reason || "资料尚未达到正式生成条件。",
    "",
    "## 需要补充的资料",
    "",
    ...missing.map(item => `- ${item}`),
    "",
    "## 建议向用户确认",
    "",
    ...brief.next_confirmation_questions.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## 下一步",
    "",
    ...report.next_actions.map(item => `- ${item}`)
  ].join("\n");
}

function safeList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : [];
}

function topLevelMissingMaterials(brief: BrainPptBrief): string[] {
  const topLevel = safeList((brief as unknown as Record<string, unknown>).missing_materials);
  return topLevel.length ? topLevel : brief.material_check.missing_materials || [];
}

function buildSandunPreflightResult(
  brief: BrainPptBrief,
  report: BrainContextReport,
  apiStatus: BrainApiStatus
): SandunPreflightResult {
  const missing = topLevelMissingMaterials(brief);
  const briefStatus = String((brief as unknown as Record<string, unknown>).brief_status || "");
  const incomplete = briefStatus === "incomplete" || missing.length > 0 || brief.material_check.material_status !== "sufficient";
  const status = incomplete ? "brief_incomplete" : report.can_generate_formal_pptx ? "ready_for_generation" : "need_materials";
  return {
    run_id: brief.run_id,
    status,
    sandun_status: "available",
    can_continue: status === "ready_for_generation",
    missing_materials: missing,
    provider_status: apiStatus.model.attempted ? apiStatus.model.provider === "none" ? "unconfigured" : "available" : "not_attempted",
    search_status: apiStatus.search.attempted ? apiStatus.search.provider === "none" ? "unconfigured" : "available" : "not_attempted",
    image2_status: apiStatus.image2.attempted ? apiStatus.image2.provider === "none" ? "unconfigured" : "available" : "not_attempted",
    file_parse_status: apiStatus.file_parse.attempted ? apiStatus.file_parse.failed_count > 0 ? "unavailable" : "available" : "not_attempted",
    export_allowed: false,
    risks: [
      ...report.risk_notes,
      apiStatus.pptx_export.status === "blocked_by_materials" ? "正式 PPTX 导出被资料检查阻止。" : "本阶段只做 preflight，不直接导出正式 PPTX。",
      "未伪造 provider/search/image2/export 成功。"
    ],
    next_actions: report.next_actions,
    created_at: nowIso()
  };
}

function nextActionSuggestionsMarkdown(input: {
  brief: BrainPptBrief;
  preflight: SandunPreflightResult;
  apiStatus: BrainApiStatus;
}): string {
  const { brief, preflight, apiStatus } = input;
  return [
    "# PPT Preflight 下一步建议",
    "",
    `- run_id: ${brief.run_id}`,
    `- brief_status: ${String((brief as unknown as Record<string, unknown>).brief_status || brief.handoff_status)}`,
    `- sandun_status: ${preflight.sandun_status}`,
    `- provider_status: ${preflight.provider_status}`,
    `- search_status: ${preflight.search_status}`,
    `- image2_status: ${preflight.image2_status}`,
    `- file_parse_status: ${preflight.file_parse_status}`,
    `- export_allowed: ${preflight.export_allowed}`,
    "",
    "## 缺少资料",
    "",
    ...(preflight.missing_materials.length ? preflight.missing_materials.map(item => `- ${item}`) : ["- 暂无缺失项，但仍需人工确认是否允许进入下一阶段。"]),
    "",
    "## 状态说明",
    "",
    `- provider: ${apiStatus.model.failure_reason}`,
    `- search: ${apiStatus.search.failure_reason}`,
    `- image2: ${apiStatus.image2.failure_reason}`,
    `- export: ${apiStatus.pptx_export.failure_reason}`,
    "",
    "## 下一步",
    "",
    ...preflight.next_actions.map(item => `- ${item}`),
    "",
    "## 边界",
    "",
    "- 当前不生成正式 PPTX。",
    "- 当前不伪造搜索、image2 或导出成功。"
  ].join("\n");
}

function contextReportMarkdown(report: BrainContextReport): string {
  return [
    "# Brain Context Report",
    "",
    `- run_id: ${report.run_id}`,
    `- generated_at: ${report.generated_at}`,
    `- handoff_status: ${report.handoff_status}`,
    `- can_generate_formal_pptx: ${report.can_generate_formal_pptx}`,
    "",
    "## Connector Input",
    "",
    `- planningMode: ${report.connector_input.planningMode}`,
    `- pptTypeHint: ${report.connector_input.pptTypeHint}`,
    `- audience: ${report.connector_input.userPreferences.audience}`,
    `- styleDirection: ${report.connector_input.userPreferences.styleDirection}`,
    "",
    "## Material Summary",
    "",
    `- status: ${report.material_summary.status}`,
    `- available: ${report.material_summary.available_materials.join(", ") || "none"}`,
    `- missing: ${report.material_summary.missing_materials.join(", ") || "none"}`,
    "",
    "## Workspace Context",
    "",
    `- metadata_only: ${report.workspace_context.safety.metadata_only}`,
    `- project_archives: ${report.workspace_context.matched_project_archives.length}`,
    `- candidate_materials: ${report.workspace_context.candidate_materials.length}`,
    `- aesthetic_rules: ${report.workspace_context.aesthetic_rules.length}`,
    `- visual_assets: ${report.workspace_context.visual_assets.length}`,
    "",
    "## Next Actions",
    "",
    ...report.next_actions.map(item => `- ${item}`)
  ].join("\n");
}

function readExecutorPackage(executorPackagePath: string, rootPath: string): YcsfSandunExecutorPackage {
  const packagePath = resolve(executorPackagePath);
  if (!isWithin(rootPath, packagePath)) {
    throw new Error("executor_package path must stay inside Brain PPT root");
  }
  if (!existsSync(packagePath)) throw new Error(`executor_package not found: ${packagePath}`);
  const value = JSON.parse(readFileSync(packagePath, "utf8").replace(/^\uFEFF/, ""));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid executor_package JSON: ${packagePath}`);
  }
  return value as YcsfSandunExecutorPackage;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : [];
}

function resolvePackageWritebackRoot(input: {
  rootPath: string;
  executorPackage: YcsfSandunExecutorPackage;
  writebackId?: string;
}): string {
  const packagePath = input.executorPackage.writeback?.writeback_path;
  if (packagePath) {
    const resolved = resolve(packagePath);
    if (!isWithin(input.rootPath, resolved)) {
      throw new Error("executor_package.writeback.writeback_path must stay inside Brain PPT root");
    }
    return resolved;
  }
  return safeJoin(input.rootPath, "executor_runs", "sandun", input.writebackId || input.executorPackage.package_id || `sandun_handoff_${Date.now()}`);
}

function buildPptAgentInputFromPackage(pkg: YcsfSandunExecutorPackage) {
  const matter = pkg.matter || {};
  const brain = pkg.brain_context || {};
  return {
    schema_version: "SANDUN_PPT_AGENT_INPUT_V1",
    generated_at: nowIso(),
    source: "AgentHub/YCSF executor_package",
    package_id: pkg.package_id || "",
    matter,
    project_facts: stringList(brain.project_facts),
    verified_materials: stringList(brain.verified_materials),
    evidence_pack: stringList(brain.evidence_pack),
    style_rules: stringList(brain.style_rules),
    quality_rules: stringList(brain.quality_rules),
    forbidden_claims: stringList(brain.forbidden_claims),
    missing_materials: stringList(brain.missing_materials),
    mode: pkg.executor?.mode || "preflight_first",
    blocked_actions: [
      ...stringList(pkg.executor?.blocked_actions),
      "export_formal_pptx"
    ],
    export_allowed: false
  };
}

function buildPptBriefFromPackage(pkg: YcsfSandunExecutorPackage, pptAgentInput: ReturnType<typeof buildPptAgentInputFromPackage>) {
  const matter = pkg.matter || {};
  const missing = pptAgentInput.missing_materials;
  const verified = pptAgentInput.verified_materials;
  return {
    schema_version: "SANDUN_PPT_BRIEF_V1",
    generated_at: nowIso(),
    package_id: pkg.package_id || "",
    matter_id: matter.matter_id || pkg.package_id || "",
    title: matter.title || "未命名 PPT 事项",
    project: matter.project || "未确认项目",
    task_type: matter.task_type || "PPT preflight",
    stage: matter.current_stage || "preflight_first",
    brief_status: missing.length ? "incomplete" : "preflight_ready",
    available_materials: verified,
    missing_materials: missing,
    audience: "待用户确认",
    purpose: "待用户确认",
    slide_count: "待用户确认",
    style_direction: pptAgentInput.style_rules.join(" / ") || "专业、清晰、可验证",
    export_allowed: false
  };
}

function pptBriefMarkdown(brief: ReturnType<typeof buildPptBriefFromPackage>): string {
  return [
    "# Sandun PPT Brief",
    "",
    `- title: ${brief.title}`,
    `- project: ${brief.project}`,
    `- task_type: ${brief.task_type}`,
    `- brief_status: ${brief.brief_status}`,
    `- export_allowed: ${String(brief.export_allowed)}`,
    "",
    "## Missing Materials",
    "",
    ...(brief.missing_materials.length ? brief.missing_materials.map(item => `- ${item}`) : ["- none"]),
    "",
    "## Style",
    "",
    brief.style_direction
  ].join("\n");
}

function buildPagePlanDraft(brief: ReturnType<typeof buildPptBriefFromPackage>, pptAgentInput: ReturnType<typeof buildPptAgentInputFromPackage>) {
  const evidenceReady = pptAgentInput.evidence_pack.length > 0 && brief.missing_materials.length === 0;
  const pages = [
    {
      page: 1,
      title: "封面 / 项目一句话",
      goal: "明确项目对象、汇报场景和表达基调。",
      evidence_status: evidenceReady ? "ready" : "needs_evidence",
      notes: "不写无法验证的项目成果。"
    },
    {
      page: 2,
      title: "背景与问题",
      goal: "说明为什么需要这个项目。",
      evidence_status: "needs_evidence",
      notes: "需要真实资料或用户补充。"
    },
    {
      page: 3,
      title: "方案结构",
      goal: "用结构化页面呈现项目组成。",
      evidence_status: evidenceReady ? "ready" : "needs_evidence",
      notes: "先做草案，不进入正式设计。"
    },
    {
      page: 4,
      title: "下一步计划",
      goal: "列出补资料、确认和正式生成的前置条件。",
      evidence_status: "ready",
      notes: "正式导出仍被阻断。"
    }
  ];
  return {
    schema_version: "SANDUN_PAGE_PLAN_DRAFT_V1",
    generated_at: nowIso(),
    package_id: pptAgentInput.package_id,
    status: "draft",
    export_allowed: false,
    pages
  };
}

function pagePlanMarkdown(plan: ReturnType<typeof buildPagePlanDraft>): string {
  return [
    "# Page Plan Draft",
    "",
    `- status: ${plan.status}`,
    `- export_allowed: ${String(plan.export_allowed)}`,
    "",
    ...plan.pages.flatMap(page => [
      `## Page ${page.page} | ${page.title}`,
      "",
      `- goal: ${page.goal}`,
      `- evidence_status: ${page.evidence_status}`,
      `- notes: ${page.notes}`,
      ""
    ])
  ].join("\n");
}

function buildPreflightResult(input: {
  pkg: YcsfSandunExecutorPackage;
  brief: ReturnType<typeof buildPptBriefFromPackage>;
  pagePlan: ReturnType<typeof buildPagePlanDraft>;
}) {
  const missing = input.brief.missing_materials;
  return {
    schema_version: "SANDUN_PREFLIGHT_RESULT_V1",
    generated_at: nowIso(),
    package_id: input.pkg.package_id || "",
    status: missing.length ? "need_materials" : "page_plan_ready_for_review",
    sandun_status: "available",
    page_plan_generated: true,
    missing_materials: missing,
    export_allowed: false,
    next_actions: missing.length ? ["补充缺失资料", "人工审阅页面草案"] : ["人工审阅页面草案", "确认质量规则后再评估导出门禁"],
    risks: [
      "本轮未生成正式 PPTX。",
      "页面草案不等于正式交付。",
      "未验证资料不能写成正式事实。"
    ]
  };
}

function missingMaterialsMarkdown(missing: string[]): string {
  return [
    "# Missing Materials",
    "",
    ...(missing.length ? missing.map(item => `- ${item}`) : ["- none"]),
    "",
    "已登记或生成预检产物不代表资料已经被完整解析。"
  ].join("\n");
}

function buildQualityCheck(preflight: ReturnType<typeof buildPreflightResult>, pagePlan: ReturnType<typeof buildPagePlanDraft>) {
  const missing = preflight.missing_materials.length;
  const score = missing ? 52 : 72;
  return {
    schema_version: "SANDUN_QUALITY_CHECK_V1",
    generated_at: nowIso(),
    package_id: preflight.package_id,
    score,
    pass: false,
    export_allowed: false,
    dimensions: {
      evidence_mapping: missing ? "needs_materials" : "partial",
      page_logic: pagePlan.pages.length > 0 ? "draft_ready" : "missing",
      style_alignment: "pending_manual_review",
      forbidden_claims: "blocked"
    },
    blockers: [
      ...(missing ? ["缺少资料，不能正式导出。"] : []),
      "正式 PPTX 导出门禁未打开。"
    ]
  };
}

function repairSuggestionsMarkdown(input: {
  preflight: ReturnType<typeof buildPreflightResult>;
  quality: ReturnType<typeof buildQualityCheck>;
}): string {
  return [
    "# Repair Suggestions",
    "",
    `- quality_score: ${input.quality.score}`,
    `- export_allowed: ${String(input.quality.export_allowed)}`,
    "",
    "## Suggestions",
    "",
    ...(input.preflight.missing_materials.length ? input.preflight.missing_materials.map(item => `- 补充：${item}`) : ["- 人工审阅页面草案。"]),
    "- 检查每一页是否有真实证据来源。",
    "- 确认汇报对象、用途、页数和风格后再进入正式生成。"
  ].join("\n");
}

function buildExportStatus(input: {
  preflight: ReturnType<typeof buildPreflightResult>;
  quality: ReturnType<typeof buildQualityCheck>;
}) {
  return {
    schema_version: "SANDUN_EXPORT_STATUS_V1",
    generated_at: nowIso(),
    package_id: input.preflight.package_id,
    export_allowed: false,
    formal_pptx_generated: false,
    reason: input.preflight.missing_materials.length
      ? "资料不足，正式 PPTX 导出被阻断。"
      : "当前任务只允许预检和人工审阅，不直接导出正式 PPTX。",
    missing_materials: input.preflight.missing_materials,
    required_before_export: [
      "资料与证据满足",
      "页面规划人工审阅通过",
      "质量评分满足规则",
      "AgentHub 写回确认"
    ]
  };
}

function buildDrivePptBriefFromPackage(pkg: YcsfSandunExecutorPackage, pptAgentInput: ReturnType<typeof buildPptAgentInputFromPackage>) {
  const matter = pkg.matter || {};
  const missing = pptAgentInput.missing_materials;
  return {
    schema_version: "SANDUN_PPT_BRIEF_V1",
    generated_at: nowIso(),
    package_id: pkg.package_id || "",
    matter_id: matter.matter_id || pkg.package_id || "",
    title: matter.title || "通用项目汇报 PPT",
    project: matter.project || "通用项目汇报",
    task_type: matter.task_type || "ppt / 汇报材料",
    stage: matter.current_stage || "drive_page_plan_first",
    brief_status: missing.length ? "incomplete" : "page_plan_ready_for_review",
    available_materials: pptAgentInput.verified_materials,
    missing_materials: missing,
    audience: matter.audience || "领导 / 项目负责人",
    purpose: matter.purpose || "说明当前阶段成果、系统逻辑、可信链路和下一步建设方向",
    slide_count: "10 页页面草案",
    style_direction: pptAgentInput.style_rules.join(" / ") || "克制、可信、领导汇报、结构清晰",
    key_messages: [
      "领导汇报",
      "阶段成果",
      "可信链路",
      "言出法随是大脑，Sandun 是 PPT 执行器",
      "不夸大成熟度"
    ],
    forbidden_claims: pptAgentInput.forbidden_claims,
    export_allowed: false
  };
}

function drivePptBriefMarkdown(brief: ReturnType<typeof buildDrivePptBriefFromPackage>): string {
  return [
    "# Sandun Drive PPT Brief",
    "",
    `- title: ${brief.title}`,
    `- project: ${brief.project}`,
    `- audience: ${brief.audience}`,
    `- purpose: ${brief.purpose}`,
    `- slide_count: ${brief.slide_count}`,
    `- brief_status: ${brief.brief_status}`,
    `- export_allowed: ${String(brief.export_allowed)}`,
    "",
    "## Key Messages",
    "",
    ...brief.key_messages.map(item => `- ${item}`),
    "",
    "## Forbidden Claims",
    "",
    ...(brief.forbidden_claims.length ? brief.forbidden_claims.map(item => `- ${item}`) : ["- 不得夸大成熟度"]),
    "",
    "## Missing Materials",
    "",
    ...(brief.missing_materials.length ? brief.missing_materials.map(item => `- ${item}`) : ["- none"])
  ].join("\n");
}

function buildDrivePagePlanDraft(brief: ReturnType<typeof buildDrivePptBriefFromPackage>, pptAgentInput: ReturnType<typeof buildPptAgentInputFromPackage>) {
  const evidenceReady = pptAgentInput.evidence_pack.length > 0 && brief.missing_materials.length === 0;
  const evidenceStatus = evidenceReady ? "partial_ready" : "needs_evidence";
  const commonRisk = [
    "不宣称成熟商业化系统",
    "不宣称资料已全部核验",
    "不把 Sandun 写成产品主场景",
    "不暗示已经生成正式高质量 PPTX"
  ];
  const pages = [
    {
      page: 1,
      title: `${brief.title}：大脑驱动执行器`,
      purpose: "建立领导汇报的主叙事和边界。",
      core_content: ["项目处于内部试用 / 样机验证阶段", "言出法随负责识别、记忆、分层和调度", "Sandun 只承担 PPT 执行器预检与页面草案"],
      required_evidence: ["项目名称确认", "当前阶段说明", "汇报对象确认"],
      visual_direction: "克制封面，标题 + 三段式定位，不使用商业发布风格。",
      risk_boundary: commonRisk,
      evidence_status: evidenceStatus
    },
    {
      page: 2,
      title: "为什么现在需要可信链路验证",
      purpose: "说明项目推进的真实问题和建设必要性。",
      core_content: ["AIGC 工具多但链路容易散", "领导关心可控性、证据和阶段成果", "本轮目标是验证大脑能否驱动执行器产出"],
      required_evidence: ["现有工作流痛点", "项目试用范围", "阶段目标材料"],
      visual_direction: "问题-影响-验证目标三列布局。",
      risk_boundary: commonRisk,
      evidence_status: evidenceStatus
    },
    {
      page: 3,
      title: "总体架构：言出法随是大脑",
      purpose: "明确 AgentHub / 言出法随在链路中的主位置。",
      core_content: ["输入识别", "记忆召回", "项目匹配", "任务分层", "执行器选择", "结果写回"],
      required_evidence: ["AgentHub 当前主控台截图或说明", "YCSF 链路定义", "当前事项记录"],
      visual_direction: "从左到右链路图：用户输入 -> 大脑判断 -> Sandun 预检 -> 写回。",
      risk_boundary: commonRisk,
      evidence_status: evidenceStatus
    },
    {
      page: 4,
      title: "Sandun 的角色：PPT 执行器而非主系统",
      purpose: "避免把 Sandun 包装成产品主场景。",
      core_content: ["Sandun 读取大脑生产包", "生成 brief、页面草案、预检、质量建议", "不决定项目事实，不绕过大脑规则"],
      required_evidence: ["executor_package.json", "Sandun 输出目录", "export_status.json"],
      visual_direction: "执行器卡片 + 禁止项侧栏。",
      risk_boundary: commonRisk,
      evidence_status: evidenceStatus
    },
    {
      page: 5,
      title: "本次真实驱动实验路径",
      purpose: "把实验过程讲清楚，让领导能理解可信链路。",
      core_content: ["AgentHub 创建当前事项", "生成大脑生产包", "Sandun 消费生产包", "生成中间产物", "AgentHub 读回状态"],
      required_evidence: ["executor_package.json 路径", "ppt_agent_input.json", "page_plan_draft.json", "sandun_drive_result.json"],
      visual_direction: "五步流程条，标记可验收文件。",
      risk_boundary: commonRisk,
      evidence_status: evidenceStatus
    },
    {
      page: 6,
      title: "阶段性成果：已经能产出哪些中间结果",
      purpose: "展示阶段成果，但不夸大为正式交付。",
      core_content: ["ppt_brief", "page_plan_draft", "preflight_result", "missing_materials", "quality_check", "repair_suggestions", "export_status"],
      required_evidence: ["本次 drive 目录真实文件列表", "文件时间戳", "质量检查结果"],
      visual_direction: "文件矩阵，按输入 / 草案 / 预检 / 门禁分组。",
      risk_boundary: commonRisk,
      evidence_status: evidenceStatus
    },
    {
      page: 7,
      title: "质量与边界：为什么当前不能正式导出 PPTX",
      purpose: "说明可信系统的审慎性。",
      core_content: ["资料仍不足", "证据链未完全核验", "页面草案待人工审阅", "export_allowed=false"],
      required_evidence: ["missing_materials.md", "quality_check.json", "export_status.json"],
      visual_direction: "红线门禁 + 缺口清单，不使用失败感强的视觉。",
      risk_boundary: commonRisk,
      evidence_status: evidenceStatus
    },
    {
      page: 8,
      title: "可信链路的价值：可追溯、可审阅、可回滚",
      purpose: "把技术链路翻译成管理价值。",
      core_content: ["每次驱动都有生产包", "每个产物可定位", "状态写回可追踪", "不满足条件就阻断导出"],
      required_evidence: ["写回记录", "目录结构", "质量门禁说明"],
      visual_direction: "三层价值图：过程可信 / 产物可信 / 决策可信。",
      risk_boundary: commonRisk,
      evidence_status: evidenceStatus
    },
    {
      page: 9,
      title: "当前缺口与补资料计划",
      purpose: "如实说明下一步需要补什么。",
      core_content: brief.missing_materials.length ? brief.missing_materials : ["补充汇报对象", "补充项目资料", "补充政策或验收依据", "补充截图或演示材料"],
      required_evidence: ["用户确认材料", "项目档案", "政策依据", "真实截图"],
      visual_direction: "待补材料看板，按优先级排列。",
      risk_boundary: commonRisk,
      evidence_status: "needs_evidence"
    },
    {
      page: 10,
      title: "下一步建设方向：从样机验证到低风险闭环",
      purpose: "提出稳妥推进路线。",
      core_content: ["人工审阅页面草案", "补充证据与项目材料", "完善 Sandun 质量门禁", "再进入正式 PPTX 导出评估"],
      required_evidence: ["下一阶段计划", "验收标准", "风险控制清单"],
      visual_direction: "路线图：审阅 -> 补资料 -> 质量评分 -> 受控导出。",
      risk_boundary: commonRisk,
      evidence_status: evidenceStatus
    }
  ];
  return {
    schema_version: "SANDUN_PAGE_PLAN_DRAFT_V1",
    generated_at: nowIso(),
    package_id: pptAgentInput.package_id,
    status: "draft_ready_for_manual_review",
    reviewable_by_human: true,
    export_allowed: false,
    pages
  };
}

function drivePagePlanMarkdown(plan: ReturnType<typeof buildDrivePagePlanDraft>): string {
  return [
    "# Drive Page Plan Draft",
    "",
    `- status: ${plan.status}`,
    `- reviewable_by_human: ${String(plan.reviewable_by_human)}`,
    `- export_allowed: ${String(plan.export_allowed)}`,
    "",
    ...plan.pages.flatMap(page => [
      `## Page ${page.page} | ${page.title}`,
      "",
      `- purpose: ${page.purpose}`,
      `- visual_direction: ${page.visual_direction}`,
      `- evidence_status: ${page.evidence_status}`,
      "- core_content:",
      ...page.core_content.map(item => `  - ${item}`),
      "- required_evidence:",
      ...page.required_evidence.map(item => `  - ${item}`),
      "- risk_boundary:",
      ...page.risk_boundary.map(item => `  - ${item}`),
      ""
    ])
  ].join("\n");
}

function buildDrivePreflightResult(input: {
  pkg: YcsfSandunExecutorPackage;
  brief: ReturnType<typeof buildDrivePptBriefFromPackage>;
  pagePlan: ReturnType<typeof buildDrivePagePlanDraft>;
}) {
  const missing = input.brief.missing_materials;
  return {
    schema_version: "SANDUN_PREFLIGHT_RESULT_V1",
    generated_at: nowIso(),
    package_id: input.pkg.package_id || "",
    status: "driven_page_plan_ready_for_manual_review",
    sandun_status: "available",
    page_plan_generated: true,
    page_count: input.pagePlan.pages.length,
    reviewable_by_human: true,
    missing_materials: missing,
    export_allowed: false,
    next_actions: missing.length ? ["人工审阅页面草案", "补充缺失资料"] : ["人工审阅页面草案", "进入质量门禁复核"],
    risks: [
      "本轮未生成正式 PPTX。",
      "页面草案不等于正式交付。",
      "不能宣称成熟商业化系统。",
      "不能伪造政策依据和验收材料。"
    ]
  };
}

function buildDriveQualityCheck(preflight: ReturnType<typeof buildDrivePreflightResult>, pagePlan: ReturnType<typeof buildDrivePagePlanDraft>) {
  const score = preflight.missing_materials.length ? 68 : 78;
  return {
    schema_version: "SANDUN_QUALITY_CHECK_V1",
    generated_at: nowIso(),
    package_id: preflight.package_id,
    score,
    can_review_manually: true,
    can_export_formal_pptx: false,
    export_allowed: false,
    explanation: "页面草案已围绕领导汇报、阶段成果、可信链路展开，可人工审阅；但资料和证据链不足，不能正式导出 PPTX。",
    dimensions: {
      topic_alignment: "good",
      brain_executor_boundary: "clear",
      evidence_mapping: preflight.missing_materials.length ? "needs_materials" : "partial",
      page_logic: pagePlan.pages.length >= 8 ? "reviewable" : "too_short",
      maturity_risk_control: "blocked_overclaim"
    },
    blockers: [
      "资料仍不足或未完全核验。",
      "正式导出门禁未打开。",
      "需要人工审阅页面草案。"
    ]
  };
}

function driveRepairSuggestionsMarkdown(input: {
  preflight: ReturnType<typeof buildDrivePreflightResult>;
  quality: ReturnType<typeof buildDriveQualityCheck>;
}): string {
  return [
    "# Drive Repair Suggestions",
    "",
    `- quality_score: ${input.quality.score}`,
    `- can_review_manually: ${String(input.quality.can_review_manually)}`,
    `- export_allowed: ${String(input.quality.export_allowed)}`,
    "",
    "## Suggestions",
    "",
    "- 人工审阅 10 页页面草案，确认每页是否符合领导汇报口径。",
    "- 补充阶段成果、系统截图、可信链路证据和政策/验收材料。",
    "- 保留“言出法随是大脑，Sandun 是执行器”的边界表达。",
    "- 删除任何成熟商业化、全面落地、已自动生成正式 PPTX 的表述。",
    ...(input.preflight.missing_materials.length ? input.preflight.missing_materials.map(item => `- 补充：${item}`) : [])
  ].join("\n");
}

function buildDriveExportStatus(input: {
  preflight: ReturnType<typeof buildDrivePreflightResult>;
  quality: ReturnType<typeof buildDriveQualityCheck>;
}) {
  return {
    schema_version: "SANDUN_EXPORT_STATUS_V1",
    generated_at: nowIso(),
    package_id: input.preflight.package_id,
    export_allowed: false,
    formal_pptx_generated: false,
    reason: "当前只完成大脑驱动 Sandun 生成可审阅页面草案；资料、证据链、人工审阅和质量门禁未全部满足，禁止正式导出 PPTX。",
    missing_materials: input.preflight.missing_materials,
    required_before_export: [
      "人工审阅页面草案通过",
      "补齐阶段成果和证据材料",
      "确认政策依据和验收材料",
      "质量评分和导出门禁通过",
      "AgentHub 写回确认"
    ]
  };
}

function buildDraftPptBriefFromPackage(pkg: YcsfSandunExecutorPackage, pptAgentInput: ReturnType<typeof buildPptAgentInputFromPackage>) {
  const matter = pkg.matter || {};
  const brain = pkg.brain_context || {};
  const missing = pptAgentInput.missing_materials;
  return {
    schema_version: "SANDUN_DRAFT_PPT_BRIEF_V1",
    generated_at: nowIso(),
    package_id: pkg.package_id || "",
    matter_id: matter.matter_id || pkg.package_id || "",
    title: matter.title || "赣州一日游 PPT 初版",
    topic: matter.topic || "赣州一日游",
    task_type: matter.task_type || "ppt",
    audience: matter.audience || "朋友",
    purpose: matter.purpose || "简单介绍和行程建议",
    page_count_target: matter.page_count_target || "6-8",
    output_level: matter.output_level || "draft",
    source_status: "unverified_draft",
    export_mode: "draft_only",
    final_allowed: false,
    draft_allowed: true,
    brief_status: "draft_ready",
    user_request: String(brain.user_request || ""),
    available_materials: stringList(brain.available_materials).length
      ? stringList(brain.available_materials)
      : ["用户自然输入"],
    verified_materials: pptAgentInput.verified_materials,
    missing_materials: missing,
    style_rules: pptAgentInput.style_rules,
    quality_rules: pptAgentInput.quality_rules,
    forbidden_claims: pptAgentInput.forbidden_claims,
    key_messages: [
      "赣州一日游",
      "适合给朋友看的轻量初版",
      "6-8 页，简单清楚",
      "内容为未联网待核验草案",
      "可以生成 draft PPTX，但不能标记 final"
    ],
    export_allowed: false
  };
}

function draftPptBriefMarkdown(brief: ReturnType<typeof buildDraftPptBriefFromPackage>): string {
  return [
    "# Sandun Draft PPT Brief",
    "",
    `- title: ${brief.title}`,
    `- topic: ${brief.topic}`,
    `- audience: ${brief.audience}`,
    `- purpose: ${brief.purpose}`,
    `- page_count_target: ${brief.page_count_target}`,
    `- output_level: ${brief.output_level}`,
    `- source_status: ${brief.source_status}`,
    `- export_mode: ${brief.export_mode}`,
    `- final_allowed: ${String(brief.final_allowed)}`,
    `- export_allowed: ${String(brief.export_allowed)}`,
    "",
    "## Key Messages",
    "",
    ...brief.key_messages.map(item => `- ${item}`),
    "",
    "## Forbidden Claims",
    "",
    ...(brief.forbidden_claims.length ? brief.forbidden_claims.map(item => `- ${item}`) : ["- 不得标记 final"]),
    "",
    "## Missing / Need Verify",
    "",
    ...(brief.missing_materials.length ? brief.missing_materials.map(item => `- ${item}`) : ["- 出行前仍需核验开放时间、门票、交通和天气。"])
  ].join("\n");
}

function buildDraftPagePlanDraft(brief: ReturnType<typeof buildDraftPptBriefFromPackage>, pptAgentInput: ReturnType<typeof buildPptAgentInputFromPackage>) {
  const riskBoundary = [
    "本页内容是 draft，不是 final。",
    "未联网核验，不能声称已经官方确认。",
    "不写实时开放时间、门票价格、交通耗时。",
    "出行前需要核验天气、交通、门票和开放时间。"
  ];
  const requiredEvidence = ["真实景点资料或官方来源", "出行前核验信息"];
  const pages = [
    {
      page: 1,
      title: "赣州一日游",
      subtitle: "轻松了解这座客家古城的一天玩法",
      purpose: "给朋友快速建立游玩期待和边界。",
      core_content: ["轻松一日游初版", "适合朋友阅读", "内容待出行前核验"],
      required_evidence: requiredEvidence,
      visual_direction: "明亮清爽封面，保留 draft 标识。",
      risk_boundary: riskBoundary,
      evidence_status: "unverified_draft"
    },
    {
      page: 2,
      title: "一日游总览",
      purpose: "用上午 / 中午 / 下午 / 晚上说明整体节奏。",
      core_content: ["上午：老城文化氛围", "中午：本地风味", "下午：城市漫步与拍照", "晚上：休闲夜景或返程"],
      required_evidence: requiredEvidence,
      visual_direction: "四段时间轴，少文字。",
      risk_boundary: riskBoundary,
      evidence_status: "unverified_draft"
    },
    {
      page: 3,
      title: "上午推荐：先感受古城氛围",
      purpose: "给出上午的轻量文化体验方向。",
      core_content: ["老城区散步", "客家文化和古城氛围", "适合慢慢逛、拍照、了解城市气质"],
      required_evidence: requiredEvidence,
      visual_direction: "文化街区感卡片，避免写具体开放时间。",
      risk_boundary: riskBoundary,
      evidence_status: "unverified_draft"
    },
    {
      page: 4,
      title: "中午吃什么：本地风味",
      purpose: "给朋友一个简单的午餐选择方向。",
      core_content: ["优先尝试赣南风味", "选择评价稳定、交通方便的餐馆", "具体店名和价格需另行核验"],
      required_evidence: ["真实餐厅来源", "价格和营业状态需出行前核验"],
      visual_direction: "美食建议三卡片，轻松、不堆字。",
      risk_boundary: riskBoundary,
      evidence_status: "unverified_draft"
    },
    {
      page: 5,
      title: "下午推荐：城市漫步与拍照",
      purpose: "把下午安排成轻松可执行的游玩段。",
      core_content: ["代表性城市景点或街区", "适合散步和拍照", "按体力和天气灵活调整"],
      required_evidence: requiredEvidence,
      visual_direction: "漫步路线卡，不写精确交通耗时。",
      risk_boundary: riskBoundary,
      evidence_status: "unverified_draft"
    },
    {
      page: 6,
      title: "晚上安排：夜景、休闲或返程",
      purpose: "给出收尾建议，避免行程过满。",
      core_content: ["看夜景或找地方休息", "预留返程和休整时间", "根据朋友状态决定是否加点"],
      required_evidence: ["夜间开放状态需核验", "返程交通需核验"],
      visual_direction: "轻夜景氛围，提醒核验。",
      risk_boundary: riskBoundary,
      evidence_status: "unverified_draft"
    },
    {
      page: 7,
      title: "注意事项：出行前再确认",
      purpose: "明确哪些信息不能凭草案直接当事实。",
      core_content: ["天气、交通、门票、开放时间都要出行前核验", "本 PPT 是初版，不是正式攻略", "如需准确版本，需要补充真实资料或启用搜索"],
      required_evidence: ["天气来源", "景区官方信息", "交通平台信息"],
      visual_direction: "清单页，突出待核验。",
      risk_boundary: riskBoundary,
      evidence_status: "unverified_draft"
    },
    {
      page: 8,
      title: "结尾：一天认识赣州",
      purpose: "用轻松语气结束，适合给朋友看。",
      core_content: ["一天先轻松认识赣州", "不追求打卡过满", "后续可按真实资料再精修"],
      required_evidence: ["如需正式发布，补充真实来源"],
      visual_direction: "简洁收尾页，保留 draft 提醒。",
      risk_boundary: riskBoundary,
      evidence_status: "unverified_draft"
    }
  ];
  return {
    schema_version: "SANDUN_PAGE_PLAN_DRAFT_V1",
    generated_at: nowIso(),
    package_id: pptAgentInput.package_id,
    status: "draft_ready_for_manual_review",
    source_status: "unverified_draft",
    export_mode: "draft_only",
    reviewable_by_human: true,
    draft_deck_allowed: true,
    final_allowed: false,
    export_allowed: false,
    pages
  };
}

function draftPagePlanMarkdown(plan: ReturnType<typeof buildDraftPagePlanDraft>): string {
  return [
    "# Ganzhou Day Trip Draft Page Plan",
    "",
    `- status: ${plan.status}`,
    `- source_status: ${plan.source_status}`,
    `- export_mode: ${plan.export_mode}`,
    `- draft_deck_allowed: ${String(plan.draft_deck_allowed)}`,
    `- final_allowed: ${String(plan.final_allowed)}`,
    `- export_allowed: ${String(plan.export_allowed)}`,
    "",
    ...plan.pages.flatMap(page => [
      `## Page ${page.page} | ${page.title}`,
      "",
      `- purpose: ${page.purpose}`,
      `- visual_direction: ${page.visual_direction}`,
      `- evidence_status: ${page.evidence_status}`,
      "- core_content:",
      ...page.core_content.map(item => `  - ${item}`),
      "- required_evidence:",
      ...page.required_evidence.map(item => `  - ${item}`),
      "- risk_boundary:",
      ...page.risk_boundary.map(item => `  - ${item}`),
      ""
    ])
  ].join("\n");
}

function buildDraftPreflightResult(input: {
  pkg: YcsfSandunExecutorPackage;
  brief: ReturnType<typeof buildDraftPptBriefFromPackage>;
  pagePlan: ReturnType<typeof buildDraftPagePlanDraft>;
}) {
  return {
    schema_version: "SANDUN_PREFLIGHT_RESULT_V1",
    generated_at: nowIso(),
    package_id: input.pkg.package_id || "",
    status: "draft_ppt_ready_for_manual_review",
    sandun_status: "available",
    page_plan_generated: true,
    draft_deck_requested: true,
    page_count: input.pagePlan.pages.length,
    reviewable_by_human: true,
    source_status: "unverified_draft",
    export_allowed: false,
    final_export_allowed: false,
    missing_materials: input.brief.missing_materials,
    next_actions: [
      "人工打开 draft_deck.pptx 看结构是否满意",
      "如需准确内容，补充真实景点资料或启用真实搜索",
      "不要直接当正式旅游攻略发布"
    ],
    risks: [
      "本轮生成的是 draft PPTX，不是 final。",
      "未联网核验，不得声称已官方确认。",
      "开放时间、门票、交通耗时、价格均需出行前核验。"
    ]
  };
}

function buildDraftQualityCheck(preflight: ReturnType<typeof buildDraftPreflightResult>, pagePlan: ReturnType<typeof buildDraftPagePlanDraft>) {
  return {
    schema_version: "SANDUN_QUALITY_CHECK_V1",
    generated_at: nowIso(),
    package_id: preflight.package_id,
    score: 74,
    can_review_manually: true,
    draft_deck_generated: true,
    can_export_formal_pptx: false,
    final_export_allowed: false,
    export_allowed: false,
    explanation: "已生成 8 页赣州一日游 draft 页面规划和可打开 PPTX；内容未联网核验，只适合人工预览和后续修订。",
    dimensions: {
      page_structure: pagePlan.pages.length >= 6 && pagePlan.pages.length <= 8 ? "complete_for_draft" : "needs_adjustment",
      friend_readability: "good",
      source_verification: "unverified_draft",
      forbidden_claims: "blocked",
      final_export_gate: "blocked"
    },
    blockers: [
      "未接入或未执行真实联网检索。",
      "景点、门票、开放时间、交通耗时仍需核验。",
      "当前只能作为 draft，不得标记 final。"
    ]
  };
}

function draftRepairSuggestionsMarkdown(input: {
  preflight: ReturnType<typeof buildDraftPreflightResult>;
  quality: ReturnType<typeof buildDraftQualityCheck>;
}): string {
  return [
    "# Draft Repair Suggestions",
    "",
    `- quality_score: ${input.quality.score}`,
    `- draft_deck_generated: ${String(input.quality.draft_deck_generated)}`,
    `- final_export_allowed: ${String(input.quality.final_export_allowed)}`,
    "",
    "## Suggestions",
    "",
    "- 人工打开 PPT，看 8 页结构是否适合给朋友看。",
    "- 如需更准确，请补充景点、餐饮、交通和开放时间的真实来源。",
    "- 保留 draft 和待核验提示，不要写成最终攻略。",
    "- 需要精修时再补图片、路线地图和真实链接。"
  ].join("\n");
}

function buildDraftExportStatus(input: {
  preflight: ReturnType<typeof buildDraftPreflightResult>;
  quality: ReturnType<typeof buildDraftQualityCheck>;
  draftDeckPath: string;
}) {
  return {
    schema_version: "SANDUN_EXPORT_STATUS_V1",
    generated_at: nowIso(),
    package_id: input.preflight.package_id,
    draft_generated: true,
    draft_deck_path: input.draftDeckPath,
    final_export_allowed: false,
    export_allowed: false,
    formal_pptx_generated: false,
    reason: "draft_only_unverified_or_missing_verified_sources",
    source_status: "unverified_draft",
    required_before_final: [
      "补充真实景点资料或启用真实搜索",
      "核验开放时间、门票、交通、价格和天气",
      "人工审阅并确认页面内容",
      "移除待核验项后再评估正式发布"
    ]
  };
}

async function writeDraftDeckPptx(input: {
  brief: ReturnType<typeof buildDraftPptBriefFromPackage>;
  pagePlan: ReturnType<typeof buildDraftPagePlanDraft>;
  outputPath: string;
}) {
  const deck = new pptxgen();
  deck.layout = "LAYOUT_WIDE";
  deck.author = "Sandun PPT Agent";
  deck.subject = "draft only, unverified";
  deck.title = input.brief.title;
  deck.company = "AgentHub YCSF";
  deck.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei" };
  deck.defineLayout({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 });

  const palette = {
    bg: "F8FAFC",
    card: "FFFFFF",
    ink: "1F2937",
    muted: "64748B",
    accent: "0EA5A4",
    line: "D8E3EA",
    warn: "B45309"
  };

  for (const page of input.pagePlan.pages) {
    const slide = deck.addSlide();
    slide.background = { color: palette.bg };
    slide.addShape(deck.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.1, fill: { color: palette.accent }, line: { color: palette.accent } });
    slide.addText("DRAFT / 待核验", { x: 10.35, y: 0.32, w: 2.15, h: 0.28, fontSize: 10, color: palette.warn, bold: true, align: "right" });
    slide.addText(page.title, { x: 0.72, y: 0.7, w: 9.7, h: 0.55, fontSize: page.page === 1 ? 30 : 24, color: palette.ink, bold: true, breakLine: false });
    if ("subtitle" in page && page.subtitle) {
      slide.addText(String(page.subtitle), { x: 0.75, y: 1.35, w: 9.2, h: 0.38, fontSize: 15, color: palette.muted });
    }
    slide.addText(page.purpose, { x: 0.78, y: page.page === 1 ? 2.0 : 1.55, w: 11.55, h: 0.45, fontSize: 13.5, color: palette.muted });
    slide.addShape(deck.ShapeType.roundRect, { x: 0.75, y: 2.28, w: 7.1, h: 3.2, rectRadius: 0.08, fill: { color: palette.card }, line: { color: palette.line, transparency: 15 } });
    slide.addText("本页重点", { x: 1.04, y: 2.55, w: 2.0, h: 0.28, fontSize: 11, color: palette.accent, bold: true });
    slide.addText(page.core_content.map(item => `• ${item}`).join("\n"), { x: 1.04, y: 2.95, w: 6.2, h: 1.7, fontSize: 14, color: palette.ink, breakLine: false, fit: "shrink" });
    slide.addText("说明：本页内容为未联网初版，具体信息请出行前核验。", { x: 1.04, y: 4.92, w: 6.2, h: 0.3, fontSize: 9.5, color: palette.muted });
    slide.addShape(deck.ShapeType.roundRect, { x: 8.15, y: 2.28, w: 4.35, h: 3.2, rectRadius: 0.08, fill: { color: "ECFEFF" }, line: { color: "BAE6FD", transparency: 20 } });
    slide.addText("需要核验", { x: 8.45, y: 2.55, w: 1.8, h: 0.28, fontSize: 11, color: palette.accent, bold: true });
    slide.addText(page.required_evidence.map(item => `• ${item}`).join("\n"), { x: 8.45, y: 2.95, w: 3.55, h: 1.4, fontSize: 11.5, color: palette.ink, fit: "shrink" });
    slide.addText("不可作为正式版 / 不可声称官方核验", { x: 8.45, y: 4.72, w: 3.55, h: 0.3, fontSize: 10, color: palette.warn, bold: true });
    slide.addText(`${page.page} / ${input.pagePlan.pages.length}`, { x: 11.55, y: 6.78, w: 0.8, h: 0.22, fontSize: 8.5, color: palette.muted, align: "right" });
  }

  const buffer = await deck.write({ outputType: "nodebuffer" });
  writeFileSync(input.outputPath, buffer as Buffer);
}

function draftDeckReportMarkdown(input: {
  brief: ReturnType<typeof buildDraftPptBriefFromPackage>;
  pagePlan: ReturnType<typeof buildDraftPagePlanDraft>;
  draftDeckPath: string;
}): string {
  return [
    "# Draft Deck Report",
    "",
    `- title: ${input.brief.title}`,
    `- draft_deck: ${input.draftDeckPath}`,
    `- page_count: ${input.pagePlan.pages.length}`,
    "- draft_generated: true",
    "- final_export_allowed: false",
    "- export_allowed: false",
    "- source_status: unverified_draft",
    "",
    "## Notes",
    "",
    "- 这是一份给朋友看的简单初版 PPT。",
    "- 当前没有声称已联网检索或官方核验。",
    "- 景点开放时间、门票、交通耗时、价格和天气均需出行前核验。"
  ].join("\n");
}

export async function runBrainPptExecutorPackage(input: {
  executorPackagePath: string;
  rootPath?: string;
  writebackId?: string;
}): Promise<{
  ok: true;
  package_id: string;
  writeback_root: string;
  executor_package: YcsfSandunExecutorPackage;
  ppt_agent_input: ReturnType<typeof buildPptAgentInputFromPackage>;
  ppt_brief: Record<string, unknown>;
  page_plan_draft: Record<string, unknown>;
  preflight_result: Record<string, unknown>;
  quality_check: Record<string, unknown>;
  export_status: Record<string, unknown>;
  files: Record<string, string>;
}> {
  const rootPath = resolve(/*turbopackIgnore: true*/ input.rootPath || DEFAULT_BRAIN_PPT_ROOT);
  const executorPackage = readExecutorPackage(input.executorPackagePath, rootPath);
  const writebackRoot = resolvePackageWritebackRoot({ rootPath, executorPackage, writebackId: input.writebackId });
  ensureDir(writebackRoot);

  const pptAgentInput = buildPptAgentInputFromPackage(executorPackage);
  const executorMode = executorPackage.executor?.mode || "preflight_first";
  const isDriveMode = executorMode === "drive_page_plan_first";
  const isDraftPptMode = executorMode === "draft_ppt_first";
  const draftDeckPath = safeJoin(writebackRoot, "draft_deck.pptx");
  const draftDeckReportPath = safeJoin(writebackRoot, "draft_deck_report.md");
  const pptBrief = isDraftPptMode
    ? buildDraftPptBriefFromPackage(executorPackage, pptAgentInput)
    : isDriveMode
    ? buildDrivePptBriefFromPackage(executorPackage, pptAgentInput)
    : buildPptBriefFromPackage(executorPackage, pptAgentInput);
  const pagePlanDraft = isDraftPptMode
    ? buildDraftPagePlanDraft(pptBrief as ReturnType<typeof buildDraftPptBriefFromPackage>, pptAgentInput)
    : isDriveMode
    ? buildDrivePagePlanDraft(pptBrief as ReturnType<typeof buildDrivePptBriefFromPackage>, pptAgentInput)
    : buildPagePlanDraft(pptBrief as ReturnType<typeof buildPptBriefFromPackage>, pptAgentInput);
  const preflightResult = isDraftPptMode
    ? buildDraftPreflightResult({
      pkg: executorPackage,
      brief: pptBrief as ReturnType<typeof buildDraftPptBriefFromPackage>,
      pagePlan: pagePlanDraft as ReturnType<typeof buildDraftPagePlanDraft>
    })
    : isDriveMode
    ? buildDrivePreflightResult({
      pkg: executorPackage,
      brief: pptBrief as ReturnType<typeof buildDrivePptBriefFromPackage>,
      pagePlan: pagePlanDraft as ReturnType<typeof buildDrivePagePlanDraft>
    })
    : buildPreflightResult({
      pkg: executorPackage,
      brief: pptBrief as ReturnType<typeof buildPptBriefFromPackage>,
      pagePlan: pagePlanDraft as ReturnType<typeof buildPagePlanDraft>
    });
  const qualityCheck = isDraftPptMode
    ? buildDraftQualityCheck(
      preflightResult as ReturnType<typeof buildDraftPreflightResult>,
      pagePlanDraft as ReturnType<typeof buildDraftPagePlanDraft>
    )
    : isDriveMode
    ? buildDriveQualityCheck(
      preflightResult as ReturnType<typeof buildDrivePreflightResult>,
      pagePlanDraft as ReturnType<typeof buildDrivePagePlanDraft>
    )
    : buildQualityCheck(
      preflightResult as ReturnType<typeof buildPreflightResult>,
      pagePlanDraft as ReturnType<typeof buildPagePlanDraft>
    );
  const exportStatus = isDraftPptMode
    ? buildDraftExportStatus({
      preflight: preflightResult as ReturnType<typeof buildDraftPreflightResult>,
      quality: qualityCheck as ReturnType<typeof buildDraftQualityCheck>,
      draftDeckPath
    })
    : isDriveMode
    ? buildDriveExportStatus({
      preflight: preflightResult as ReturnType<typeof buildDrivePreflightResult>,
      quality: qualityCheck as ReturnType<typeof buildDriveQualityCheck>
    })
    : buildExportStatus({
      preflight: preflightResult as ReturnType<typeof buildPreflightResult>,
      quality: qualityCheck as ReturnType<typeof buildQualityCheck>
    });
  const deckSpec = buildDeckSpec({
    executorPackage,
    pptBrief,
    pagePlanDraft,
    qualityCheck,
    exportStatus,
    draftDeckPath: isDraftPptMode ? draftDeckPath : undefined
  });
  const qualityRubric = buildQualityRubric();

  const files = {
    deck_spec_json: safeJoin(writebackRoot, "deck_spec.json"),
    deck_spec_md: safeJoin(writebackRoot, "deck_spec.md"),
    ppt_agent_input: safeJoin(writebackRoot, "ppt_agent_input.json"),
    ppt_brief_json: safeJoin(writebackRoot, "ppt_brief.json"),
    ppt_brief_md: safeJoin(writebackRoot, "ppt_brief.md"),
    page_plan_draft_json: safeJoin(writebackRoot, "page_plan_draft.json"),
    page_plan_draft_md: safeJoin(writebackRoot, "page_plan_draft.md"),
    preflight_result: safeJoin(writebackRoot, "preflight_result.json"),
    missing_materials: safeJoin(writebackRoot, "missing_materials.md"),
    quality_check: safeJoin(writebackRoot, "quality_check.json"),
    repair_suggestions: safeJoin(writebackRoot, "repair_suggestions.md"),
    export_status: safeJoin(writebackRoot, "export_status.json"),
    quality_rubric_json: safeJoin(writebackRoot, "quality_rubric.json"),
    quality_rubric_md: safeJoin(writebackRoot, "quality_rubric.md"),
    critique_report_json: safeJoin(writebackRoot, "critique_report.json"),
    critique_report_md: safeJoin(writebackRoot, "critique_report.md"),
    repair_plan_json: safeJoin(writebackRoot, "repair_plan.json"),
    repair_plan_md: safeJoin(writebackRoot, "repair_plan.md"),
    export_gate_json: safeJoin(writebackRoot, "export_gate.json"),
    export_gate_md: safeJoin(writebackRoot, "export_gate.md"),
    reviewed_draft_result: safeJoin(writebackRoot, "reviewed_draft_result.json"),
    ...(isDraftPptMode ? {
      draft_deck_pptx: draftDeckPath,
      draft_deck_report: draftDeckReportPath,
      reviewed_draft_pptx: safeJoin(writebackRoot, "draft_deck_reviewed.pptx")
    } : {})
  };

  writeJson(files.deck_spec_json, deckSpec);
  writeText(files.deck_spec_md, deckSpecMarkdown(deckSpec));
  writeJson(files.ppt_agent_input, pptAgentInput);
  writeJson(files.ppt_brief_json, pptBrief);
  writeText(files.ppt_brief_md, isDraftPptMode
    ? draftPptBriefMarkdown(pptBrief as ReturnType<typeof buildDraftPptBriefFromPackage>)
    : isDriveMode
    ? drivePptBriefMarkdown(pptBrief as ReturnType<typeof buildDrivePptBriefFromPackage>)
    : pptBriefMarkdown(pptBrief as ReturnType<typeof buildPptBriefFromPackage>));
  writeJson(files.page_plan_draft_json, pagePlanDraft);
  writeText(files.page_plan_draft_md, isDraftPptMode
    ? draftPagePlanMarkdown(pagePlanDraft as ReturnType<typeof buildDraftPagePlanDraft>)
    : isDriveMode
    ? drivePagePlanMarkdown(pagePlanDraft as ReturnType<typeof buildDrivePagePlanDraft>)
    : pagePlanMarkdown(pagePlanDraft as ReturnType<typeof buildPagePlanDraft>));
  writeJson(files.preflight_result, preflightResult);
  writeText(files.missing_materials, missingMaterialsMarkdown(preflightResult.missing_materials));
  writeJson(files.quality_check, qualityCheck);
  writeJson(files.quality_rubric_json, qualityRubric);
  writeText(files.quality_rubric_md, qualityRubricMarkdown(qualityRubric));
  writeText(files.repair_suggestions, isDraftPptMode
    ? draftRepairSuggestionsMarkdown({
      preflight: preflightResult as ReturnType<typeof buildDraftPreflightResult>,
      quality: qualityCheck as ReturnType<typeof buildDraftQualityCheck>
    })
    : isDriveMode
    ? driveRepairSuggestionsMarkdown({
      preflight: preflightResult as ReturnType<typeof buildDrivePreflightResult>,
      quality: qualityCheck as ReturnType<typeof buildDriveQualityCheck>
    })
    : repairSuggestionsMarkdown({
      preflight: preflightResult as ReturnType<typeof buildPreflightResult>,
      quality: qualityCheck as ReturnType<typeof buildQualityCheck>
    }));
  writeJson(files.export_status, exportStatus);
  if (isDraftPptMode) {
    await writeDraftDeckPptx({
      brief: pptBrief as ReturnType<typeof buildDraftPptBriefFromPackage>,
      pagePlan: pagePlanDraft as ReturnType<typeof buildDraftPagePlanDraft>,
      outputPath: draftDeckPath
    });
    writeText(draftDeckReportPath, draftDeckReportMarkdown({
      brief: pptBrief as ReturnType<typeof buildDraftPptBriefFromPackage>,
      pagePlan: pagePlanDraft as ReturnType<typeof buildDraftPagePlanDraft>,
      draftDeckPath
    }));
    const reviewedDraftTarget = "reviewed_draft_pptx" in files ? files.reviewed_draft_pptx : "";
    if (existsSync(draftDeckPath) && reviewedDraftTarget) {
      writeFileSync(reviewedDraftTarget, readFileSync(draftDeckPath));
    }
  }
  const reviewedDraftPath = "reviewed_draft_pptx" in files ? files.reviewed_draft_pptx : "";
  const critiqueReport = buildCritiqueReport({
    executorPackage,
    pptBrief,
    pagePlanDraft,
    qualityCheck,
    exportStatus,
    draftDeckPath: reviewedDraftPath || (isDraftPptMode ? draftDeckPath : undefined)
  }, deckSpec);
  const repairPlan = buildRepairPlan({
    executorPackage,
    pptBrief,
    pagePlanDraft,
    qualityCheck,
    exportStatus,
    draftDeckPath: reviewedDraftPath || (isDraftPptMode ? draftDeckPath : undefined)
  }, critiqueReport);
  const exportGate = buildExportGate({
    executorPackage,
    pptBrief,
    pagePlanDraft,
    qualityCheck,
    exportStatus,
    draftDeckPath: reviewedDraftPath || (isDraftPptMode ? draftDeckPath : undefined)
  }, critiqueReport, repairPlan);
  const reviewedDraftResult = buildReviewedDraftResult({
    writebackRoot,
    draftDeckPath: isDraftPptMode ? draftDeckPath : undefined,
    reviewedDraftPath: reviewedDraftPath || undefined,
    critiqueReportPath: files.critique_report_json,
    repairPlanPath: files.repair_plan_json,
    exportGatePath: files.export_gate_json,
    critiqueReport
  });
  writeJson(files.critique_report_json, critiqueReport);
  writeText(files.critique_report_md, critiqueReportMarkdown(critiqueReport));
  writeJson(files.repair_plan_json, repairPlan);
  writeText(files.repair_plan_md, repairPlanMarkdown(repairPlan));
  writeJson(files.export_gate_json, exportGate);
  writeText(files.export_gate_md, exportGateMarkdown(exportGate));
  writeJson(files.reviewed_draft_result, reviewedDraftResult);

  return {
    ok: true,
    package_id: executorPackage.package_id || "",
    writeback_root: writebackRoot,
    executor_package: executorPackage,
    ppt_agent_input: pptAgentInput,
    ppt_brief: pptBrief,
    page_plan_draft: pagePlanDraft,
    preflight_result: preflightResult,
    quality_check: qualityCheck,
    export_status: exportStatus,
    files
  };
}

export async function runBrainPptConnector(input: {
  briefPath: string;
  rootPath?: string;
  writebackId?: string;
}): Promise<{
  ok: true;
  run_id: string;
  writeback_root: string;
  brief: BrainPptBrief;
  brain_context_report: BrainContextReport;
  api_status: BrainApiStatus;
  ppt_agent_result: BrainPptAgentResult;
  sandun_preflight_result: SandunPreflightResult;
  files: Record<string, string>;
}> {
  const rootPath = resolve(/*turbopackIgnore: true*/ input.rootPath || DEFAULT_BRAIN_PPT_ROOT);
  const briefPath = resolve(/*turbopackIgnore: true*/ input.briefPath);
  if (!isWithin(rootPath, briefPath)) {
    throw new Error("ppt_brief path must stay inside Brain PPT root");
  }
  const brief = readBrief(briefPath);
  const writebackRoot = safeJoin(rootPath, "ppt_runs", input.writebackId || brief.run_id);
  ensureDir(writebackRoot);
  const workspaceContext = buildWorkspaceContext(rootPath, brief);
  const connectorInput = buildConnectorInput(brief, workspaceContext);
  const report = buildContextReport({ brief, briefPath, writebackRoot, connectorInput, workspaceContext });
  const apiStatus = buildApiStatus(brief);
  const files = {
    brain_context_report_json: safeJoin(writebackRoot, "brain_context_report.json"),
    brain_context_report_md: safeJoin(writebackRoot, "brain_context_report.md"),
    api_status: safeJoin(writebackRoot, "api_status.json"),
    preflight_checklist: safeJoin(writebackRoot, "preflight_checklist.md"),
    ppt_agent_result: safeJoin(writebackRoot, "ppt_agent_result.json"),
    sandun_preflight_result: safeJoin(writebackRoot, "sandun_preflight_result.json"),
    next_action_suggestions: safeJoin(writebackRoot, "next_action_suggestions.md")
  };
  writeJson(files.brain_context_report_json, report);
  writeText(files.brain_context_report_md, contextReportMarkdown(report));
  writeJson(files.api_status, apiStatus);
  writeText(files.preflight_checklist, checklistMarkdown(brief, report));
  const result: BrainPptAgentResult = {
    schema_version: "BRAIN_PPT_AGENT_RESULT_V1",
    run_id: brief.run_id,
    generated_at: nowIso(),
    status: report.can_generate_formal_pptx ? "ready_for_generation" : "preflight_required",
    formal_pptx_generated: false,
    brain_context_report_path: files.brain_context_report_json,
    api_status_path: files.api_status,
    preflight_checklist_path: files.preflight_checklist,
    low_evidence_pages: report.can_generate_formal_pptx ? [] : ["all_pages_pending_evidence_mapping"],
    unsupported_claims: report.can_generate_formal_pptx ? [] : ["formal_slide_claims_not_generated_before_material_confirmation"],
    missing_materials: brief.material_check.missing_materials || [],
    next_suggestions: report.next_actions
  };
  writeJson(files.ppt_agent_result, result);
  const preflight = buildSandunPreflightResult(brief, report, apiStatus);
  writeJson(files.sandun_preflight_result, preflight);
  writeText(files.next_action_suggestions, nextActionSuggestionsMarkdown({ brief, preflight, apiStatus }));
  return {
    ok: true,
    run_id: brief.run_id,
    writeback_root: writebackRoot,
    brief,
    brain_context_report: report,
    api_status: apiStatus,
    ppt_agent_result: result,
    sandun_preflight_result: preflight,
    files
  };
}
