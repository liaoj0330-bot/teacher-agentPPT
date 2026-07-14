import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const token = crypto.randomBytes(32).toString("hex");
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
const marker = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
const user = await prisma.user.create({ data: { email: `plan-test-${marker}@local.test`, name: "Plan state test", passwordHash: "not-used", inviteCode: `P${crypto.randomBytes(7).toString("hex")}` } });
await prisma.authSession.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 3_600_000) } });
const headers = { "content-type": "application/json", cookie: `ai_ppt_agent_session=${token}` };
const otherToken = crypto.randomBytes(32).toString("hex");
const otherTokenHash = crypto.createHash("sha256").update(otherToken).digest("hex");
const otherUser = await prisma.user.create({ data: { email: `plan-other-${marker}@local.test`, name: "Other plan user", passwordHash: "not-used", inviteCode: `O${crypto.randomBytes(7).toString("hex")}` } });
await prisma.authSession.create({ data: { userId: otherUser.id, tokenHash: otherTokenHash, expiresAt: new Date(Date.now() + 3_600_000) } });
const page = (id) => ({ id, role: `role-${id}`, titleIntent: `title-${id}`, pagePurpose: `purpose-${id}`, mustProve: `proof-${id}`, priority: "required" });
const task = { scenario: "teacher_courseware", planningMode: "professional", schoolStage: "初中", grade: "八年级", subject: "数学", topic: "一次函数", duration: "45分钟", uploadedFiles: [], pastedMaterials: "教材事实", teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" } };

async function json(path, init) {
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

try {
  const created = await json("/api/teacher-courseware-plan/state", { method: "POST", body: JSON.stringify({ teacherTask: task, planId: `plan-${marker}`, pages: [page("a"), page("b"), page("c"), page("d")] }) });
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  let plan = created.body.plan;
  assert.equal(plan.status, "reviewing");
  const identity = { projectId: plan.projectId, requestId: plan.requestId };
  const staleRevision = plan.revision;

  async function dispatch(action, expectedRevision = plan.revision) {
    const result = await json("/api/teacher-courseware-plan/state", { method: "PATCH", body: JSON.stringify({ ...identity, expectedRevision, action }) });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
    plan = result.body.plan;
    return result;
  }

  await dispatch({ type: "add_section", at: 1, page: page("x") });
  const conflict = await json("/api/teacher-courseware-plan/state", { method: "PATCH", body: JSON.stringify({ ...identity, expectedRevision: staleRevision, action: { type: "move_section", pageId: "x", to: 0 } }) });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.code, "PLAN_CONFLICT");
  await dispatch({ type: "move_section", pageId: "x", to: 0 });
  await dispatch({ type: "rewrite_section", pageId: "x", patch: { titleIntent: "API rewritten" } });
  await dispatch({ type: "remove_section", pageId: "d" });
  await dispatch({ type: "confirm" });
  await dispatch({ type: "start_compile" });
  for (const item of plan.pages) await dispatch({ type: "page_progress", pageId: item.id, completed: true });
  await dispatch({ type: "fail", code: "WORKER_STOPPED", message: "test failure" });
  await dispatch({ type: "retry" });
  await dispatch({ type: "complete" });
  assert.equal(plan.status, "ready");
  const loaded = await json(`/api/teacher-courseware-plan/state?projectId=${identity.projectId}&requestId=${identity.requestId}`, { method: "GET" });
  assert.equal(loaded.response.status, 200);
  assert.equal(loaded.body.plan.status, "ready");
  assert.deepEqual(loaded.body.plan.pages.map((item) => item.id), ["x", "a", "b", "c"]);
  const isolated = await fetch(`${base}/api/teacher-courseware-plan/state?projectId=${identity.projectId}&requestId=${identity.requestId}`, {
    headers: { cookie: `ai_ppt_agent_session=${otherToken}` },
  });
  assert.equal(isolated.status, 404, "another user must not read the plan");
  console.log(JSON.stringify({ pass: true, projectId: identity.projectId, requestId: identity.requestId, finalStatus: plan.status, revision: plan.revision, conflictStatus: conflict.response.status }, null, 2));
} finally {
  await prisma.user.delete({ where: { id: user.id } }).catch(() => null);
  await prisma.user.delete({ where: { id: otherUser.id } }).catch(() => null);
  await prisma.$disconnect();
}
