import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  clampTeacherBetaProgress,
  defaultTeacherBetaOperations,
  teacherBetaSupportedSubjects,
} from "../lib/teacher-beta-operations.ts";

const root = process.cwd();
const panel = fs.readFileSync(path.join(root, "components/TeacherBetaOperationsPanel.tsx"), "utf8");
const studio = fs.readFileSync(path.join(root, "components/TeacherSandunStudio.tsx"), "utf8");
const feedbackDialog = fs.readFileSync(path.join(root, "components/TeacherFeedbackDialog.tsx"), "utf8");

assert.deepEqual(teacherBetaSupportedSubjects, ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理"]);
assert.equal(defaultTeacherBetaOperations.supportedSubjects.length, 8);
assert.equal(clampTeacherBetaProgress(-5), 0);
assert.equal(clampTeacherBetaProgress(51.4), 51);
assert.equal(clampTeacherBetaProgress(120), 100);
assert.equal(clampTeacherBetaProgress(null), null);

for (const marker of [
  'data-testid="teacher-beta-operations"',
  'aria-label="内测状态与反馈"',
  "可用学科",
  "当前开放学科",
  "剩余额度",
  "待配置",
  "当前任务",
  "服务公告",
  "提交问题或建议",
  "fixed inset-x-3",
  "sm:w-[360px]",
  "break-words",
]) assert.ok(panel.includes(marker), `missing beta operations UI contract: ${marker}`);

assert.ok(studio.includes("TeacherBetaOperationsPanel"));
assert.ok(studio.includes("onOpenFeedback"));
assert.ok(studio.includes("TeacherFeedbackDialog"));
for (const marker of [
  "教材或章节不一致",
  "知识、答案或内容错误",
  "课堂节奏不合理",
  "排版、字体或乱码",
  "生成、导出或下载失败",
  "操作体验问题",
  "隐私或安全问题",
  "其他建议",
  "permissionToContact",
  "submitTeacherFeedback",
  "工单号",
]) assert.ok(feedbackDialog.includes(marker), `missing feedback dialog contract: ${marker}`);

console.log(JSON.stringify({
  pass: true,
  supportedSubjects: teacherBetaSupportedSubjects.length,
  mobilePanel: true,
  feedbackEntry: "persisted-context-aware-dialog",
  quotaSource: "generic-props",
}, null, 2));
