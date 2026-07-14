import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const temp = path.join(root, ".teacher-scoring-v2-shadow-test.mjs");
const source = fs.readFileSync(path.join(root, "lib", "teacher-deck-scoring.ts"), "utf8");
fs.writeFileSync(temp, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText);
const { scoreTeacherDeckV2 } = await import(`${pathToFileURL(temp).href}?v=${Date.now()}`);
const slide = (module, text, extra = {}) => ({ module, title: text, body: `${text}。完整课堂证据。`, layout: module, fontSize: 24, ...extra });
const m09 = "总结 作业延伸 学生活动：选择一个线性变化情境，写解析式、列表并作图。答案正确，表示完整。自评并根据反馈修正。检查标准明确。";
const golden = () => ({ scene: "teacher_courseware", slides: [slide("M02", "学习 目标"), slide("M04", "概念 解释"), slide("M07", "题目 步骤 结论"), slide("M08", "练习 作答 反馈"), slide("M09", m09)], engineering: { rendered: true, screenshots: true, ooxmlEditable: true, fontsPassed: true, geometryPassed: true, editableObjectCoverage: 1 }, visualReview: { completed: true }, teacherTrial: { trialCompleted: false, reviewedByTeacher: false } });
const cases = [
  ["golden", d => d, r => r.mode === "shadow" && r.scores.automaticTotal === 90 && r.requiresHumanReview],
  ["missing-m07", d => { d.slides[2].title = d.slides[2].body = "例题"; }, r => r.p0.some(x => x.includes("M07"))],
  ["missing-m08-feedback", d => { d.slides[3].title = d.slides[3].body = "练习 作答"; }, r => r.p0.some(x => x.includes("M08"))],
  ["missing-m09-student-action", d => { d.slides[4].title = d.slides[4].body = m09.replace("学生活动：选择", "教师展示"); }, r => r.p1.some(x => x.includes("M09_TEACHING_EVIDENCE_COMPLETE"))],
  ["missing-m09-answer", d => { d.slides[4].title = d.slides[4].body = m09.replace("写解析式、列表并作图。答案正确，表示完整。", "观察情境。"); }, r => r.p1.some(x => x.includes("M09_TEACHING_EVIDENCE_COMPLETE"))],
  ["missing-m09-feedback", d => { d.slides[4].title = d.slides[4].body = m09.replace("自评并根据反馈修正。", "完成任务。"); }, r => r.p1.some(x => x.includes("M09_TEACHING_EVIDENCE_COMPLETE"))],
  ["missing-m09-check", d => { d.slides[4].title = d.slides[4].body = m09.replace("答案正确，表示完整。", "提交作品。").replace("检查标准明确。", ""); }, r => r.p1.some(x => x.includes("M09_TEACHING_EVIDENCE_COMPLETE"))],
  ["small-font", d => { d.slides[1].fontSize = 10; }, r => r.p1.some(x => x.includes("字号"))],
  ["repeated-layout", d => { d.slides.push(slide("X1", "补充")); d.slides.forEach(x => x.layout = "same"); }, r => r.p2.some(x => x.includes("重复"))],
  ["math-screenshot", d => { d.engineering.editableObjectCoverage = 0.2; d.engineering.imageCoverageMax = 0.9; }, r => r.p1.some(x => x.includes("覆盖率"))],
  ["missing-objective", d => { d.slides[0].title = d.slides[0].body = "导入"; }, r => r.scores.structure < 20],
  ["internal-field", d => { d.slides[0].internalField = "secret"; }, r => r.p0.some(x => x.includes("内部字段"))],
  ["mojibake", d => { d.slides[0].body += " \uFFFD"; }, r => r.p0.some(x => x.includes("乱码"))],
  ["collision", d => { d.slides[2].collision = true; }, r => r.p1.some(x => x.includes("碰撞"))],
  ["courseware", d => { d.scene = "courseware"; }, r => !r.sceneEligible && r.scores.automaticTotal === 0],
  ["product-intro", d => { d.scene = "product_intro"; }, r => !r.sceneEligible && r.scores.automaticTotal === 0]
];
try {
  const matrix = cases.map(([id, mutate, verify]) => { const input = structuredClone(golden()); mutate(input); const report = scoreTeacherDeckV2(input); assert.equal(verify(report), true, id); return { id, score: report.scores.automaticTotal, p0: report.p0.length, p1: report.p1.length, p2: report.p2.length }; });
  console.log(JSON.stringify({ count: matrix.length, passed: matrix.length, matrix }, null, 2));
} finally { fs.rmSync(temp, { force: true }); }
