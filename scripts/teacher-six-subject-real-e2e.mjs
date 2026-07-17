import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-six-subject-real");
const fixturePath = path.resolve("tests/fixtures/teacher-six-subject-acceptance-sources.json");
const requestedCaseIds = new Set(String(process.env.CASE_IDS || "").split(",").map((item) => item.trim()).filter(Boolean));
const allFixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const fixtures = requestedCaseIds.size ? allFixtures.filter((fixture) => requestedCaseIds.has(fixture.id)) : allFixtures;
const scaffoldProbeTerms = ["受众问题", "核心观点", "证据安排", "页面结论", "这一页要", "本页要", "页面需要", "必须先证明", "否则", "无法形成判断", "转成可检查的判断", "证明任务", "页面目的", "内容策划", "生成依据", "写出判断依据、关键步骤和最终结论", "对应变化趋势", "待补充教材依据", "教师补充"];

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function now() { return Date.now(); }

async function request(url, init = {}, cookie = "") {
  return fetch(`${base}${url}`, {
    ...init,
    headers: {
      ...(init.body && typeof init.body === "string" ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(init.headers || {}),
    },
  });
}

async function json(url, init = {}, cookie = "") {
  const response = await request(url, init, cookie);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const diagnostic = data?.slidePagePlanValidation
      ? { message: data.message, slidePagePlanValidation: data.slidePagePlanValidation }
      : data?.deckContentQualityReport
        ? { message: data.message, deckContentQualityReport: data.deckContentQualityReport }
      : data?.contentPlanValidation
        ? { message: data.message, contentPlanValidation: data.contentPlanValidation }
        : data;
    throw new Error(`${url} HTTP ${response.status}: ${JSON.stringify(diagnostic).slice(0, 12000)}`);
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

function acceptanceAsset(fixture) {
  const source = fixture.sourceText;
  const assetId = `acceptance-${fixture.id}`;
  return {
    id: assetId,
    assetId,
    sha256: sha256(source),
    name: `${fixture.id}-textbook.txt`,
    mimeType: "text/plain",
    storageStatus: "persisted",
    text: source,
    analysis: {
      parseStatus: "parsed",
      blockCount: 6,
      pageCount: 13,
      summary: source,
      blocks: [{ page: fixture.pageStart, type: "paragraph", text: source }],
      warnings: ["acceptance_fixture_only: not external textbook truth"],
    },
  };
}

function taskFor(fixture, uploadedFile) {
  return {
    scenario: "teacher_courseware",
    planningMode: "professional",
    generationMode: "chapter_prep",
    schoolStage: fixture.schoolStage,
    grade: fixture.grade,
    subject: fixture.subject,
    topic: fixture.topic,
    duration: "45分钟",
    textbook: fixture.textbook,
    chapter: fixture.chapter,
    teachingRequirements: `围绕${fixture.topic}完成45分钟课堂，要求证据、练习、反馈、迁移和课后作业可检查。`,
    textbookIdentity: {
      displayName: fixture.textbook,
      publisher: fixture.publisher,
      editionYear: fixture.editionYear,
      volume: fixture.volume,
      sourceAssetId: uploadedFile.assetId,
      verificationStatus: "asset_verified",
    },
    chapterIdentity: {
      unit: fixture.unit,
      chapter: fixture.chapter,
      lesson: fixture.lesson,
      pageStart: fixture.pageStart,
      pageEnd: fixture.pageEnd,
      verificationStatus: "asset_verified",
    },
    sourcePolicy: "uploaded_only",
    uploadedFiles: [uploadedFile],
    pastedMaterials: fixture.sourceText,
    teacherStyle: { visualMode: "teaching_editorial", theme: "book_blue" },
  };
}

async function runCase(fixture) {
  const started = now();
  const timing = {};
  let stage = "register";
  try {
    const uploadedFile = acceptanceAsset(fixture);
    const teacherTask = taskFor(fixture, uploadedFile);

    let mark = now();
    const registered = await json("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: `六科验收-${fixture.id}`,
        email: `six-subject-${fixture.id}-${Date.now()}@example.com`,
        password: "Teacher123!",
      }),
    });
    const cookie = registered.response.headers.get("set-cookie")?.split(";")[0] || "";
    assert.ok(cookie, "registration did not return a session cookie");
    timing.registerMs = now() - mark;

    stage = "plan";
    mark = now();
    const deckPlan = (await json("/api/teacher-courseware-plan", {
      method: "POST",
      body: JSON.stringify({ teacherTask }),
    }, cookie)).data.deckPlan;
    assert.ok(deckPlan?.pages?.length, "plan has no pages");
    timing.planMs = now() - mark;

    stage = "confirm-plan";
    mark = now();
    let state = (await json("/api/teacher-courseware-plan/state", {
      method: "POST",
      body: JSON.stringify({ teacherTask, planId: deckPlan.planId, pages: deckPlan.pages, lessonBlueprint: deckPlan.lessonBlueprint }),
    }, cookie)).data.plan;
    if (state.status === "reviewing") state = await patchPlan(state, { type: "confirm" }, cookie);
    if (state.status === "confirmed") state = await patchPlan(state, { type: "start_compile" }, cookie);
    assert.equal(state.status, "compiling");
    timing.confirmPlanMs = now() - mark;

    stage = "generate";
    mark = now();
    const confirmedTask = {
      ...teacherTask,
      deckPlan: { ...state, status: "confirmed", confirmedAt: new Date().toISOString(), pageCount: state.pages.length },
    };
    const generated = (await json("/api/generate-ppt", {
      method: "POST",
      body: JSON.stringify({
        scenario: "teacher_courseware",
        planningMode: "professional",
        mode: "agent",
        forceLocal: true,
        disablePublicSearch: true,
        projectId: state.projectId,
        teacherTask: confirmedTask,
        prompt: `请为${fixture.schoolStage}${fixture.grade}${fixture.subject}课题“${fixture.topic}”生成一份45分钟课堂课件。教材：${fixture.textbook}；章节：${fixture.chapter}；资料节选：${fixture.sourceText}`,
        uploadedAssets: [uploadedFile],
      }),
    }, cookie)).data;
    const slides = generated.project?.slides || [];
    assert.equal(slides.length, deckPlan.pages.length, "plan/generated page mismatch");
    assert.equal(generated.project?.contentDrafts?.length, slides.length, "content drafts/page mismatch");
    assert.ok(generated.project?.contentPlan?.lessonBlueprint, "missing lesson blueprint");
    assert.equal(generated.project.contentPlan.lessonBlueprint.status, "teacher_confirmed");
    assert.equal(generated.project.contentPlan.deliveryPack.teacherNotes.length, slides.length, "teacher notes/page mismatch");
    const sourceDocuments = generated.sourceDocuments || generated.project.sourceDocuments || [];
    assert.ok(sourceDocuments.some((source) => source.assetId === uploadedFile.assetId && source.parseStatus === "parsed"), "parsed uploaded source missing");
    const generatedScore = generated.project?.reviewCenter?.teacherScoreV3;
    const visibleText = slides.flatMap((slide) => [slide.title, slide.subtitle, ...(slide.bullets || [])]).join(" ");
    const scaffoldMatches = scaffoldProbeTerms.filter((term) => visibleText.includes(term));
    timing.generateMs = now() - mark;

    stage = "score-and-review";
    mark = now();
    const reviewed = (await json("/api/courseware-version", {
      method: "POST",
      body: JSON.stringify({
        projectId: generated.projectId,
        baseVersionId: generated.versionId,
        operation: "teacher_submit_for_review",
        idempotencyKey: `six-subject-review-${fixture.id}-${generated.versionId}`,
        payload: {},
      }),
    }, cookie)).data;
    assert.equal(reviewed.teacherReadiness, "ready_for_teacher", `review readiness=${reviewed.teacherReadiness}; scaffoldMatches=${JSON.stringify(scaffoldMatches)}; generatedScore=${JSON.stringify({ decision: generatedScore?.contract?.decision, p0: generatedScore?.p0, p1: generatedScore?.p1, scores: generatedScore?.scores }).slice(0, 8000)}`);
    timing.reviewMs = now() - mark;

    stage = "export-download";
    mark = now();
    const exported = await request("/api/export-pptx", {
      method: "POST",
      body: JSON.stringify({ projectId: generated.projectId, versionId: reviewed.versionId }),
    }, cookie);
    const exportedBytes = Buffer.from(await exported.arrayBuffer());
    assert.ok(exported.ok, `export HTTP ${exported.status}: ${exportedBytes.toString("utf8").slice(0, 500)}`);
    const artifactId = exported.headers.get("x-artifact-id") || "";
    assert.ok(artifactId, "export did not return artifact id");
    const downloaded = await request(`/api/courseware-artifacts/${artifactId}/download`, {}, cookie);
    const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
    assert.ok(downloaded.ok, `durable download HTTP ${downloaded.status}`);
    const digest = sha256(downloadedBytes);
    assert.equal(digest, sha256(exportedBytes), "durable download hash mismatch");
    timing.exportDownloadMs = now() - mark;

    stage = "reopen-and-score";
    mark = now();
    const reopened = (await json(`/api/courseware-version?projectId=${encodeURIComponent(generated.projectId)}&versionId=${encodeURIComponent(reviewed.versionId)}`, {}, cookie)).data;
    assert.equal(reopened.slides?.length, slides.length, "reopened version page mismatch");
    assert.equal(reopened.teacherReadiness, "ready_for_teacher");
    const artifacts = (await json(`/api/courseware-artifacts?projectId=${encodeURIComponent(generated.projectId)}&versionId=${encodeURIComponent(reviewed.versionId)}`, {}, cookie)).data.artifacts;
    assert.ok(artifacts.some((artifact) => artifact.artifactId === artifactId && artifact.status === "ready"), "ready artifact missing from history");
    const zip = await JSZip.loadAsync(downloadedBytes);
    const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    assert.equal(slideFiles.length, slides.length, "pptx slide count mismatch");
    timing.reopenScoreMs = now() - mark;

    const finalScore = reopened.teacherScoreV3 || generatedScore || null;
    const outputPath = path.join(outputDir, `${fixture.id}.pptx`);
    fs.writeFileSync(outputPath, downloadedBytes);
    return {
      id: fixture.id,
      subject: fixture.subject,
      grade: fixture.grade,
      textbook: fixture.textbook,
      chapter: fixture.chapter,
      sourceKind: "local_parsed_acceptance_fixture_not_external_truth",
      sourceAssetId: uploadedFile.assetId,
      sourceSha256: uploadedFile.sha256,
      sourceParsed: true,
      projectId: generated.projectId,
      versionId: reviewed.versionId,
      artifactId,
      pageCount: slides.length,
      lessonEventCount: generated.project.contentPlan.lessonBlueprint.lessonPlan?.events?.length || generated.project.contentPlan.lessonPlan?.events?.length || 0,
      byteSize: downloadedBytes.length,
      sha256: digest,
      scoreDecision: finalScore?.contract?.decision || null,
      scoreTotal: finalScore?.scores?.total ?? null,
      p0Count: finalScore?.p0?.length ?? null,
      p1Count: finalScore?.p1?.length ?? null,
      scoreP0: finalScore?.p0 || [],
      scoreP1: finalScore?.p1 || [],
      teacherReadiness: reopened.teacherReadiness,
      engineeringStatus: reopened.engineeringStatus,
      timingMs: { ...timing, total: now() - started },
      outputPath,
    };
  } catch (error) {
    return {
      id: fixture.id,
      subject: fixture.subject,
      textbook: fixture.textbook,
      sourceKind: "local_parsed_acceptance_fixture_not_external_truth",
      pass: false,
      failedStage: stage,
      timingMs: { total: now() - started },
      error: String(error?.stack || error),
    };
  }
}

fs.mkdirSync(outputDir, { recursive: true });
const report = {
  schema: "teacher-six-subject-real-e2e/v1",
  startedAt: new Date().toISOString(),
  base,
  fixturePath,
  fixtureDisclaimer: "Sources are deterministic local parsed acceptance fixtures. They validate product wiring and traceability, not textbook factual correctness or public-source verification.",
  imageApiCalled: false,
  pass: false,
  cases: [],
};

for (const fixture of fixtures) report.cases.push(await runCase(fixture));
report.pass = report.cases.length === fixtures.length && report.cases.every((item) => item.pass !== false);
report.summary = {
  subjectCount: report.cases.length,
  passed: report.cases.filter((item) => item.pass !== false).length,
  failed: report.cases.filter((item) => item.pass === false).length,
  totalPages: report.cases.reduce((sum, item) => sum + (item.pageCount || 0), 0),
  totalLessonEvents: report.cases.reduce((sum, item) => sum + (item.lessonEventCount || 0), 0),
  scoreDecisions: Object.fromEntries(report.cases.map((item) => [item.id, item.scoreDecision || "failed_before_score"])),
};
report.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
