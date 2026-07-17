import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { pathToFileURL } from "node:url";

const tempDir = path.join(os.tmpdir(), `teacher-scoring-v3-${process.pid}`);
fs.mkdirSync(tempDir, { recursive: true });
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const v2Path = path.join(tempDir, "v2.mjs");
const v3Path = path.join(tempDir, "v3.mjs");
fs.writeFileSync(v2Path, transpile(fs.readFileSync(path.join(process.cwd(), "lib", "teacher-deck-scoring.ts"), "utf8")));
const v3Source = fs.readFileSync(path.join(process.cwd(), "lib", "teacher-deck-scoring-v3.ts"), "utf8").replace('"@/lib/teacher-deck-scoring"', '"./v2.mjs"');
fs.writeFileSync(v3Path, transpile(v3Source));
const { scoreTeacherDeckV3 } = await import(`${pathToFileURL(v3Path).href}?v=${Date.now()}`);

const slides = [
  { module: "M02", title: "学习目标", body: "学习目标", layout: "objectives", fontSize: 24 },
  { module: "M04", title: "概念解释", body: "概念解释", layout: "concept", fontSize: 24 },
  { module: "M07", title: "例题", body: "题目 步骤 结论", layout: "example", fontSize: 24 },
  { module: "M08", title: "练习", body: "练习 作答 反馈", layout: "practice", fontSize: 24 },
  { module: "M09", title: "总结", body: "总结 迁移 延伸 学生活动 独立选择 输出答案 解析式 列表 作图 反馈 自评 修正 核对 检查标准 正确", layout: "summary", fontSize: 24 },
];
const subjects = ["数学", "化学", "生物", "历史", "地理", "英语"];
const taskFor = (subject) => ({
  scenario: "teacher_courseware", planningMode: "professional", generationMode: "chapter_prep",
  schoolStage: "初中", grade: "八年级", subject, topic: `${subject}初级覆盖课`, duration: "45分钟",
  textbook: "教师上传教材", chapter: "第三单元", uploadedFiles: [], pastedMaterials: "", teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" },
  textbookIdentity: { displayName: "教师上传教材", sourceAssetId: "asset-1", verificationStatus: "asset_verified" },
  chapterIdentity: { chapter: "第三单元", pageStart: 30, pageEnd: 36, verificationStatus: "asset_verified" },
});
const source = { sourceId: "asset-1", assetId: "asset-1", sha256: "abc", storageStatus: "persisted", sourceType: "uploaded_file", fileType: "pdf", title: "教材.pdf", rawText: "教材", normalizedText: "教材", extractedAt: new Date().toISOString(), confidence: 90, parseStatus: "parsed", warnings: [] };
const evidenceMaps = slides.map((slide, index) => ({ slideId: `s${index}`, pagePlanId: `p${index}`, role: slide.module, coreClaim: slide.title, mustProve: slide.title, evidenceNeeds: [], matchedEvidenceBlocks: [], evidenceCoverage: 90, sourceConfidence: 90, unsupportedClaims: [], lowConfidenceWarnings: [], userConfirmationNeeded: [] }));
const lessonPlan = {
  totalMinutes: 45,
  events: ["activate", "inquire", "explain", "model", "practice", "feedback", "closing"].map((type, index) => ({
    id: `event-${index}`, type, title: type, durationMinutes: index === 6 ? 9 : 6,
    teacherAction: "组织课堂任务", studentAction: "完成可检查产出", expectedResponse: "说明判断依据",
    evidenceOfLearning: "学生提交的课堂产出", fallbackAction: "提供支架后再次作答", slideIds: [`s${Math.min(index, 4)}`],
  })),
};
const deliveryPack = {
  packId: "pack-1", planId: "plan-1", readiness: "ready_for_teacher_review",
  teacherNotes: [{ title: "练习", durationMinutes: 6, teacherAction: "组织", studentAction: "作答", expectedResponse: "给出依据", fallbackAction: "提供支架", slideIds: ["s4"], pageId: "s4", lessonEventId: "event-4", prompt: "请说明依据" }],
  answerKey: [{ eventId: "event-4", slideIds: ["s4"], answer: "示例答案", scoringCriteria: "结论正确且依据完整", sourceStatus: "derived_from_plan" }],
  boardPlan: { title: "板书", columns: [{ heading: "问题", items: ["核心问题"] }, { heading: "证据", items: ["课堂证据"] }, { heading: "结论", items: ["结论"] }] },
  homework: [{ level: "基础", task: "巩固练习", successCriteria: "答案与依据完整" }],
};
const goodInput = (subject) => ({
  scene: "teacher_courseware", task: taskFor(subject), slides: structuredClone(slides), sources: [source], evidenceMaps,
  engineering: { rendered: true, screenshots: true, ooxmlEditable: true, geometryPassed: true, editableObjectCoverage: 1 },
  subjectReview: { completed: true, issueCount: 0 }, imageSemanticReview: { completed: true, issueCount: 0 },
  teacherTrial: { trialCompleted: true, reviewedByTeacher: true }, lessonPlan, deliveryPack,
});

const subjectReports = Object.fromEntries(subjects.map((subject) => {
  const report = scoreTeacherDeckV3(goodInput(subject));
  assert.equal(report.p0.length, 0, `${subject}: unexpected P0 ${report.p0.join("; ")}`);
  assert.equal(report.classroomReady, true, `${subject}: must reach classroom_ready`);
  assert.equal(report.contract.decision, "classroom_ready");
  assert.ok(report.scores.total >= report.contract.thresholds.classroomReadyTotal);
  assert.equal(Object.values(report.contract.classroomDimensionPass).every(Boolean), true);
  return [subject, { total: report.scores.total, dimensions: report.scores, decision: report.contract.decision }];
}));

const assertP0 = (id, input, fragment) => {
  const report = scoreTeacherDeckV3(input);
  assert.ok(report.p0.some((issue) => issue.includes(fragment)), `${id}: missing P0 '${fragment}': ${report.p0.join("; ")}`);
  assert.equal(report.reviewCopyAllowed, false, `${id}: P0 must block review copy`);
  assert.equal(report.contract.decision, "blocked");
  return report;
};

const ambiguousTask = taskFor("数学");
ambiguousTask.materialPackage = { textbookMatch: { status: "ambiguous", requiresTeacherConfirmation: true } };
assertP0("ambiguous-source", { ...goodInput("数学"), task: ambiguousTask }, "教材来源存在歧义");
assertP0("missing-events", { ...goodInput("化学"), lessonPlan: { totalMinutes: 45, events: [] } }, "课堂事件链不完整");
assertP0("missing-deliverables", { ...goodInput("生物"), deliveryPack: null }, "教师交付包不完整");
const leakageSlides = structuredClone(slides);
leakageSlides[1].body += " 化学方程式 反应物 生成物";
assertP0("cross-subject-leakage", { ...goodInput("数学"), slides: leakageSlides }, "跨学科内容泄漏");
const repeatedSlides = structuredClone(slides).map((slide) => ({ ...slide, layout: "same-composition" }));
assertP0("repeated-composition", { ...goodInput("历史"), slides: repeatedSlides }, "版式构图重复");
assertP0("missing-render-evidence", { ...goodInput("地理"), engineering: { ooxmlEditable: true, geometryPassed: true, editableObjectCoverage: 1 } }, "缺少真实渲染");

const baseTask = taskFor("数学");
const weak = scoreTeacherDeckV3({ ...goodInput("数学"), task: { ...baseTask, textbookIdentity: { displayName: "教师填写", verificationStatus: "teacher_confirmed" }, chapterIdentity: { chapter: "第三单元", verificationStatus: "teacher_confirmed" } }, sources: [], evidenceMaps: evidenceMaps.map((map) => ({ ...map, evidenceCoverage: 20, unsupportedClaims: ["无来源主张"] })) });
assert.ok(weak.p0.some((issue) => issue.includes("教材仅由教师文字确认")));
assert.ok(weak.p0.some((issue) => issue.includes("证据平均覆盖率")));
assert.equal(weak.classroomReady, false);
console.log(JSON.stringify({ ok: true, subjects: subjectReports, thresholds: scoreTeacherDeckV3(goodInput("数学")).contract.thresholds, hardGateCases: 6, weak: weak.scores, weakP0: weak.p0 }, null, 2));
fs.rmSync(tempDir, { recursive: true, force: true });
