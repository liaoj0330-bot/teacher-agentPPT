import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const baseUrl = process.env.APP_BASE_URL || "http://127.0.0.1:3002";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "brain-ppt-draft-"));
const runId = "ganzhou_day_trip_regression";
const runDir = path.join(root, "executor_runs", "sandun", runId);
fs.mkdirSync(runDir, { recursive: true });
const packagePath = path.join(runDir, "executor_package.json");

fs.writeFileSync(packagePath, JSON.stringify({
  schema_version: "YCSF_SANDUN_EXECUTOR_PACKAGE_V1",
  package_id: runId,
  created_at: new Date().toISOString(),
  status: "draft_ready",
  source_status: "unverified_draft",
  export_mode: "draft_only",
  final_allowed: false,
  export_allowed: false,
  matter: {
    matter_id: runId,
    title: "赣州一日游 PPT 初版",
    task_type: "ppt",
    topic: "赣州一日游",
    audience: "朋友",
    purpose: "简单介绍和行程建议",
    page_count_target: "6-8",
    output_level: "draft",
    current_stage: "draft_ppt_first"
  },
  brain_context: {
    user_request: "帮我做一份简单的赣州一日游 PPT，适合给朋友看，内容简单清楚，先做 6-8 页初版，不用太精美，能看就行。",
    available_materials: ["用户自然输入"],
    verified_materials: [],
    missing_materials: ["真实景点资料或官方来源", "开放时间核验", "门票价格核验"],
    style_rules: ["简单清楚", "适合朋友阅读", "轻旅行感", "清爽明亮"],
    quality_rules: ["6-8 页完整结构", "内容不能假装实时准确", "无来源时标记待核验"],
    forbidden_claims: ["不得伪造实时开放时间", "不得伪造门票价格", "不得伪造交通耗时", "不得声称已经官方核验", "不得标记 final"]
  },
  executor: {
    name: "sandun",
    mode: "draft_ppt_first",
    allowed_actions: ["generate_ppt_brief", "generate_page_plan_draft", "generate_draft_deck", "run_quality_check", "suggest_repair_plan"],
    blocked_actions: ["export_final_pptx"]
  },
  writeback: {
    expected_outputs: ["deck_spec.json", "deck_spec.md", "ppt_agent_input.json", "ppt_brief.json", "ppt_brief.md", "page_plan_draft.json", "page_plan_draft.md", "draft_deck.pptx", "draft_deck_report.md", "quality_rubric.json", "quality_rubric.md", "preflight_result.json", "missing_materials.md", "quality_check.json", "repair_suggestions.md", "critique_report.json", "critique_report.md", "repair_plan.json", "repair_plan.md", "export_status.json", "export_gate.json", "export_gate.md", "draft_deck_reviewed.pptx", "reviewed_draft_result.json"],
    writeback_path: runDir,
    status_update_target: runId
  }
}, null, 2), "utf8");

const response = await fetch(`${baseUrl}/api/brain-ppt/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ executorPackagePath: packagePath, rootPath: root, writebackId: runId })
});

const body = await response.json().catch(() => ({}));
assert(response.ok && body.ok !== false, `draft deck API failed: ${response.status} ${JSON.stringify(body)}`);

const draftDeck = path.join(runDir, "draft_deck.pptx");
const reviewedDraft = path.join(runDir, "draft_deck_reviewed.pptx");
const exportStatus = JSON.parse(fs.readFileSync(path.join(runDir, "export_status.json"), "utf8"));
const exportGate = JSON.parse(fs.readFileSync(path.join(runDir, "export_gate.json"), "utf8"));
const critiqueReport = JSON.parse(fs.readFileSync(path.join(runDir, "critique_report.json"), "utf8"));
const repairPlan = JSON.parse(fs.readFileSync(path.join(runDir, "repair_plan.json"), "utf8"));
const pagePlan = JSON.parse(fs.readFileSync(path.join(runDir, "page_plan_draft.json"), "utf8"));
assert(fs.existsSync(draftDeck), "draft_deck.pptx must exist");
assert(fs.existsSync(reviewedDraft), "draft_deck_reviewed.pptx must exist");
assert(fs.statSync(draftDeck).size > 20000, "draft_deck.pptx is unexpectedly small");
assert(fs.statSync(reviewedDraft).size > 20000, "draft_deck_reviewed.pptx is unexpectedly small");
assert(fs.existsSync(path.join(runDir, "deck_spec.json")), "deck_spec.json must exist");
assert(fs.existsSync(path.join(runDir, "quality_rubric.json")), "quality_rubric.json must exist");
assert(pagePlan.pages.length >= 6 && pagePlan.pages.length <= 8, "draft page count must be 6-8");
assert(exportStatus.draft_generated === true, "draft_generated must be true");
assert(exportStatus.export_allowed === false, "export_allowed must remain false");
assert(exportStatus.final_export_allowed === false, "final_export_allowed must remain false");
assert(exportStatus.reason === "draft_only_unverified_or_missing_verified_sources", "unexpected export status reason");
assert(critiqueReport.overall_score < 80, "critique score should keep the deck below final-export level");
assert(critiqueReport.whether_export_final_allowed === false, "critique must block final export");
assert(repairPlan.needs_user_materials === true, "repair plan should require user materials");
assert(exportGate.export_allowed === false, "export_gate export_allowed must remain false");
assert(exportGate.final_export_allowed === false, "export_gate final_export_allowed must remain false");

const zip = await JSZip.loadAsync(fs.readFileSync(reviewedDraft));
const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
const texts = [];
for (const name of slideFiles) {
  const xml = await zip.file(name).async("string");
  texts.push([...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map(match => match[1]).join(" "));
}
const joined = texts.join("\n");
assert(slideFiles.length === pagePlan.pages.length, "slide count should match page plan");
assert(joined.includes("赣州"), "PPTX should mention Ganzhou");
assert(/DRAFT|draft|待核验/.test(joined), "PPTX should mark draft or pending verification");
assert(!/已联网检索|已官方核验|官方确认/.test(joined), "PPTX must not fake search or official verification");
assert(!/final/i.test(joined), "PPTX visible text must not mark final");

console.log(JSON.stringify({
  passed: true,
  checkedAt: new Date().toISOString(),
  runId,
  writebackRoot: runDir,
  draftDeck,
  reviewedDraft,
  critiqueReport: path.join(runDir, "critique_report.json"),
  repairPlan: path.join(runDir, "repair_plan.json"),
  exportGate: path.join(runDir, "export_gate.json"),
  slideCount: slideFiles.length,
  exportAllowed: exportGate.export_allowed,
  finalExportAllowed: exportGate.final_export_allowed
}, null, 2));
