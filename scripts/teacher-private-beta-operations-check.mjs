import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const policyPath = path.join(root, "project-state", "teacher-agentppt.private-beta-operations.json");
const issueBoardPath = path.join(root, "project-state", "teacher-agentppt.issue-board.json");
const packagePath = path.join(root, "package.json");
const guidePath = path.join(root, "docs", "PRIVATE_BETA_OPERATIONS_20260718.md");
const reportPath = path.join(root, "artifacts", "teacher-private-beta", "operations-validation.json");
const checks = [];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function record(id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), detail });
}

function sameSet(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((item) => actual.includes(item));
}

let policy;
let issueBoard;
let packageJson;
let guide = "";
try {
  policy = readJson(policyPath);
  issueBoard = readJson(issueBoardPath);
  packageJson = readJson(packagePath);
  guide = fs.readFileSync(guidePath, "utf8");
} catch (error) {
  console.error(`private beta operations: FAIL (${error.message})`);
  process.exit(1);
}

record(
  "schema",
  policy.schemaVersion === "teacher-agentppt-private-beta-operations/v1",
  `schema=${policy.schemaVersion || "missing"}`,
);

const expectedSubjects = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理"];
record(
  "subject-scope",
  sameSet(policy.scope?.coreSubjects, expectedSubjects),
  `coreSubjects=${policy.scope?.coreSubjects?.length ?? 0}/8`,
);

const cohorts = policy.cohorts || [];
const ceilings = cohorts.map((item) => item.inviteCeiling);
record(
  "cohort-order",
  cohorts.length === 3 && JSON.stringify(ceilings) === JSON.stringify([100, 300, 1000]),
  `cohorts=${ceilings.join(" -> ") || "missing"}`,
);
record(
  "cohort-observation",
  cohorts.every((item) => item.minimumObservationDays >= 3 && item.promotion?.requiresAllGlobalGoNoGoRules === true),
  "every cohort requires an observation window and global go/no-go rules",
);
record(
  "teacher-concurrency-quota",
  cohorts.every((item) => item.quotas?.runningGenerationJobsPerTeacher === 1),
  "one running generation job per teacher",
);
record(
  "no-image-default",
  policy.scope?.imageGenerationDefault === "disabled"
    && cohorts.every((item) => item.quotas?.imageDecksPerTeacherPerDay === 0),
  "image generation is disabled in all cohorts",
);

const feedback = policy.feedback || {};
const feedbackEntryIds = (feedback.entryPoints || []).map((item) => item.id);
record(
  "feedback-entry-contract",
  feedbackEntryIds.includes("global-feedback") && feedbackEntryIds.includes("task-feedback"),
  `entryPoints=${feedbackEntryIds.join(", ") || "missing"}`,
);
record(
  "feedback-triage-contract",
  (feedback.categories || []).length >= 8
    && (feedback.autoContext || []).includes("versionId")
    && (feedback.autoContext || []).includes("taskId")
    && (feedback.statuses || []).includes("resolved"),
  `categories=${feedback.categories?.length ?? 0}; autoContext=${feedback.autoContext?.length ?? 0}`,
);

const severities = policy.support?.serviceLevels || [];
record(
  "support-sla",
  sameSet(severities.map((item) => item.severity), ["P0", "P1", "P2", "P3"])
    && severities.every((item) => item.acknowledgeMinutes > 0 && item.targetMitigationMinutes >= item.acknowledgeMinutes),
  `severityLevels=${severities.length}/4`,
);

record(
  "incident-and-rollback",
  (policy.incidents?.hardStopTriggers || []).length >= 6
    && (policy.incidents?.rollbackProcedure || []).length >= 6,
  `hardStops=${policy.incidents?.hardStopTriggers?.length ?? 0}; rollbackSteps=${policy.incidents?.rollbackProcedure?.length ?? 0}`,
);

const metricIds = [...(policy.metrics?.system || []), ...(policy.metrics?.product || [])].map((item) => item.id);
const requiredMetrics = [
  "generation_completion_rate",
  "generation_latency_p50",
  "generation_latency_p90",
  "export_success_rate",
  "artifact_redownload_integrity",
  "activation_rate",
  "teacher_reuse_intent",
  "usable_within_15_min_edit",
  "severe_textbook_mismatch",
  "feedback_sla_compliance",
];
record(
  "metrics",
  requiredMetrics.every((id) => metricIds.includes(id)),
  `requiredMetrics=${requiredMetrics.filter((id) => metricIds.includes(id)).length}/${requiredMetrics.length}`,
);
record(
  "go-no-go",
  (policy.goNoGo?.universalNoGo || []).length >= 8
    && (policy.goNoGo?.promotionRequires || []).length >= 5,
  `noGoRules=${policy.goNoGo?.universalNoGo?.length ?? 0}; promotionRules=${policy.goNoGo?.promotionRequires?.length ?? 0}`,
);

record(
  "trial-score-provenance",
  policy.teacherTrial?.automaticMaximum === 95
    && policy.teacherTrial?.structuredEvidencePoints === 5
    && policy.teacherTrial.automaticMaximum + policy.teacherTrial.structuredEvidencePoints === 100
    && (policy.teacherTrial?.rubric || []).length === 5,
  `automatic=${policy.teacherTrial?.automaticMaximum ?? "missing"}; teacher=${policy.teacherTrial?.structuredEvidencePoints ?? "missing"}`,
);

const retention = policy.dataGovernance?.retentionDays || {};
record(
  "data-governance",
  policy.dataGovernance?.modelTraining?.includes("explicit opt-in")
    && policy.dataGovernance?.deletionSlaDays <= 7
    && retention.sourceMaterials > 0
    && retention.applicationLogs > 0
    && retention.feedbackRecords > 0
    && (policy.dataGovernance?.prohibitedUploads || []).length >= 6,
  `deletionSlaDays=${policy.dataGovernance?.deletionSlaDays ?? "missing"}; prohibitedUploads=${policy.dataGovernance?.prohibitedUploads?.length ?? 0}`,
);

const roles = (policy.roles || []).map((item) => item.role);
record(
  "accountability",
  ["beta_owner", "operations_on_call", "engineering_on_call", "content_qa", "teacher_success", "privacy_owner", "data_analyst"].every((role) => roles.includes(role)),
  `roles=${roles.length}/7`,
);

const requiredGuideSections = [
  "## Current Product Position",
  "## Cohort Design",
  "## Teacher-Facing Surface",
  "## Feedback and Support Loop",
  "## Go / No-Go Rules",
  "## Rollback and Recovery",
  "## Trial and Scoring",
  "## Data and Privacy",
  "## Roles",
  "## First Release Checklist",
];
record(
  "operations-guide",
  requiredGuideSections.every((section) => guide.includes(section)),
  `guideSections=${requiredGuideSections.filter((section) => guide.includes(section)).length}/${requiredGuideSections.length}`,
);

record(
  "package-command",
  packageJson.scripts?.["teacher-private-beta:check"] === "node scripts/teacher-private-beta-operations-check.mjs",
  `command=${packageJson.scripts?.["teacher-private-beta:check"] || "missing"}`,
);

const governanceIssue = (issueBoard.issues || []).find((issue) => issue.id === "BETA-OPERATIONS-001");
record(
  "tian-shu-issue",
  Boolean(governanceIssue)
    && governanceIssue.releaseGate === true
    && ["open", "in_progress_unverified", "blocked_external", "closed"].includes(governanceIssue.status),
  governanceIssue ? `status=${governanceIssue.status}; releaseGate=${governanceIssue.releaseGate}` : "missing",
);

const pass = checks.every((item) => item.pass);
const report = {
  schemaVersion: "teacher-agentppt-private-beta-operations-validation/v1",
  pass,
  policy: path.relative(root, policyPath).replaceAll(path.sep, "/"),
  guide: path.relative(root, guidePath).replaceAll(path.sep, "/"),
  cohortCeilings: ceilings,
  subjectCount: policy.scope?.coreSubjects?.length ?? 0,
  imageGenerationDefault: policy.scope?.imageGenerationDefault || null,
  currentDecision: policy.currentDecision || null,
  checks,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`teacher private beta operations: ${pass ? "PASS" : "FAIL"}`);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.id}: ${item.detail}`);
}
console.log(`report: ${path.relative(root, reportPath).replaceAll(path.sep, "/")}`);
if (!pass) process.exitCode = 1;
