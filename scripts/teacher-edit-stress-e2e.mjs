import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-edit-stress");
fs.mkdirSync(outputDir, { recursive: true });

async function request(url, init = {}, cookie = "") {
  return fetch(`${base}${url}`, {
    ...init,
    headers: { ...(init.headers || {}), ...(cookie ? { cookie } : {}) },
  });
}

async function json(url, init = {}, cookie = "", allowed = [200, 201]) {
  const response = await request(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  }, cookie);
  const data = await response.json().catch(() => null);
  if (!allowed.includes(response.status) || !data) {
    throw new Error(`${url} HTTP ${response.status}: ${JSON.stringify(data).slice(0, 800)}`);
  }
  return { response, data };
}

async function patchPlan(plan, action, cookie) {
  return (await json("/api/teacher-courseware-plan/state", {
    method: "PATCH",
    body: JSON.stringify({
      projectId: plan.projectId,
      requestId: plan.requestId,
      expectedRevision: plan.revision,
      action,
    }),
  }, cookie)).data.plan;
}

const report = { suite: "TEACHER_EDIT_STRESS_E2E", startedAt: new Date().toISOString(), base, pass: false };
try {
  const registered = await json("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "连续修改压力测试",
      email: `teacher-edit-stress-${Date.now()}@example.com`,
      password: "Teacher123!",
    }),
  });
  const cookie = registered.response.headers.get("set-cookie")?.split(";")[0] || "";
  if (!cookie) throw new Error("registration did not return a session cookie");

  const teacherTask = {
    scenario: "teacher_courseware",
    planningMode: "professional",
    generationMode: "chapter_prep",
    duration: "45分钟",
    schoolStage: "高中",
    grade: "高二",
    subject: "物理",
    topic: "楞次定律",
    textbook: "人教版高中物理选择性必修第二册",
    chapter: "第二章 电磁感应",
    teachingRequirements: "包含实验观察、方向判断、纠错和迁移练习。",
    uploadedFiles: [],
    pastedMaterials: "",
    teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" },
  };
  const deckPlan = (await json("/api/teacher-courseware-plan", {
    method: "POST",
    body: JSON.stringify({ teacherTask }),
  }, cookie)).data.deckPlan;
  let state = (await json("/api/teacher-courseware-plan/state", {
    method: "POST",
    body: JSON.stringify({ teacherTask, planId: deckPlan.planId, pages: deckPlan.pages, lessonBlueprint: deckPlan.lessonBlueprint }),
  }, cookie)).data.plan;
  if (state.status === "reviewing") state = await patchPlan(state, { type: "confirm" }, cookie);
  if (state.status === "confirmed") state = await patchPlan(state, { type: "start_compile" }, cookie);
  const generated = (await json("/api/generate-ppt", {
    method: "POST",
    body: JSON.stringify({
      scenario: "teacher_courseware",
      planningMode: "professional",
      mode: "agent",
      forceLocal: true,
      projectId: state.projectId,
      teacherTask: { ...teacherTask, deckPlan: { ...state, status: "confirmed", confirmedAt: new Date().toISOString() } },
    }),
  }, cookie)).data;
  const projectId = generated.projectId;
  const initialVersionId = generated.versionId;
  const targetSlideId = generated.project?.slides?.[1]?.id || generated.project?.slides?.[0]?.id;
  if (!projectId || !initialVersionId || !targetSlideId) throw new Error("initial generation did not return versioned slides");

  let currentVersionId = initialVersionId;
  const committed = [];
  let restoreVersionId = initialVersionId;
  for (let index = 1; index <= 10; index += 1) {
    const idempotencyKey = `teacher-edit-stress-${projectId}-${index}`;
    const body = {
      projectId,
      baseVersionId: currentVersionId,
      operation: "manual_edit",
      idempotencyKey,
      payload: {
        slideId: targetSlideId,
        patch: { speakerNote: `连续修改第 ${index} 次：先观察证据，再判断磁通量变化和感应磁场方向。` },
      },
    };
    const committedVersion = (await json("/api/courseware-version", { method: "POST", body: JSON.stringify(body) }, cookie)).data;
    if (committedVersion.parentVersionId !== currentVersionId) throw new Error(`edit ${index} broke parent chain`);
    currentVersionId = committedVersion.versionId;
    committed.push({ index, versionId: currentVersionId, versionNumber: committedVersion.versionNumber });
    if (index === 3) restoreVersionId = currentVersionId;
    if (index === 1) {
      const retry = (await json("/api/courseware-version", { method: "POST", body: JSON.stringify(body) }, cookie)).data;
      if (!retry.deduped || retry.versionId !== currentVersionId) throw new Error("idempotent retry created a duplicate version");
    }
  }

  const stale = await json("/api/courseware-version", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      baseVersionId: initialVersionId,
      operation: "manual_edit",
      idempotencyKey: `teacher-edit-stale-${projectId}`,
      payload: { slideId: targetSlideId, patch: { title: "不应写入的过期修改" } },
    }),
  }, cookie, [409]);
  if (stale.data.code !== "version_conflict") throw new Error("stale edit was not rejected as version_conflict");

  const historical = (await json(`/api/courseware-version?projectId=${encodeURIComponent(projectId)}&versionId=${encodeURIComponent(restoreVersionId)}`, {}, cookie)).data;
  const restored = (await json("/api/courseware-version", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      baseVersionId: currentVersionId,
      operation: "restore_version",
      idempotencyKey: `teacher-restore-${projectId}-${restoreVersionId}`,
      payload: { restoreVersionId },
    }),
  }, cookie)).data;
  if (restored.parentVersionId !== currentVersionId) throw new Error("restore did not branch from the current version");
  if (JSON.stringify(restored.slides) !== JSON.stringify(historical.slides)) throw new Error("restored slides differ from the selected historical snapshot");

  const reopened = (await json(`/api/courseware-version?projectId=${encodeURIComponent(projectId)}&versionId=${encodeURIComponent(restored.versionId)}`, {}, cookie)).data;
  const versions = (await json(`/api/courseware-versions?projectId=${encodeURIComponent(projectId)}`, {}, cookie)).data.versions;
  const currentRows = versions.filter((row) => row.isCurrent);
  if (!reopened.isCurrent || currentRows.length !== 1 || currentRows[0].versionId !== restored.versionId) {
    throw new Error("refresh/reopen did not preserve one authoritative current version");
  }
  const versionIds = new Set(versions.map((row) => row.versionId));
  if (versionIds.size !== versions.length || versions.length !== 12) {
    throw new Error(`immutable version history mismatch: ${versions.length} rows, ${versionIds.size} unique`);
  }

  Object.assign(report, {
    pass: true,
    projectId,
    initialVersionId,
    committed,
    staleConflict: stale.data.code,
    restoredFromVersionId: restoreVersionId,
    restoredVersionId: restored.versionId,
    versionCount: versions.length,
    currentVersionId: currentRows[0].versionId,
  });
} catch (error) {
  report.error = String(error?.stack || error);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}
