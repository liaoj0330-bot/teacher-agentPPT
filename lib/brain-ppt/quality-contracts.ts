import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

type ExecutorPackage = {
  package_id?: string;
  status?: string;
  source_status?: string;
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
    available_materials?: string[];
    verified_materials?: string[];
    evidence_pack?: string[];
    style_rules?: string[];
    quality_rules?: string[];
    forbidden_claims?: string[];
    missing_materials?: string[];
  };
};

type QualityInput = {
  executorPackage: ExecutorPackage;
  pptBrief: Record<string, any>;
  pagePlanDraft: Record<string, any>;
  qualityCheck: Record<string, any>;
  exportStatus: Record<string, any>;
  draftDeckPath?: string;
  previousDeckPath?: string;
};

const RUBRIC_DIMENSIONS = [
  ["content_logic_score", "内容逻辑是否清楚，每页是否有目的。"],
  ["audience_fit_score", "是否符合受众。"],
  ["evidence_score", "证据、资料、来源是否清楚。"],
  ["narrative_score", "整份 PPT 是否有顺序和推进感。"],
  ["visual_hierarchy_score", "页面主次、标题、文字密度、视觉焦点是否清楚。"],
  ["layout_consistency_score", "页面版式是否统一，不像临时拼装。"],
  ["asset_quality_score", "图片、截图、图表、地图等素材是否有效。"],
  ["ai_slop_risk_score", "是否有 AI 味、空话、泛化标题、假高级感。"],
  ["risk_boundary_score", "是否避免伪造事实、夸大、假来源。"],
  ["usability_score", "用户是否能直接使用或继续修改。"]
] as const;

function nowIso() {
  return new Date().toISOString();
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item)).filter(Boolean);
}

function pageArray(pagePlanDraft: Record<string, any>): Record<string, any>[] {
  return Array.isArray(pagePlanDraft.pages) ? pagePlanDraft.pages : [];
}

function pageTitle(page: Record<string, any>) {
  return String(page.title || page.main_message || `Slide ${page.page || page.page_number || ""}`).trim();
}

function pageNumber(page: Record<string, any>, index: number) {
  return Number(page.page || page.page_number || index + 1);
}

function slideId(page: Record<string, any>, index: number) {
  return String(page.slide_id || `slide_${String(pageNumber(page, index)).padStart(2, "0")}`);
}

function qualityLevel(score: number) {
  if (score < 60) return "不可给用户，必须重做";
  if (score < 70) return "结构草案，仅内部技术验收";
  if (score < 80) return "可人工审阅初版";
  if (score < 90) return "可分享 / 可汇报初版";
  return "接近正式成品，但仍需人工最终确认";
}

function scoreFromQualityCheck(qualityCheck: Record<string, any>) {
  const score = Number(qualityCheck.score ?? qualityCheck.overall_score ?? 0);
  return Number.isFinite(score) && score > 0 ? Math.max(0, Math.min(100, Math.round(score))) : 68;
}

function hasRealDeck(path?: string) {
  return Boolean(path && existsSync(path));
}

function clonePptx(source: string | undefined, target: string | undefined) {
  if (!source || !target || !existsSync(source)) return false;
  const buffer = readFileSync(source);
  return buffer.length > 0;
}

export function buildDeckSpec(input: QualityInput) {
  const pkg = input.executorPackage;
  const matter = pkg.matter || {};
  const brain = pkg.brain_context || {};
  const pages = pageArray(input.pagePlanDraft);
  const missingMaterials = list(brain.missing_materials);
  const forbiddenClaims = list(brain.forbidden_claims);
  return {
    schema_version: "SANDUN_DECK_SPEC_V1",
    generated_at: nowIso(),
    generation_order: "before_page_plan_and_draft_deck",
    deck: {
      deck_id: pkg.package_id || matter.matter_id || `deck_${Date.now()}`,
      title: matter.title || String(input.pptBrief.title || "未命名 PPT"),
      task_type: matter.task_type || "ppt",
      audience: matter.audience || String(input.pptBrief.audience || "待确认受众"),
      purpose: matter.purpose || String(input.pptBrief.purpose || "待确认用途"),
      output_level: matter.output_level || String(input.pptBrief.output_level || "draft"),
      source_status: pkg.source_status || String(input.pptBrief.source_status || "unverified_draft"),
      expected_page_count: matter.page_count_target || String(input.pptBrief.page_count_target || pages.length || "待确认"),
      style_goal: list(brain.style_rules).join(" / ") || String(input.pptBrief.style_direction || "清楚、可审阅、低夸大"),
      forbidden_claims: forbiddenClaims.length ? forbiddenClaims : ["不得标记 final", "不得伪造联网搜索", "不得伪造真实图片"],
      missing_materials: missingMaterials,
      export_allowed: false
    },
    slides: pages.map((page, index) => ({
      slide_id: slideId(page, index),
      page_number: pageNumber(page, index),
      page_type: String(page.page_type || (index === 0 ? "cover" : index === pages.length - 1 ? "closing" : "content")),
      page_goal: String(page.page_goal || page.purpose || "说明本页要解决的问题"),
      audience_question: String(page.audience_question || "用户看这一页时需要判断什么？"),
      main_message: pageTitle(page),
      evidence_needed: list(page.required_evidence || page.evidence_needed),
      visual_intent: String(page.visual_intent || page.visual_direction || "清晰表达，不用伪真实素材"),
      layout_requirements: list(page.layout_requirements).length ? list(page.layout_requirements) : ["保持统一标题区", "控制文字密度", "保留 draft / 待核验提示"],
      asset_requirements: list(page.asset_requirements).length ? list(page.asset_requirements) : ["真实图片或授权素材优先", "无素材时使用明确占位，不伪造真实图片"],
      risk_boundary: list(page.risk_boundary).length ? list(page.risk_boundary) : forbiddenClaims,
      draft_notes: String(page.draft_notes || "本页为未核验草案，正式使用前需要人工确认。")
    }))
  };
}

export function deckSpecMarkdown(deckSpec: ReturnType<typeof buildDeckSpec>) {
  return [
    "# Sandun Deck Spec V1",
    "",
    `- deck_id: ${deckSpec.deck.deck_id}`,
    `- title: ${deckSpec.deck.title}`,
    `- output_level: ${deckSpec.deck.output_level}`,
    `- source_status: ${deckSpec.deck.source_status}`,
    `- expected_page_count: ${deckSpec.deck.expected_page_count}`,
    `- export_allowed: ${String(deckSpec.deck.export_allowed)}`,
    "",
    "## Missing Materials",
    "",
    ...(deckSpec.deck.missing_materials.length ? deckSpec.deck.missing_materials.map(item => `- ${item}`) : ["- none"]),
    "",
    "## Slides",
    "",
    ...deckSpec.slides.flatMap(slide => [
      `### ${slide.page_number}. ${slide.main_message}`,
      "",
      `- page_goal: ${slide.page_goal}`,
      `- audience_question: ${slide.audience_question}`,
      `- visual_intent: ${slide.visual_intent}`,
      "- evidence_needed:",
      ...(slide.evidence_needed.length ? slide.evidence_needed.map(item => `  - ${item}`) : ["  - 待补资料"]),
      "- risk_boundary:",
      ...(slide.risk_boundary.length ? slide.risk_boundary.map(item => `  - ${item}`) : ["  - 不得标记 final"]),
      ""
    ])
  ].join("\n");
}

export function buildQualityRubric() {
  return {
    schema_version: "SANDUN_QUALITY_RUBRIC_V1",
    generated_at: nowIso(),
    scoring: Object.fromEntries(RUBRIC_DIMENSIONS.map(([key, description]) => [key, { max_score: 10, description }])),
    total_score: 100,
    quality_levels: [
      { range: "0-59", label: "不可给用户，必须重做" },
      { range: "60-69", label: "结构草案，仅内部技术验收" },
      { range: "70-79", label: "可人工审阅初版" },
      { range: "80-89", label: "可分享 / 可汇报初版" },
      { range: "90-100", label: "接近正式成品，但仍需人工最终确认" }
    ],
    final_export_rules: [
      "overall_score < 80 不允许 final_export",
      "存在 P0 问题不允许 final_export",
      "存在假来源、伪造官方、伪造图片、未核验事实不允许 final_export",
      "draft 可以生成，但必须标记 draft",
      "final 必须人工确认"
    ]
  };
}

export function qualityRubricMarkdown(rubric: ReturnType<typeof buildQualityRubric>) {
  return [
    "# Sandun Quality Rubric V1",
    "",
    "## Dimensions",
    "",
    ...Object.entries(rubric.scoring).map(([key, value]) => `- ${key}: ${value.description} (0-10)`),
    "",
    "## Levels",
    "",
    ...rubric.quality_levels.map(item => `- ${item.range}: ${item.label}`),
    "",
    "## Export Gate",
    "",
    ...rubric.final_export_rules.map(item => `- ${item}`)
  ].join("\n");
}

export function buildCritiqueReport(input: QualityInput, deckSpec: ReturnType<typeof buildDeckSpec>) {
  const score = scoreFromQualityCheck(input.qualityCheck);
  const pages = deckSpec.slides;
  const missingMaterials = list(input.executorPackage.brain_context?.missing_materials);
  const hasDeck = hasRealDeck(input.draftDeckPath);
  const slideIssues = pages.flatMap(slide => {
    const issues = [
      {
        slide_id: slide.slide_id,
        issue_type: "evidence",
        severity: slide.evidence_needed.length ? "P1" : "P0",
        issue_description: slide.evidence_needed.length ? "本页证据仍处于待核验状态。" : "本页缺少明确证据需求。",
        suggested_fix: "补充真实来源、截图、地图、门票/开放时间或用户确认材料。"
      }
    ];
    if (!slide.visual_intent || /占位|placeholder|待/.test(slide.visual_intent)) {
      issues.push({
        slide_id: slide.slide_id,
        issue_type: "asset_quality",
        severity: "P1",
        issue_description: "页面视觉仍依赖占位或未核验素材说明。",
        suggested_fix: "补真实图片、路线图或授权素材；无素材时保留占位并明确待补。"
      });
    }
    return issues;
  });
  return {
    schema_version: "SANDUN_CRITIQUE_REPORT_V1",
    generated_at: nowIso(),
    target_deck: input.draftDeckPath || "",
    reviewed_as: "draft",
    overall_score: score,
    quality_level: qualityLevel(score),
    strongest_points: [
      "已形成可审阅的页面结构。",
      "已保留 draft / 待核验边界。",
      "已阻断正式导出。"
    ],
    major_issues: [
      "缺真实素材与可引用来源，作品仍有草案感。",
      "页面版式和视觉系统还没有 template/master/placeholder 级统一。",
      "标题和内容需要继续压缩成更像观点句的表达。"
    ],
    slide_level_issues: slideIssues,
    ai_slop_signals: [
      "若继续使用泛化风景占位和模板化语句，会显得像 AI 草稿。",
      "没有真实图片时，不应制造高级感或伪装已实地核验。"
    ],
    missing_assets: missingMaterials.length ? missingMaterials : ["真实图片", "地图/路线图", "可验证来源"],
    missing_evidence: missingMaterials,
    layout_problems: [
      "尚未绑定模板画像和 placeholder。",
      "缺少统一组件库约束。"
    ],
    content_logic_problems: [
      "目前能人工审阅，但还不能作为正式攻略或高质量汇报成品。",
      "部分页面仍是建议清单，需要更明确的用户决策点。"
    ],
    risk_boundary_problems: [
      "source_status=unverified_draft。",
      "不得声明联网搜索成功、官方核验成功或图片真实。"
    ],
    whether_user_can_review: score >= 70,
    whether_export_final_allowed: false,
    generated_formal_pptx: false,
    final_label_used: false,
    fake_public_search_used: false,
    fake_real_image_used: false,
    draft_deck_exists: hasDeck
  };
}

export function critiqueReportMarkdown(report: ReturnType<typeof buildCritiqueReport>) {
  return [
    "# Sandun Critique Report V1",
    "",
    `- target_deck: ${report.target_deck}`,
    `- reviewed_as: ${report.reviewed_as}`,
    `- overall_score: ${report.overall_score}`,
    `- quality_level: ${report.quality_level}`,
    `- whether_user_can_review: ${String(report.whether_user_can_review)}`,
    `- whether_export_final_allowed: ${String(report.whether_export_final_allowed)}`,
    "",
    "## Major Issues",
    "",
    ...report.major_issues.map(item => `- ${item}`),
    "",
    "## Slide Level Issues",
    "",
    ...report.slide_level_issues.map(item => `- ${item.slide_id} [${item.severity}/${item.issue_type}]: ${item.issue_description} 建议：${item.suggested_fix}`),
    "",
    "## Missing Assets",
    "",
    ...report.missing_assets.map(item => `- ${item}`)
  ].join("\n");
}

export function buildRepairPlan(input: QualityInput, critiqueReport: ReturnType<typeof buildCritiqueReport>) {
  const p0 = critiqueReport.slide_level_issues.filter(item => item.severity === "P0");
  const p1 = critiqueReport.slide_level_issues.filter(item => item.severity === "P1");
  return {
    schema_version: "SANDUN_REPAIR_PLAN_V1",
    generated_at: nowIso(),
    repair_id: `repair_${input.executorPackage.package_id || Date.now()}`,
    target_deck: input.draftDeckPath || "",
    repair_priority: p0.length ? "P0" : p1.length ? "P1" : "P2",
    global_repairs: [
      "补齐真实素材或明确所有占位图为待补素材。",
      "将页面标题改成更明确的观点句/任务句。",
      "建立模板画像与 placeholder 渲染后再进入下一轮。"
    ],
    slide_repairs: critiqueReport.slide_level_issues.map(issue => ({
      slide_id: issue.slide_id,
      priority: issue.severity,
      action: issue.suggested_fix,
      reason: issue.issue_description
    })),
    required_assets: critiqueReport.missing_assets,
    required_user_inputs: [
      "确认是否要真实出行/汇报，还是仅做路线灵感。",
      "补 5-10 张真实图片或授权素材。",
      "补出发地、日期、预算、体力偏好。"
    ],
    can_auto_repair: p0.length === 0,
    needs_user_materials: critiqueReport.missing_assets.length > 0,
    next_action: p0.length ? "先补缺失资料，再重新生成 reviewed draft。" : "可以进入模板画像与 placeholder 渲染。"
  };
}

export function repairPlanMarkdown(plan: ReturnType<typeof buildRepairPlan>) {
  return [
    "# Sandun Repair Plan V1",
    "",
    `- repair_id: ${plan.repair_id}`,
    `- target_deck: ${plan.target_deck}`,
    `- repair_priority: ${plan.repair_priority}`,
    `- can_auto_repair: ${String(plan.can_auto_repair)}`,
    `- needs_user_materials: ${String(plan.needs_user_materials)}`,
    `- next_action: ${plan.next_action}`,
    "",
    "## Global Repairs",
    "",
    ...plan.global_repairs.map(item => `- ${item}`),
    "",
    "## Slide Repairs",
    "",
    ...plan.slide_repairs.map(item => `- ${item.slide_id} [${item.priority}]: ${item.action}`),
    "",
    "## Required User Inputs",
    "",
    ...plan.required_user_inputs.map(item => `- ${item}`)
  ].join("\n");
}

export function buildExportGate(input: QualityInput, critiqueReport: ReturnType<typeof buildCritiqueReport>, repairPlan: ReturnType<typeof buildRepairPlan>) {
  const score = critiqueReport.overall_score;
  const hasP0 = repairPlan.repair_priority === "P0";
  const blockReasons = [
    ...(score < 80 ? [`overall_score ${score} < 80`] : []),
    ...(hasP0 ? ["存在 P0 问题"] : []),
    "source_status 为 unverified_draft",
    "缺真实素材或资料核验",
    "final 必须人工确认"
  ];
  return {
    schema_version: "SANDUN_EXPORT_GATE_V1",
    generated_at: nowIso(),
    target_deck: input.draftDeckPath || "",
    draft_generated: Boolean(input.draftDeckPath && existsSync(input.draftDeckPath)),
    final_export_allowed: false,
    export_allowed: false,
    block_reasons: blockReasons,
    required_repairs: repairPlan.global_repairs,
    user_confirmation_required: true,
    generated_formal_pptx: false,
    final_label_used: false,
    fake_public_search_used: false,
    fake_real_image_used: false
  };
}

export function exportGateMarkdown(gate: ReturnType<typeof buildExportGate>) {
  return [
    "# Sandun Export Gate V1",
    "",
    `- target_deck: ${gate.target_deck}`,
    `- draft_generated: ${String(gate.draft_generated)}`,
    `- final_export_allowed: ${String(gate.final_export_allowed)}`,
    `- export_allowed: ${String(gate.export_allowed)}`,
    `- user_confirmation_required: ${String(gate.user_confirmation_required)}`,
    "",
    "## Block Reasons",
    "",
    ...gate.block_reasons.map(item => `- ${item}`),
    "",
    "## Required Repairs",
    "",
    ...gate.required_repairs.map(item => `- ${item}`)
  ].join("\n");
}

export function buildReviewedDraftResult(input: {
  writebackRoot: string;
  draftDeckPath?: string;
  reviewedDraftPath?: string;
  critiqueReportPath: string;
  repairPlanPath: string;
  exportGatePath: string;
  critiqueReport: ReturnType<typeof buildCritiqueReport>;
}) {
  return {
    schema_version: "SANDUN_REVIEWED_DRAFT_RESULT_V1",
    generated_at: nowIso(),
    writeback_root: input.writebackRoot,
    target_deck: input.draftDeckPath || "",
    reviewed_draft_path: input.reviewedDraftPath || "",
    reviewed_draft_generated: Boolean(input.reviewedDraftPath && existsSync(input.reviewedDraftPath)),
    critique_report_path: input.critiqueReportPath,
    repair_plan_path: input.repairPlanPath,
    export_gate_path: input.exportGatePath,
    status: "quality_review_generated_draft_needs_repair",
    current_matter_card: {
      title: "赣州一日游 PPT",
      status: "已生成质量审稿 / draft / 待修复",
      primary_buttons: ["查看审稿报告", "继续修复", "打开 PPT"],
      secondary_buttons: ["查看 repair_plan", "补素材 / 补资料"]
    },
    output_root_name: basename(input.writebackRoot),
    overall_score: input.critiqueReport.overall_score,
    quality_level: input.critiqueReport.quality_level,
    final_export_allowed: false,
    export_allowed: false,
    generated_formal_pptx: false
  };
}

