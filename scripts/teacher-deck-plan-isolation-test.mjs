import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const marker = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
const makeUser = async (kind) => {
  const token = crypto.randomBytes(32).toString("hex");
  const user = await prisma.user.create({ data: { email: `plan-${kind}-${marker}@local.test`, name: kind, passwordHash: "not-used", inviteCode: `${kind[0].toUpperCase()}${crypto.randomBytes(7).toString("hex")}` } });
  await prisma.authSession.create({ data: { userId: user.id, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  return { user, token };
};
const owner = await makeUser("owner");
const intruder = await makeUser("intruder");
const page = (id) => ({ id, role: id, titleIntent: `title-${id}`, pagePurpose: `purpose-${id}`, mustProve: `proof-${id}`, priority: "required" });
const task = { scenario: "teacher_courseware", planningMode: "professional", schoolStage: "初中", grade: "八年级", subject: "数学", topic: "隔离测试", duration: "45分钟", uploadedFiles: [], pastedMaterials: "", teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" } };
try {
  const createdResponse = await fetch(`${base}/api/teacher-courseware-plan/state`, { method: "POST", headers: { "content-type": "application/json", cookie: `ai_ppt_agent_session=${owner.token}` }, body: JSON.stringify({ teacherTask: task, planId: `isolation-${marker}`, pages: [page("a"), page("b"), page("c")] }) });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  const target = `projectId=${created.plan.projectId}&requestId=${created.plan.requestId}`;
  const getResponse = await fetch(`${base}/api/teacher-courseware-plan/state?${target}`, { headers: { cookie: `ai_ppt_agent_session=${intruder.token}` } });
  assert.equal(getResponse.status, 404);
  const patchResponse = await fetch(`${base}/api/teacher-courseware-plan/state`, { method: "PATCH", headers: { "content-type": "application/json", cookie: `ai_ppt_agent_session=${intruder.token}` }, body: JSON.stringify({ projectId: created.plan.projectId, requestId: created.plan.requestId, expectedRevision: created.plan.revision, action: { type: "confirm" } }) });
  assert.equal(patchResponse.status, 404);
  console.log(JSON.stringify({ pass: true, foreignGetStatus: getResponse.status, foreignPatchStatus: patchResponse.status }, null, 2));
} finally {
  await prisma.user.deleteMany({ where: { id: { in: [owner.user.id, intruder.user.id] } } });
  await prisma.$disconnect();
}
