import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-artifact-durability");
const stage = process.env.ARTIFACT_STAGE || "create";
const statePath = path.join(outputDir, "state.json");
fs.mkdirSync(outputDir, { recursive: true });

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function request(url, init = {}, cookie = "") {
  const response = await fetch(`${base}${url}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...(cookie ? { cookie } : {}),
    },
  });
  return response;
}

async function createStage() {
  const email = `artifact-${Date.now()}@example.com`;
  const register = await request("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Artifact QA", email, password: "Teacher123!" }),
  });
  const cookie = register.headers.get("set-cookie")?.split(";")[0] || "";
  if (!register.ok || !cookie) throw new Error(`register failed: ${register.status}`);
  const generated = await request("/api/generate-ppt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scenario: "teacher_courseware",
      planningMode: "professional",
      mode: "agent",
      forceLocal: true,
      teacherTask: {
        scenario: "teacher_courseware",
        planningMode: "professional",
        generationMode: "chapter_prep",
        subject: "物理",
        schoolStage: "高中",
        grade: "高二",
        topic: "楞次定律",
        textbook: "人教版高中物理选择性必修第二册",
        chapter: "第二章 电磁感应",
        duration: "45分钟",
        uploadedFiles: [],
        pastedMaterials: "",
        teachingRequirements: "包含实验观察、方向判断、纠错和迁移练习。",
        teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" },
      },
    }),
  }, cookie);
  const generatedBody = await generated.json();
  if (!generated.ok) throw new Error(`generate failed: ${generated.status} ${JSON.stringify(generatedBody).slice(0, 500)}`);
  const prisma = new PrismaClient(process.env.DATABASE_URL ? { datasources: { db: { url: process.env.DATABASE_URL } } } : undefined);
  try {
    await prisma.coursewareVersion.update({
      where: { id: generatedBody.versionId },
      data: { teacherReadiness: "ready_for_teacher", engineeringStatus: "passed" },
    });
  } finally {
    await prisma.$disconnect();
  }
  const exportResponse = await request("/api/export-pptx", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: generatedBody.projectId, versionId: generatedBody.versionId }),
  }, cookie);
  const bytes = Buffer.from(await exportResponse.arrayBuffer());
  if (!exportResponse.ok) throw new Error(`export failed: ${exportResponse.status} ${bytes.toString("utf8").slice(0, 500)}`);
  const artifactId = exportResponse.headers.get("x-artifact-id") || "";
  if (!artifactId) throw new Error("export missing x-artifact-id");
  const state = {
    cookie,
    projectId: generatedBody.projectId,
    versionId: generatedBody.versionId,
    artifactId,
    exportSha256: sha256(bytes),
    exportBytes: bytes.length,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ pass: true, stage, ...state }, null, 2));
}

async function verifyStage() {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const listed = await request(`/api/courseware-artifacts?projectId=${encodeURIComponent(state.projectId)}&versionId=${encodeURIComponent(state.versionId)}`, {}, state.cookie);
  const listBody = await listed.json();
  if (!listed.ok) throw new Error(`artifact list failed: ${listed.status} ${JSON.stringify(listBody).slice(0, 500)}`);
  const artifact = (listBody.artifacts || []).find((item) => item.artifactId === state.artifactId);
  if (!artifact) throw new Error("artifact row missing from history");
  if (!artifact.storagePath || !artifact.sha256 || !artifact.byteSize || !artifact.mimeType) throw new Error("artifact row missing persisted metadata");
  const download = await request(`/api/courseware-artifacts/${state.artifactId}/download`, {}, state.cookie);
  const bytes = Buffer.from(await download.arrayBuffer());
  if (!download.ok) throw new Error(`download failed: ${download.status} ${bytes.toString("utf8").slice(0, 500)}`);
  const downloadSha = sha256(bytes);
  if (downloadSha !== state.exportSha256) throw new Error(`download sha mismatch: ${downloadSha} !== ${state.exportSha256}`);
  if (bytes.length !== state.exportBytes) throw new Error(`download byte size mismatch: ${bytes.length} !== ${state.exportBytes}`);
  if (artifact.sha256 !== state.exportSha256) throw new Error(`artifact row sha mismatch: ${artifact.sha256} !== ${state.exportSha256}`);
  if (artifact.byteSize !== state.exportBytes) throw new Error(`artifact row byteSize mismatch: ${artifact.byteSize} !== ${state.exportBytes}`);
  console.log(JSON.stringify({ pass: true, stage, artifactId: state.artifactId, projectId: state.projectId, versionId: state.versionId, sha256: downloadSha, byteSize: bytes.length, mimeType: artifact.mimeType }, null, 2));
}

if (stage === "verify") {
  await verifyStage();
} else {
  await createStage();
}
