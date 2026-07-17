import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  createTeacherTrialEvidence,
  teacherTrialRubricKeys,
  validateTeacherTrialEvidence,
} from "../lib/teacher-trial-evidence.ts";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const studio = read("components/TeacherSandunStudio.tsx");
const workbench = read("components/CanvasWorkbench.tsx");
const versionRoute = read("app/api/courseware-version/route.ts");

assert.deepEqual(teacherTrialRubricKeys, [
  "goalAchievement",
  "pacing",
  "interaction",
  "practiceFeedback",
  "teacherNotesUsability",
]);

const complete = createTeacherTrialEvidence({
  trialStartedAt: "2026-07-18T00:00:00.000Z",
  trialEndedAt: "2026-07-18T00:45:00.000Z",
  plannedDurationMinutes: 45,
  actualDurationMinutes: 45,
  classSize: 42,
  software: "WPS",
  device: "classroom projector",
  rubric: Object.fromEntries(teacherTrialRubricKeys.map((key) => [key, 4])),
  issues: ["page 8 pacing needs revision"],
  reuseDecision: "after_revision",
  teacherComment: "usable after one revision",
}, "teacher-contract-test");

assert.equal(validateTeacherTrialEvidence(complete).status, "complete");
assert.equal(validateTeacherTrialEvidence(complete).rubricAverage, 4);
assert.equal(validateTeacherTrialEvidence(null).status, "pending");

for (const marker of [
  'data-testid="teacher-trial-evidence"',
  'data-testid="teacher-trial-status"',
  "试讲开始时间",
  "试讲结束时间",
  "班级人数",
  "授课软件",
  "授课设备",
  "复用结论",
  "保存试讲证据并提交审核",
  "与课前自动评分分开记录",
]) assert.ok(studio.includes(marker), `missing teacher trial UI marker: ${marker}`);

assert.ok(workbench.includes('commitTeacherVersion("teacher_submit_for_review", trialEvidence ? { trialEvidence } : {})'));
assert.ok(workbench.includes("setTeacherTrialValidation(data.teacherTrialValidation)"));
assert.ok(versionRoute.includes("teacherTrialValidation"));
assert.ok(versionRoute.includes("trialCompleted: teacherTrialValidation.status === \"complete\""));

console.log(JSON.stringify({
  pass: true,
  rubricFields: teacherTrialRubricKeys.length,
  serverValidation: "complete",
  uiSubmission: "teacher_submit_for_review.payload.trialEvidence",
  automaticScoreSeparated: true,
}, null, 2));
