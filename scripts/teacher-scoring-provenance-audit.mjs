import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const tempDir = path.join(os.tmpdir(), `teacher-scoring-provenance-${process.pid}`);
fs.mkdirSync(tempDir, { recursive: true });

try {
  const transpile = (source) => ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const v2Path = path.join(tempDir, "v2.mjs");
  const v3Path = path.join(tempDir, "v3.mjs");
  fs.writeFileSync(v2Path, transpile(read("lib/teacher-deck-scoring.ts")));
  fs.writeFileSync(v3Path, transpile(read("lib/teacher-deck-scoring-v3.ts")).replace('"@/lib/teacher-deck-scoring"', '"./v2.mjs"'));
  const { scoreTeacherDeckV3 } = await import(`${pathToFileURL(v3Path).href}?v=${Date.now()}`);

  const slides = [
    { module: "M02", title: "学习目标", body: "学习目标", layout: "objectives", fontSize: 24 },
    { module: "M04", title: "概念解释", body: "概念解释", layout: "concept", fontSize: 24 },
    { module: "M07", title: "例题", body: "题目 步骤 结论", layout: "example", fontSize: 24 },
    { module: "M08", title: "练习", body: "练习 作答 反馈", layout: "practice", fontSize: 24 },
    { module: "M09", title: "总结", body: "总结 迁移 延伸 学生活动 独立选择 输出答案 解析式 列表 作图 反馈 自评 修正 核对 检查 标准 正确", layout: "summary", fontSize: 24 },
  ];
  const task = {
    scenario: "teacher_courseware", planningMode: "professional", generationMode: "chapter_prep",
    schoolStage: "高中", grade: "高二", subject: "物理", topic: "楞次定律", duration: "45分钟",
    textbook: "教师上传教材", chapter: "第三章", uploadedFiles: [], pastedMaterials: "",
    teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" },
    textbookIdentity: { displayName: "教师上传教材", sourceAssetId: "asset-1", verificationStatus: "asset_verified" },
    chapterIdentity: { chapter: "第三章", pageStart: 30, pageEnd: 36, verificationStatus: "asset_verified" },
  };
  const source = { sourceId: "asset-1", assetId: "asset-1", sha256: "abc", storageStatus: "persisted", sourceType: "uploaded_file", fileType: "pdf", title: "教材.pdf", rawText: "教材", normalizedText: "教材", extractedAt: new Date(0).toISOString(), confidence: 90, parseStatus: "parsed", warnings: [] };
  const evidenceMaps = slides.map((slide, index) => ({ slideId: `s${index}`, pagePlanId: `p${index}`, role: slide.module, coreClaim: slide.title, mustProve: slide.title, evidenceNeeds: [], matchedEvidenceBlocks: [], evidenceCoverage: 90, sourceConfidence: 90, unsupportedClaims: [], lowConfidenceWarnings: [], userConfirmationNeeded: [] }));
  const base = {
    scene: "teacher_courseware", task, slides, sources: [source], evidenceMaps,
    engineering: { rendered: true, screenshots: true, ooxmlEditable: true, geometryPassed: true, editableObjectCoverage: 1 },
    subjectReview: { completed: true, issueCount: 0 }, imageSemanticReview: { completed: true, issueCount: 0 },
  };
  const automatic = scoreTeacherDeckV3({ ...base, teacherTrial: { trialCompleted: false, reviewedByTeacher: false } });
  const workflowConfirmed = scoreTeacherDeckV3({ ...base, teacherTrial: { trialCompleted: true, reviewedByTeacher: true } });

  assert.equal(automatic.scores.total, 95, "automatic quality baseline must remain separate from the 5-point workflow confirmation");
  assert.equal(automatic.scores.teacherEfficiency, 0);
  assert.equal(automatic.requiresTeacherConfirmation, true);
  assert.equal(automatic.classroomReady, false);
  assert.equal(workflowConfirmed.scores.total, 100);
  assert.equal(workflowConfirmed.scores.teacherEfficiency, 5);
  assert.equal(workflowConfirmed.requiresTeacherConfirmation, false);
  assert.equal(automatic.commercialReady, false);
  assert.equal(workflowConfirmed.commercialReady, false);

  const commitSource = read("lib/courseware-commit.ts");
  const trialContractSource = read("lib/teacher-trial-evidence.ts");
  const versionRoute = read("app/api/courseware-version/route.ts");
  const exportRoute = read("app/api/export-pptx/route.ts");
  const studioSource = read("components/TeacherSandunStudio.tsx");
  const state = JSON.parse(read("project-state/teacher-agentppt.current.json"));
  const issueBoard = JSON.parse(read("project-state/teacher-agentppt.issue-board.json"));
  const openReleaseGates = issueBoard.issues.filter((issue) => issue.releaseGate && issue.status !== "closed");
  const provenance = {
    workflowSubmitMappedToTrial: commitSource.includes('operation === "teacher_submit_for_review"') && commitSource.includes("trialCompleted: submitted") && commitSource.includes("reviewedByTeacher: submitted"),
    versionReadinessMappedToTrial: versionRoute.includes('teacherTrial: { trialCompleted: source.teacherReadiness === "ready_for_teacher"'),
    exportReadinessMappedToTrial: exportRoute.includes('teacherTrial: { trialCompleted: source.teacherReadiness === "ready_for_teacher"'),
    reviewerIdentityPersisted: /reviewer(User)?Id|teacherReviewerId/.test(trialContractSource),
    trialDurationPersisted: /actualDurationMinutes/.test(trialContractSource) && /trialStartedAt/.test(trialContractSource) && /trialEndedAt/.test(trialContractSource),
    rubricResponsesPersisted: /teacherTrialRubricKeys/.test(trialContractSource) && /rubric/.test(trialContractSource),
    trialEntryUiAvailable: studioSource.includes("trialEvidence") && studioSource.includes("goalAchievement"),
    studentOutcomePersisted: /studentOutcome|learningGain|exitTicketResult/.test(trialContractSource),
  };
  assert.equal(provenance.workflowSubmitMappedToTrial, false, "workflow submission must not be treated as classroom trial evidence");
  assert.equal(provenance.versionReadinessMappedToTrial, false, "version API must score only structured trial evidence");
  assert.equal(provenance.exportReadinessMappedToTrial, false, "export must score only structured trial evidence");
  assert.equal(provenance.reviewerIdentityPersisted && provenance.trialDurationPersisted && provenance.rubricResponsesPersisted, true, "structured trial evidence contract must be complete");
  assert.equal(state.commercialReady, false, "project state cannot promote commercial readiness while release gates remain open");
  assert.ok(exportRoute.includes("commercialReady: false"), "export route must keep commercialReady false");
  assert.ok(openReleaseGates.length > 0, "baseline expects open release gates to remain visible");

  const blindSpots = [
    !provenance.reviewerIdentityPersisted && "真实试讲没有复核教师身份字段",
    !provenance.trialDurationPersisted && "真实试讲没有开始、结束或实际时长字段",
    !provenance.rubricResponsesPersisted && "真实试讲没有结构化量表回答",
    provenance.workflowSubmitMappedToTrial && "当前 5 分仍来自工作流提交状态",
    !provenance.trialEntryUiAvailable && "结构化试讲量表尚无教师端录入界面",
    !provenance.studentOutcomePersisted && "尚未记录学生学习结果指标",
  ].filter(Boolean);
  const report = {
    schemaVersion: "teacher-scoring-provenance-report/v1",
    measuredAt: new Date().toISOString(),
    baseline: {
      automaticScore: automatic.scores.total,
      automaticMaximum: 95,
      structuredTrialEvidencePoints: workflowConfirmed.scores.total - automatic.scores.total,
      combinedDisplayScore: workflowConfirmed.scores.total,
      automaticClassroomReady: automatic.classroomReady,
      commercialReady: workflowConfirmed.commercialReady,
    },
    provenance,
    releaseGates: { openCount: openReleaseGates.length, ids: openReleaseGates.map((issue) => issue.id) },
    blindSpots,
    verdict: blindSpots.length ? "provenance_contract_complete_capture_pending" : "provenance_complete",
  };
  if (process.argv.includes("--write-report")) {
    const outputDir = path.join(root, "artifacts", "teacher-scoring");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "scoring-provenance-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
