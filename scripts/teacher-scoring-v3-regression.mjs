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
const task = {
  scenario: "teacher_courseware", planningMode: "professional", generationMode: "chapter_prep",
  schoolStage: "小学", grade: "一年级", subject: "数学", topic: "10以内的加减法", duration: "40分钟",
  textbook: "教师上传教材", chapter: "第三单元", uploadedFiles: [], pastedMaterials: "", teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" },
  textbookIdentity: { displayName: "教师上传教材", sourceAssetId: "asset-1", verificationStatus: "asset_verified" },
  chapterIdentity: { chapter: "第三单元", pageStart: 30, pageEnd: 36, verificationStatus: "asset_verified" },
};
const source = { sourceId: "asset-1", assetId: "asset-1", sha256: "abc", storageStatus: "persisted", sourceType: "uploaded_file", fileType: "pdf", title: "教材.pdf", rawText: "教材", normalizedText: "教材", extractedAt: new Date().toISOString(), confidence: 90, parseStatus: "parsed", warnings: [] };
const evidenceMaps = slides.map((slide, index) => ({ slideId: `s${index}`, pagePlanId: `p${index}`, role: slide.module, coreClaim: slide.title, mustProve: slide.title, evidenceNeeds: [], matchedEvidenceBlocks: [], evidenceCoverage: 90, sourceConfidence: 90, unsupportedClaims: [], lowConfidenceWarnings: [], userConfirmationNeeded: [] }));
const good = scoreTeacherDeckV3({ scene: "teacher_courseware", task, slides, sources: [source], evidenceMaps, engineering: { rendered: true, screenshots: true, ooxmlEditable: true, geometryPassed: true, editableObjectCoverage: 1 }, subjectReview: { completed: true, issueCount: 0 }, imageSemanticReview: { completed: true, issueCount: 0 }, teacherTrial: { trialCompleted: true, reviewedByTeacher: true } });
assert.equal(good.p0.length, 0);
assert.equal(good.classroomReady, true);
assert.ok(good.scores.total >= 90);

const weak = scoreTeacherDeckV3({ scene: "teacher_courseware", task: { ...task, textbookIdentity: { displayName: "教师填写", verificationStatus: "teacher_confirmed" }, chapterIdentity: { chapter: "第三单元", verificationStatus: "teacher_confirmed" } }, slides, sources: [], evidenceMaps: evidenceMaps.map((map) => ({ ...map, evidenceCoverage: 20, unsupportedClaims: ["无来源主张"] })) });
assert.ok(weak.p0.some((issue) => issue.includes("教材仅由教师文字确认")));
assert.ok(weak.p0.some((issue) => issue.includes("证据平均覆盖率")));
assert.equal(weak.classroomReady, false);
console.log(JSON.stringify({ ok: true, good: good.scores, weak: weak.scores, weakP0: weak.p0 }, null, 2));
fs.rmSync(tempDir, { recursive: true, force: true });
