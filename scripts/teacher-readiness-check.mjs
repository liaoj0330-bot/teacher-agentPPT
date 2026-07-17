import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const runLocal = args.has("--run-local");
const strict = args.has("--strict");
const statePath = path.join(root, "project-state", "teacher-agentppt.current.json");
const issuePath = path.join(root, "project-state", "teacher-agentppt.issue-board.json");
const reportDir = path.join(root, "artifacts", "teacher-readiness");
const reportPath = path.join(reportDir, "readiness-report.json");

const checks = [];
const blockers = [];
const now = new Date().toISOString();

function check(id, ok, detail, metadata = {}) {
  checks.push({ id, ok: Boolean(ok), detail, ...metadata });
  return Boolean(ok);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    check(`file:${path.basename(file)}`, false, `无法读取或解析 ${path.relative(root, file)}: ${error.message}`);
    return null;
  }
}

function exists(relativePath) {
  const absolute = path.join(root, relativePath);
  return fs.existsSync(absolute);
}

function filesUnder(relativePath, predicate = () => true) {
  const base = path.join(root, relativePath);
  if (!fs.existsSync(base)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (predicate(full, entry.name)) out.push(full);
    }
  };
  walk(base);
  return out;
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/");
}

const state = readJson(statePath);
const issueBoard = readJson(issuePath);
const packageJson = readJson(path.join(root, "package.json"));

check(
  "state-schema",
  state?.schemaVersion === "teacher-agentppt-project-state/v1" && issueBoard?.schemaVersion === "teacher-agentppt-issue-board/v1",
  `项目状态与问题板 schema ${state?.schemaVersion || "missing"} / ${issueBoard?.schemaVersion || "missing"}`,
);
check(
  "local-rc-status",
  state?.verification?.status === "local_rc_verified" && state?.commercialReady === false,
  `当前状态=${state?.verification?.status || "missing"}，commercialReady=${String(state?.commercialReady)}`,
);
check(
  "entrypoint",
  state?.entry?.path === "/teacher-ai-ppt",
  `生产入口=${state?.entry?.path || "missing"}`,
);

const requiredScripts = [
  "lint",
  "build",
  "teacher-dynamic-pages:test",
  "teacher-lesson-orchestration:test",
  "teacher-sample-content:test",
  "teacher-edit-stress:e2e",
  "teacher-two-subject-delivery:e2e",
  "teacher-two-subject-browser:e2e",
  "teacher-render-scene:test",
  "teacher-subject-coverage:test",
  "teacher-multi-subject-visual:test",
  "teacher-material-matrix:test",
  "teacher-scoring-v3:test",
  "teacher-scoring-provenance:test",
];
const packageScripts = packageJson?.scripts || {};
const missingScripts = requiredScripts.filter((name) => !packageScripts[name]);
check(
  "required-test-contract",
  missingScripts.length === 0,
  missingScripts.length ? `缺少 npm 脚本: ${missingScripts.join(", ")}` : `已注册 ${requiredScripts.length} 个交付门禁脚本`,
  { scripts: requiredScripts },
);

const expectedInitialSubjects = ["数学", "化学", "生物", "历史", "地理", "英语"];
const expectedGoldenSubjects = ["物理", "语文"];
const milestone = state?.currentMilestone || {};
const initialSubjects = Array.isArray(milestone.initialSubjects) ? milestone.initialSubjects : [];
const goldenSubjects = Array.isArray(milestone.goldenSubjects) ? milestone.goldenSubjects : [];
const sameSet = (actual, expected) => actual.length === expected.length && expected.every((item) => actual.includes(item));
check(
  "initial-subject-contract-scope",
  sameSet(initialSubjects, expectedInitialSubjects) && milestone.automatedInitialContractCount === 8,
  `初级自动化合同=${initialSubjects.length}/6；含物理、语文共 ${milestone.automatedInitialContractCount ?? "missing"} 学科`,
  { subjects: initialSubjects, evidenceLevel: "deterministic_initial_contract" },
);
check(
  "browser-golden-scope",
  sameSet(goldenSubjects, expectedGoldenSubjects) && milestone.browserGoldenCount === 2,
  `真实浏览器金标=${goldenSubjects.length}/8，仅限 ${goldenSubjects.join("、") || "无"}`,
  { subjects: goldenSubjects, evidenceLevel: "browser_pptx_golden", explicitlyNotGolden: expectedInitialSubjects },
);

const scoringProvenancePath = path.join(root, "artifacts", "teacher-scoring", "scoring-provenance-report.json");
const scoringProvenance = fs.existsSync(scoringProvenancePath) ? readJson(scoringProvenancePath) : null;
const provenanceContractOk = scoringProvenance?.schemaVersion === "teacher-scoring-provenance-report/v1"
  && scoringProvenance?.baseline?.automaticScore === 95
  && scoringProvenance?.baseline?.automaticMaximum === 95
  && scoringProvenance?.baseline?.structuredTrialEvidencePoints === 5
  && scoringProvenance?.baseline?.commercialReady === false
  && scoringProvenance?.provenance?.workflowSubmitMappedToTrial === false
  && scoringProvenance?.provenance?.versionReadinessMappedToTrial === false
  && scoringProvenance?.provenance?.exportReadinessMappedToTrial === false
  && scoringProvenance?.provenance?.reviewerIdentityPersisted === true
  && scoringProvenance?.provenance?.trialDurationPersisted === true
  && scoringProvenance?.provenance?.rubricResponsesPersisted === true;
check(
  "scoring-provenance-evidence",
  provenanceContractOk,
  scoringProvenance
    ? `自动证据 ${scoringProvenance.baseline?.automaticScore}/95，真实试讲证据 ${scoringProvenance.baseline?.structuredTrialEvidencePoints}/5，commercialReady=${String(scoringProvenance.baseline?.commercialReady)}`
    : "缺少评分来源审计报告",
  { report: scoringProvenance ? relative(scoringProvenancePath) : null, verdict: scoringProvenance?.verdict || null },
);

const realSubjectReports = filesUnder("artifacts", (file, name) => name === "report.json" && /teacher-(three|six|multi)-subject-real/i.test(file)).map((file) => {
  try {
    return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return { file, data: null };
  }
});
const expectedExpandedSubjects = ["数学", "化学", "生物", "历史", "地理", "英语"];
const sixSubjectEntry = realSubjectReports.find(({ file }) => /teacher-six-subject-real[\\/]report\.json$/i.test(file));
const validSha256 = (value) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const expectedExternalScoreP0 = (issue) => typeof issue === "string" && /缺少真实渲染与逐页截图证据|缺少原生OOXML可编辑性证据/.test(issue);
const sixSubjectCases = Array.isArray(sixSubjectEntry?.data?.cases) ? sixSubjectEntry.data.cases : [];
const sixSubjectCaseValid = (item) => item
  && expectedExpandedSubjects.includes(item.subject)
  && item.sourceKind === "local_parsed_acceptance_fixture_not_external_truth"
  && item.sourceParsed === true
  && typeof item.versionId === "string" && item.versionId.length > 0
  && typeof item.artifactId === "string" && item.artifactId.length > 0
  && item.pageCount >= 12
  && item.lessonEventCount === 7
  && Number(item.byteSize) > 10_000
  && validSha256(item.sourceSha256)
  && validSha256(item.sha256)
  && Number(item.timingMs?.reopenScoreMs) > 0
  && item.scoreDecision === "blocked"
  && Number(item.p0Count) > 0
  && Array.isArray(item.scoreP0)
  && item.scoreP0.length === item.p0Count
  && item.scoreP0.every(expectedExternalScoreP0)
  && item.teacherReadiness === "ready_for_teacher"
  && item.engineeringStatus === "passed";
const sixSubjectPathValid = sixSubjectEntry?.data?.schema === "teacher-six-subject-real-e2e/v1"
  && sixSubjectEntry.data.pass === true
  && sixSubjectEntry.data.imageApiCalled === false
  && sixSubjectCases.length === expectedExpandedSubjects.length
  && sameSet(sixSubjectCases.map((item) => item.subject), expectedExpandedSubjects)
  && sixSubjectCases.every(sixSubjectCaseValid)
  && sixSubjectEntry.data.summary?.subjectCount === 6
  && sixSubjectEntry.data.summary?.passed === 6
  && sixSubjectEntry.data.summary?.failed === 0
  && sixSubjectEntry.data.summary?.totalPages === 93
  && sixSubjectEntry.data.summary?.totalLessonEvents === 42;
const passingExpandedSubjectReports = sixSubjectPathValid ? [sixSubjectEntry] : [];
const failedExpandedSubjectReports = realSubjectReports.filter(({ data }) => data?.pass !== true);
const expandedBrowserGolden = sixSubjectPathValid;
check(
  "six-subject-real-path",
  sixSubjectPathValid,
  sixSubjectPathValid
    ? "六科真实主链 6/6 通过：93 页、42 个课堂事件、耐久哈希/重开、无图片 API 调用；评分均保留 blocked 外部门禁。"
    : "缺少或未通过 teacher-six-subject-real/report.json 的逐科真实主链证据",
  {
    report: sixSubjectEntry ? relative(sixSubjectEntry.file) : null,
    subjects: sixSubjectCases.map((item) => item.subject),
    imageApiCalled: sixSubjectEntry?.data?.imageApiCalled ?? null,
    unexpectedP0: sixSubjectCases.flatMap((item) => (item.scoreP0 || []).filter((issue) => !expectedExternalScoreP0(issue)).map((issue) => ({ subject: item.subject, issue }))),
    evidenceLevel: "real_product_path_local_fixture",
    fixtureDisclaimer: sixSubjectEntry?.data?.fixtureDisclaimer || null,
  },
);

const deliveryRoot = path.join(root, "artifacts", "teacher-two-subject-delivery");
const pptxFiles = filesUnder("artifacts/teacher-two-subject-delivery", (file, name) => name.toLowerCase().endsWith(".pptx"));
const physics = pptxFiles.filter((file) => /物理|physics/i.test(path.basename(file)));
const chinese = pptxFiles.filter((file) => /语文|chinese/i.test(path.basename(file)));
const healthyPptx = pptxFiles.filter((file) => fs.statSync(file).size > 10_000);
check("golden-physics-artifact", physics.length > 0 && physics.some((file) => fs.statSync(file).size > 10_000), `物理 PPTX ${physics.length} 份，非空产物 ${physics.filter((file) => fs.statSync(file).size > 10_000).length}`);
check("golden-chinese-artifact", chinese.length > 0 && chinese.some((file) => fs.statSync(file).size > 10_000), `语文 PPTX ${chinese.length} 份，非空产物 ${chinese.filter((file) => fs.statSync(file).size > 10_000).length}`);
check("delivery-report", exists("artifacts/teacher-two-subject-delivery/report.json") || filesUnder("artifacts/teacher-two-subject-delivery", (_, name) => name === "report.json").length > 0, "双学科交付报告存在");
const exportFiles = filesUnder("artifacts/courseware-exports", (file) => fs.statSync(file).size > 0);
check("durable-artifacts", exportFiles.length > 0, `持久化导出目录包含 ${exportFiles.length} 个非空文件`);
const screenshotRuns = fs.existsSync(deliveryRoot)
  ? fs.readdirSync(deliveryRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory() && /production.*screenshot/i.test(entry.name)).map((entry) => path.join(deliveryRoot, entry.name))
  : [];
const latestScreenshotRun = screenshotRuns.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const screenshots = latestScreenshotRun ? filesUnder(relative(latestScreenshotRun), (file, name) => /\.(png|jpg|jpeg)$/i.test(name)) : [];
check("production-screenshots", screenshots.length >= 4, latestScreenshotRun ? `${path.basename(latestScreenshotRun)} 包含 ${screenshots.length} 张验收截图` : "未找到 production screenshot 运行目录", { latestRun: latestScreenshotRun ? relative(latestScreenshotRun) : null });
const browserReports = filesUnder("artifacts/teacher-full-lesson-samples", (file, name) => name === "report.json");
const browserGoldenReports = browserReports.map((file) => {
  try {
    return { file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return { file, data: null };
  }
}).filter(({ data }) => data?.base && data?.pass === true);
const latestBrowserGolden = browserGoldenReports.sort((a, b) => fs.statSync(b.file).mtimeMs - fs.statSync(a.file).mtimeMs)[0];
const browserCases = latestBrowserGolden?.data?.cases || [];
const browserGoldenOk = browserCases.length >= 2 && browserCases.every((item) => item.pageCount >= 14 && item.eventCount >= 6 && item.teacherReadiness === "ready_for_teacher") && !(latestBrowserGolden?.data?.consoleErrors || []).length;
check("browser-golden-report", browserGoldenOk, latestBrowserGolden ? `${path.basename(path.dirname(latestBrowserGolden.file))}：${browserCases.length} 门课、${browserCases.map((item) => item.pageCount).join("/")} 页、consoleErrors=${(latestBrowserGolden.data.consoleErrors || []).length}` : "未找到通过的生产浏览器黄金报告", { report: latestBrowserGolden ? relative(latestBrowserGolden.file) : null });

const releaseIssues = Array.isArray(issueBoard?.issues) ? issueBoard.issues.filter((issue) => issue.releaseGate && issue.status !== "closed") : [];
const localIssues = releaseIssues.filter((issue) => issue.status !== "blocked_external" && issue.status !== "paused_non_blocking");
const externalIssues = releaseIssues.filter((issue) => issue.status === "blocked_external");
for (const issue of localIssues) blockers.push({ id: issue.id, class: "local", status: issue.status, summary: issue.summary });
for (const issue of externalIssues) blockers.push({ id: issue.id, class: "external", status: issue.status, summary: issue.summary, externalNeeds: issue.externalNeeds || [] });
check("issue-gates", localIssues.length === 0, localIssues.length ? `仍有 ${localIssues.length} 个本地 release gate 未关闭` : "没有未关闭的本地 release gate", { localIssues: localIssues.map((issue) => issue.id), externalIssues: externalIssues.map((issue) => issue.id) });

const verificationCommands = state?.verification?.commands || [];
check("state-evidence", Array.isArray(verificationCommands) && verificationCommands.length >= 5, `状态页记录 ${verificationCommands.length} 条回归证据`, { commands: verificationCommands });

const localCommands = [
  ["lint", "npm", ["run", "lint"]],
  ["dynamic-pages", "npm", ["run", "teacher-dynamic-pages:test"]],
  ["render-scene", "npm", ["run", "teacher-render-scene:test"]],
  ["subject-coverage", "npm", ["run", "teacher-subject-coverage:test"]],
  ["multi-subject-visual", "npm", ["run", "teacher-multi-subject-visual:test"]],
  ["material-matrix", "npm", ["run", "teacher-material-matrix:test"]],
  ["scoring-v3", "npm", ["run", "teacher-scoring-v3:test"]],
  ["scoring-provenance", "npm", ["run", "teacher-scoring-provenance:test"]],
];
const commandResults = [];
if (runLocal) {
  for (const [id, command, commandArgs] of localCommands) {
    const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
    const result = spawnSync(executable, commandArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
    const output = `${result.stdout || ""}${result.stderr || ""}`.trim().split(/\r?\n/).slice(-6).join("\n");
    const ok = result.status === 0;
    const error = result.error?.message || null;
    commandResults.push({ id, command: `${command} ${commandArgs.join(" ")}`, ok, exitCode: result.status, error, output });
    check(`run:${id}`, ok, ok ? `${id} 通过` : `${id} 失败 (exit ${result.status ?? "spawn"}${error ? `: ${error}` : ""})`, { command: `${command} ${commandArgs.join(" ")}` });
  }
}

const localPassed = checks.every((item) => item.ok);
const externalBlockerCount = externalIssues.length;
const readiness = localPassed ? (externalBlockerCount ? "local_rc_external_gates" : "ready_for_release") : "local_checks_failed";
const report = {
  schemaVersion: "teacher-readiness-report/v2",
  checkedAt: now,
  readiness,
  localChecksPassed: localPassed,
  externalBlockerCount,
  root,
  state: { status: state?.status || null, verification: state?.verification?.status || null, commercialReady: state?.commercialReady ?? null },
  checks,
  blockers,
  evidenceLevels: {
    deterministicInitialContracts: {
      status: sameSet(initialSubjects, expectedInitialSubjects) ? "verified" : "missing",
      subjectCount: initialSubjects.length,
      subjects: initialSubjects,
    },
    browserPptxGolden: {
      status: goldenSubjects.length === 2 ? "verified_two_subjects_only" : "inconsistent",
      subjectCount: goldenSubjects.length,
      subjects: goldenSubjects,
    },
    expandedSubjectRealPath: {
      status: expandedBrowserGolden ? "verified" : "not_verified",
      passingReports: passingExpandedSubjectReports.map(({ file }) => relative(file)),
      failedReports: failedExpandedSubjectReports.map(({ file, data }) => ({
        report: relative(file),
        error: data?.error || "report did not pass",
        caseCount: Array.isArray(data?.cases) ? data.cases.length : 0,
      })),
      explicitClaim: expandedBrowserGolden
        ? "Six-subject real product path passed with deterministic local parsed fixtures; this is not textbook-truth or teacher-trial evidence."
        : "The six initial subjects do not have browser/PPTX golden evidence.",
    },
    scoring: {
      status: provenanceContractOk ? "provenance_contract_verified_capture_gaps_remain" : "provenance_unverified",
      automaticMaximum: scoringProvenance?.baseline?.automaticMaximum ?? null,
      structuredTeacherEvidencePoints: scoringProvenance?.baseline?.structuredTrialEvidencePoints ?? null,
      blindSpots: scoringProvenance?.blindSpots || [],
    },
  },
  localEvidenceGaps: [
    ...(!expandedBrowserGolden ? [{ id: "EXPANDED-SUBJECT-REAL-PATH", detail: "数学、化学、生物、历史、地理、英语尚无通过的真实产品主链报告。" }] : []),
    ...(scoringProvenance?.provenance?.trialEntryUiAvailable === false ? [{ id: "TEACHER-TRIAL-UI", detail: "结构化教师试讲量表尚无教师端录入界面。" }] : []),
    ...(scoringProvenance?.provenance?.studentOutcomePersisted === false ? [{ id: "STUDENT-OUTCOME-EVIDENCE", detail: "学生学习结果指标尚未持久化。" }] : []),
  ],
  externalEvidenceGaps: [
    { id: "TEXTBOOK-TRUTH", detail: sixSubjectEntry?.data?.fixtureDisclaimer || "六科尚未使用外部真实教材来源完成核验。" },
    { id: "TARGET-OFFICE", detail: "WPS/PowerPoint 目标机字体、换行、投影和乱码尚未完成实机验收。" },
    { id: "TEACHER-TRIAL", detail: "六科尚未由真实教师完成一轮 45 分钟过课并提交结构化学习结果。" },
  ],
  artifacts: { physics: physics.map(relative), chinese: chinese.map(relative), healthyPptx: healthyPptx.map(relative), durableCount: exportFiles.length, latestScreenshotRun: latestScreenshotRun ? relative(latestScreenshotRun) : null, screenshotCount: screenshots.length },
  commandResults,
};
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(`teacher readiness: ${readiness}`);
console.log(`local checks: ${localPassed ? "PASS" : "FAIL"}; external blockers: ${externalBlockerCount}`);
for (const item of checks) console.log(`${item.ok ? "PASS" : "FAIL"} ${item.id}: ${item.detail}`);
if (externalIssues.length) console.log(`external gates: ${externalIssues.map((issue) => issue.id).join(", ")}`);
console.log(`report: ${relative(reportPath)}`);

if (!localPassed || (strict && externalBlockerCount > 0)) process.exitCode = 1;
