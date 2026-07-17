import assert from "node:assert/strict";
import { initialSubjectCoverageMatrix, resolveInitialSubjectCoverage, subjectCoverageSummary } from "../lib/ppt-agent/subject-coverage-matrix.ts";

const entries = Object.values(initialSubjectCoverageMatrix);
assert.equal(entries.length, 6, "initial matrix must cover six additional subjects");
assert.deepEqual(entries.map((entry) => entry.subject), ["数学", "化学", "生物", "历史", "地理", "英语"]);
assert.equal(new Set(entries.map((entry) => entry.lesson.architecture)).size, 6, "each subject needs a distinct lesson architecture");

for (const entry of entries) {
  assert.equal(entry.coverageLevel, "initial");
  assert.equal(entry.lesson.durationMinutes, 45);
  assert.equal(entry.textbookIntake.requiredFields.length, 10);
  assert.deepEqual(entry.textbookIntake.requiredSourceRoles, ["textbook", "teacher_guide", "lesson_plan", "exercise"]);
  assert.equal(entry.lesson.route.length, 7, `${entry.subject} must have a seven-step classroom route`);
  assert.equal(new Set(entry.lesson.route.map((step) => step.title)).size, 7, `${entry.subject} route titles must be distinct`);
  assert.ok(entry.lesson.route.every((step) => step.weight > 0 && step.teacherAction && step.studentAction && step.expectedResponse && step.evidenceOfLearning && step.fallbackAction));
  assert.deepEqual(entry.teacherDeliverables, ["teacherNotes", "answerKey", "boardPlan", "differentiatedHomework", "assessmentCriteria", "fallbackActions"]);
  assert.ok(entry.visualIntent.primaryForms.length >= 3);
  assert.ok(entry.visualIntent.nativeFallbacks.length >= 3);
  assert.ok(entry.visualIntent.avoid.length >= 2);
  assert.ok(entry.remainingHumanGates.length >= 2);
  assert.equal(resolveInitialSubjectCoverage(entry.subject)?.id, entry.id);
}

assert.equal(resolveInitialSubjectCoverage("English")?.id, "english");
assert.equal(resolveInitialSubjectCoverage("不存在学科"), undefined);

const summary = subjectCoverageSummary();
assert.deepEqual(summary, {
  coverageLevel: "initial",
  subjectCount: 6,
  textbookFieldCount: 10,
  sourceRoleCount: 4,
  architectureCount: 6,
  routeStepCount: 42,
  teacherDeliverableCount: 6,
  visualFormCount: 24,
  subjects: ["数学", "化学", "生物", "历史", "地理", "英语"],
});

console.log(JSON.stringify({ pass: true, summary, subjects: entries.map((entry) => ({ subject: entry.subject, architecture: entry.lesson.architecture, routeSteps: entry.lesson.route.length, visualForms: entry.visualIntent.primaryForms.length })) }, null, 2));
