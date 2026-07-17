import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-two-subject-delivery");
const cases = [
  {
    id: "physics-h2-lenz",
    fileName: "高二物理-楞次定律-45分钟.pptx",
    required: ["楞次定律", "磁通量", "右手螺旋定则"],
    task: { subject: "物理", schoolStage: "高中", grade: "高二", topic: "楞次定律", textbook: "人教版高中物理选择性必修第二册", chapter: "第二章 电磁感应", teachingRequirements: "包含实验观察、方向判断、纠错和迁移练习。", teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" } },
  },
  {
    id: "chinese-j8-beiying",
    fileName: "初二语文-背影-45分钟.pptx",
    required: ["背影", "攀", "缩", "倾"],
    task: { subject: "语文", schoolStage: "初中", grade: "初二", topic: "背影", textbook: "人教版八年级上册", chapter: "第五单元", teachingRequirements: "围绕关键段落进行细读，完成朗读、批注、证据回扣和表达迁移。", teacherStyle: { visualMode: "teaching_editorial", theme: "book_blue" } },
  },
];

function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }

async function request(url, init = {}, cookie = "") {
  return fetch(`${base}${url}`, { ...init, headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) } });
}

async function json(url, init = {}, cookie = "") {
  const response = await request(url, { ...init, headers: { "content-type": "application/json", ...(init.headers || {}) } }, cookie);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(`${url} HTTP ${response.status}: ${JSON.stringify(data).slice(0, 800)}`);
  return { response, data };
}

async function patchPlan(plan, action, cookie) {
  return (await json("/api/teacher-courseware-plan/state", { method: "PATCH", body: JSON.stringify({ projectId: plan.projectId, requestId: plan.requestId, expectedRevision: plan.revision, action }) }, cookie)).data.plan;
}

async function runCase(testCase) {
  const teacherTask = { scenario: "teacher_courseware", planningMode: "professional", generationMode: "chapter_prep", duration: "45分钟", uploadedFiles: [], pastedMaterials: "", ...testCase.task };
  const registered = await json("/api/auth/register", { method: "POST", body: JSON.stringify({ name: `两门样课-${testCase.id}`, email: `two-subject-${testCase.id}-${Date.now()}@example.com`, password: "Teacher123!" }) });
  const cookie = registered.response.headers.get("set-cookie")?.split(";")[0] || "";
  if (!cookie) throw new Error(`${testCase.id}: missing session cookie`);
  const deckPlan = (await json("/api/teacher-courseware-plan", { method: "POST", body: JSON.stringify({ teacherTask }) }, cookie)).data.deckPlan;
  let state = (await json("/api/teacher-courseware-plan/state", { method: "POST", body: JSON.stringify({ teacherTask, planId: deckPlan.planId, pages: deckPlan.pages, lessonBlueprint: deckPlan.lessonBlueprint }) }, cookie)).data.plan;
  if (state.status === "reviewing") state = await patchPlan(state, { type: "confirm" }, cookie);
  if (state.status === "confirmed") state = await patchPlan(state, { type: "start_compile" }, cookie);
  const generated = (await json("/api/generate-ppt", { method: "POST", body: JSON.stringify({ scenario: "teacher_courseware", planningMode: "professional", mode: "agent", forceLocal: true, projectId: state.projectId, teacherTask: { ...teacherTask, deckPlan: { ...state, status: "confirmed", confirmedAt: new Date().toISOString(), pageCount: state.pages.length } } }) }, cookie)).data;
  const slides = generated.project?.slides || [];
  const lessonBlueprint = generated.project?.contentPlan?.lessonBlueprint;
  if (!lessonBlueprint || lessonBlueprint.planId !== generated.project?.contentPlan?.planId || lessonBlueprint.status !== "teacher_confirmed") throw new Error(`${testCase.id}: generated version missing confirmed lesson blueprint`);
  const visible = JSON.stringify(generated.project?.contentDrafts || slides);
  const missing = testCase.required.filter((term) => !visible.includes(term));
  if (missing.length) throw new Error(`${testCase.id}: missing content terms ${missing.join(", ")}`);
  if (slides.length !== deckPlan.pages.length) throw new Error(`${testCase.id}: plan/generated page mismatch`);
  if (generated.project?.contentPlan?.deliveryPack?.teacherNotes?.length !== slides.length) throw new Error(`${testCase.id}: teacher pack/page mismatch`);
  const reviewed = (await json("/api/courseware-version", {
    method: "POST",
    body: JSON.stringify({
      projectId: generated.projectId,
      baseVersionId: generated.versionId,
      operation: "teacher_submit_for_review",
      idempotencyKey: `teacher-review-${testCase.id}-${generated.versionId}`,
      payload: {},
    }),
  }, cookie)).data;
  if (reviewed.teacherReadiness !== "ready_for_teacher") {
    throw new Error(`${testCase.id}: real teacher review did not reach ready_for_teacher (${reviewed.teacherReadiness})`);
  }
  const exported = await request("/api/export-pptx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: generated.projectId, versionId: reviewed.versionId }) }, cookie);
  const exportedBytes = Buffer.from(await exported.arrayBuffer());
  if (!exported.ok) throw new Error(`${testCase.id}: export HTTP ${exported.status} ${exportedBytes.toString("utf8").slice(0, 500)}`);
  const artifactId = exported.headers.get("x-artifact-id") || "";
  const downloaded = await request(`/api/courseware-artifacts/${artifactId}/download`, {}, cookie);
  const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
  if (!downloaded.ok || sha256(downloadedBytes) !== sha256(exportedBytes)) throw new Error(`${testCase.id}: durable download mismatch`);
  const reopened = (await json(`/api/courseware-version?projectId=${encodeURIComponent(generated.projectId)}&versionId=${encodeURIComponent(reviewed.versionId)}`, {}, cookie)).data;
  if (reopened.slides?.length !== slides.length) throw new Error(`${testCase.id}: reopened version page mismatch`);
  const zip = await JSZip.loadAsync(downloadedBytes);
  const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  if (slideFiles.length !== slides.length) throw new Error(`${testCase.id}: pptx slide count mismatch`);
  const outputPath = path.join(outputDir, testCase.fileName);
  fs.writeFileSync(outputPath, downloadedBytes);
  return { id: testCase.id, outputPath, projectId: generated.projectId, versionId: reviewed.versionId, artifactId, pageCount: slides.length, byteSize: downloadedBytes.length, sha256: sha256(downloadedBytes), titles: slides.map((slide) => slide.title), lessonArchitecture: lessonBlueprint.architecture, lessonBlueprintStatus: lessonBlueprint.status, lessonEventCount: lessonBlueprint.lessonPlan?.events?.length, teacherNotes: generated.project.contentPlan.deliveryPack.teacherNotes.length };
}

fs.mkdirSync(outputDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), pass: false, cases: [] };
try {
  for (const testCase of cases) report.cases.push(await runCase(testCase));
  report.pass = true;
} catch (error) {
  report.error = String(error?.stack || error);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}
