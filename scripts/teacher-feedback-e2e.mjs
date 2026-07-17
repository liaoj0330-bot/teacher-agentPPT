import assert from "node:assert/strict";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const marker = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

async function provision(label) {
  const token = crypto.randomBytes(32).toString("hex");
  const user = await prisma.user.create({
    data: {
      email: `feedback-${label}-${marker}@local.test`,
      name: `Feedback ${label}`,
      passwordHash: "not-used",
      inviteCode: `${label[0].toUpperCase()}${crypto.randomBytes(7).toString("hex")}`,
    },
  });
  await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  return { user, cookie: `ai_ppt_agent_session=${token}` };
}

async function request(path, init = {}, cookie = "") {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
  });
  return { response, body: await response.json().catch(() => ({})) };
}

const owner = await provision("owner");
const outsider = await provision("outsider");
let project;
let requestRow;
try {
  project = await prisma.coursewareProject.create({
    data: { userId: owner.user.id, title: "函数反馈验收", subject: "数学", schoolStage: "初中", grade: "八年级" },
  });
  requestRow = await prisma.coursewareRequest.create({
    data: { projectId: project.id, requestType: "generate", teacherTaskSnapshot: "{}" },
  });
  const version = await prisma.coursewareVersion.create({
    data: {
      projectId: project.id,
      requestId: requestRow.id,
      versionNumber: 1,
      teacherTaskSnapshot: "{}",
      idempotencyKey: `feedback-version-${marker}`,
    },
  });

  const unauthorized = await request("/api/teacher-feedback");
  assert.equal(unauthorized.response.status, 401);

  const payload = {
    projectId: project.id,
    versionId: version.id,
    subject: "数学",
    topic: "一次函数",
    pageNumber: 7,
    pageId: "slide-7",
    taskId: requestRow.id,
    category: "layout",
    severity: "P1",
    message: "投影时这一页公式区域太拥挤",
    idempotencyKey: `feedback-${marker}`,
    clientMetadata: {
      viewport: { width: 1440, height: 900 },
      userAgent: "feedback-contract-test",
      permissionToContact: true,
      apiKey: "must-not-persist",
      authorization: "must-not-persist",
    },
  };
  const withoutContactPermission = await request("/api/teacher-feedback", {
    method: "POST",
    body: JSON.stringify({ ...payload, idempotencyKey: `feedback-no-contact-${marker}`, clientMetadata: { viewport: "test" } }),
  }, owner.cookie);
  assert.equal(withoutContactPermission.response.status, 400);

  const created = await request("/api/teacher-feedback", { method: "POST", body: JSON.stringify(payload) }, owner.cookie);
  assert.equal(created.response.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.ticket.projectId, project.id);
  assert.equal(created.body.ticket.versionId, version.id);
  assert.equal(created.body.ticket.category, "layout");
  assert.equal(created.body.ticket.clientMetadata.apiKey, undefined);
  assert.equal(created.body.ticket.clientMetadata.authorization, undefined);

  const repeated = await request("/api/teacher-feedback", { method: "POST", body: JSON.stringify(payload) }, owner.cookie);
  assert.equal(repeated.response.status, 200, JSON.stringify(repeated.body));
  assert.equal(repeated.body.deduped, true);
  assert.equal(repeated.body.ticket.id, created.body.ticket.id);
  assert.equal(await prisma.feedbackTicket.count({ where: { userId: owner.user.id } }), 1);

  const list = await request(`/api/teacher-feedback?projectId=${project.id}&category=layout`, {}, owner.cookie);
  assert.equal(list.response.status, 200, JSON.stringify(list.body));
  assert.equal(list.body.tickets.length, 1);

  const isolatedList = await request(`/api/teacher-feedback?projectId=${project.id}`, {}, outsider.cookie);
  assert.equal(isolatedList.response.status, 200);
  assert.equal(isolatedList.body.tickets.length, 0);

  const isolatedUpdate = await request(`/api/teacher-feedback/${created.body.ticket.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "resolved" }),
  }, outsider.cookie);
  assert.equal(isolatedUpdate.response.status, 404);

  const updated = await request(`/api/teacher-feedback/${created.body.ticket.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "in_progress", assignee: "beta-ops", severity: "P0" }),
  }, owner.cookie);
  assert.equal(updated.response.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.ticket.status, "in_progress");
  assert.equal(updated.body.ticket.assignee, "beta-ops");

  const resolved = await request(`/api/teacher-feedback/${created.body.ticket.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "resolved" }),
  }, owner.cookie);
  assert.equal(resolved.response.status, 200, JSON.stringify(resolved.body));
  assert.ok(resolved.body.ticket.resolvedAt);

  const foreignContext = await request("/api/teacher-feedback", {
    method: "POST",
    body: JSON.stringify({ ...payload, idempotencyKey: `foreign-${marker}` }),
  }, outsider.cookie);
  assert.equal(foreignContext.response.status, 404);

  console.log(JSON.stringify({
    pass: true,
    ticketId: created.body.ticket.id,
    idempotentCount: 1,
    ownerIsolation: true,
    contextValidated: true,
    finalStatus: resolved.body.ticket.status,
    imageCalls: 0,
  }, null, 2));
} finally {
  await prisma.user.delete({ where: { id: owner.user.id } }).catch(() => null);
  await prisma.user.delete({ where: { id: outsider.user.id } }).catch(() => null);
  await prisma.$disconnect();
}
