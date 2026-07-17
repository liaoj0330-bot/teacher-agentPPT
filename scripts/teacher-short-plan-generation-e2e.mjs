import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const marker = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const email = `short-plan-${marker}@local.test`;
let userId = "";

const pages = Array.from({ length: 7 }, (_, index) => ({
  id: `kindergarten-math-${index + 1}`,
  role: ["课程封面", "学习目标", "生活场景", "知识结构", "操作流程", "课堂练习", "总结行动"][index],
  titleIntent: ["数字1-10", "今天学什么", "生活中的数字", "数字与数量对应", "摆一摆数一数", "我会数", "今天我学会了"][index],
  pagePurpose: "服务幼儿园小班30分钟数学课堂",
  mustProve: ["幼儿知道本课主题", "幼儿能说出学习目标", "幼儿能在生活图片中找到数字", "幼儿能建立数字与数量对应", "幼儿能按步骤摆放对应数量物品", "幼儿能独立数出数量并说明答案", "幼儿能总结1-10并完成自评"][index],
  layoutHint: ["cover", "cards", "split", "matrix", "process", "checklist", "closing"][index],
  priority: "required",
}));

try {
  const register = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "test-only-123", name: "Short Plan E2E" }),
  });
  const registerBody = await register.json().catch(() => ({}));
  assert.equal(register.status, 200, JSON.stringify(registerBody));
  userId = registerBody.user?.id || "";
  const cookie = (register.headers.get("set-cookie") || "").split(";")[0];
  assert.ok(cookie, "register must return an authenticated session cookie");

  const teacherTask = {
    scenario: "teacher_courseware",
    planningMode: "professional",
    generationMode: "chapter_prep",
    schoolStage: "幼儿园",
    grade: "小班",
    subject: "数学",
    topic: "数字1-10",
    duration: "30分钟",
    textbook: "人教版数学",
    chapter: "一到十",
    teachingRequirements: "通过实物操作认识数字1-10",
    textbookIdentity: { displayName: "人教版数学", verificationStatus: "teacher_confirmed" },
    chapterIdentity: { chapter: "一到十", verificationStatus: "teacher_confirmed" },
    uploadedFiles: [],
    pastedMaterials: "数字1-10的认识与数量对应",
    teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" },
    deckPlan: { planId: `short-plan-${marker}`, status: "confirmed", pageCount: pages.length, confirmedAt: new Date().toISOString(), pages },
  };
  const response = await fetch(`${base}/api/generate-ppt`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      scenario: "teacher_courseware",
      teacherTask,
      prompt: "为幼儿园小班生成数字1-10数学课件",
      mode: "agent",
      planningMode: "professional",
      forceLocal: true,
      disablePublicSearch: true,
      teacherStyle: teacherTask.teacherStyle,
    }),
  });
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  assert.equal(response.status, 200, raw || "empty response");
  assert.ok(body?.project, "generation must return a project");
  assert.equal(body.slidePagePlan?.length, pages.length, "page plans must match the confirmed short lesson");
  assert.equal(body.layoutPlan?.length, pages.length, "layout plans must match the confirmed short lesson");
  assert.equal(body.contentDrafts?.length, pages.length, "content drafts must not overrun the confirmed short lesson");
  assert.ok(body.projectId && body.versionId && body.requestId, "generation must persist the courseware version");
  console.log(JSON.stringify({
    pass: true,
    topic: teacherTask.topic,
    plannedPages: pages.length,
    contentDrafts: body.contentDrafts.length,
    projectSlides: body.project.slides?.length,
    lifecycleStatus: body.lifecycleStatus,
    imageCalls: 0,
  }, null, 2));
} finally {
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  await prisma.$disconnect();
}
