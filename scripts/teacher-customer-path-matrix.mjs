import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3026";
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-customer-path-matrix");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const results = [];
const findings = [];
let imageApiCalls = 0;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function record(id, area, passed, detail = {}, severity = null) {
  const item = { id, area, passed, severity, ...detail };
  results.push(item);
  return item;
}

function finding(id, severity, title, reproduction, recommendation, evidence = {}) {
  if (findings.some((item) => item.id === id)) return;
  findings.push({ id, severity, title, reproduction, recommendation, evidence });
}

async function raw(url, init = {}, cookie = "") {
  if (url.includes("/api/generate-image")) imageApiCalls += 1;
  return fetch(`${BASE_URL}${url}`, {
    ...init,
    headers: {
      ...(typeof init.body === "string" ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(init.headers || {}),
    },
  });
}

async function responseData(response) {
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: response.status, ok: response.ok, text, json, contentType: response.headers.get("content-type") || "" };
}

async function json(url, init = {}, cookie = "") {
  return responseData(await raw(url, init, cookie));
}

async function register() {
  const response = await raw("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "客户路径矩阵教师",
      email: `customer-path-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`,
      password: "Teacher123!",
    }),
  });
  const data = await responseData(response.clone());
  assert.ok([200, 201].includes(data.status), `register HTTP ${data.status}: ${data.text}`);
  const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  assert.ok(cookie, "registration did not return a session cookie");
  return cookie;
}

function task(input) {
  return {
    scenario: "teacher_courseware",
    planningMode: "professional",
    generationMode: input.generationMode || "chapter_prep",
    schoolStage: input.schoolStage,
    grade: input.grade,
    subject: input.subject,
    topic: input.topic,
    duration: input.duration || "45分钟",
    textbook: input.textbook || "",
    chapter: input.chapter || "",
    teachingRequirements: input.teachingRequirements || `围绕${input.topic}完成目标、活动、练习、反馈和迁移。`,
    textbookIdentity: input.textbookIdentity,
    chapterIdentity: input.chapterIdentity,
    sourcePolicy: input.sourcePolicy || "web_supplement",
    uploadedFiles: input.uploadedFiles || [],
    pastedMaterials: input.pastedMaterials || "",
    beautifyOptions: input.beautifyOptions,
    teacherStyle: { visualMode: "teaching_editorial", theme: "book_blue" },
  };
}

async function uploadBytes(cookie, bytes, fileName, mimeType) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), fileName);
  const response = await raw("/api/upload-ppt", { method: "POST", body: form }, cookie);
  const data = await responseData(response);
  assert.ok(data.ok, `upload ${fileName} HTTP ${data.status}: ${data.text}`);
  assert.equal(data.json?.status, "uploaded", `${fileName} did not reach uploaded status`);
  return data.json;
}

function uploadedAsset(upload, role) {
  return {
    id: upload.assetId,
    assetId: upload.assetId,
    sha256: upload.sha256,
    name: upload.fileName,
    type: upload.type,
    mimeType: upload.type,
    size: upload.size,
    status: upload.status,
    storageStatus: upload.storageStatus,
    materialRole: role,
    analysis: upload.analysis,
  };
}

async function planCase(caseInfo) {
  const started = Date.now();
  const response = await json("/api/teacher-courseware-plan", {
    method: "POST",
    body: JSON.stringify({ teacherTask: caseInfo.teacherTask }),
  });
  const match = response.json?.materialPackage?.textbookMatch;
  const readiness = response.json?.materialPackage?.readiness;
  const passed = caseInfo.expectedStatuses.includes(response.status)
    && (response.status !== 200 || Boolean(response.json?.deckPlan?.pages?.length));
  record(caseInfo.id, "planning", passed, {
    customerPath: caseInfo.customerPath,
    ageSubject: caseInfo.ageSubject,
    status: response.status,
    expectedStatuses: caseInfo.expectedStatuses,
    pageCount: response.json?.deckPlan?.pages?.length || 0,
    textbookMatch: match?.status || null,
    catalogStatus: match?.catalogResolution?.status || null,
    matchConfidence: match?.confidence ?? null,
    requiresTeacherConfirmation: match?.requiresTeacherConfirmation ?? null,
    readiness: readiness?.status || null,
    warnings: readiness?.warnings || [],
    blockingIssues: readiness?.blockingIssues || [],
    elapsedMs: Date.now() - started,
    responseMessage: response.json?.message || null,
  }, passed ? null : "P1");
  return response;
}

async function patchPlan(plan, action, cookie, expectedRevision = plan.revision) {
  return json("/api/teacher-courseware-plan/state", {
    method: "PATCH",
    body: JSON.stringify({ projectId: plan.projectId, requestId: plan.requestId, expectedRevision, action }),
  }, cookie);
}

async function fullLifecycle(cookie, teacherTask) {
  const started = Date.now();
  const planned = await json("/api/teacher-courseware-plan", { method: "POST", body: JSON.stringify({ teacherTask }) });
  assert.equal(planned.status, 200, `full path plan failed: ${planned.text}`);
  const deckPlan = planned.json.deckPlan;

  const created = await json("/api/teacher-courseware-plan/state", {
    method: "POST",
    body: JSON.stringify({ teacherTask, planId: deckPlan.planId, pages: deckPlan.pages, lessonBlueprint: deckPlan.lessonBlueprint }),
  }, cookie);
  assert.equal(created.status, 201, `persist plan failed: ${created.text}`);
  let state = created.json.plan;

  const firstPage = state.pages[0];
  const rewritten = await patchPlan(state, {
    type: "rewrite_section",
    pageId: firstPage.id,
    patch: { titleIntent: `${firstPage.titleIntent}（按本班学情调整）` },
  }, cookie);
  assert.equal(rewritten.status, 200, `replan failed: ${rewritten.text}`);
  state = rewritten.json.plan;
  assert.match(state.pages[0].titleIntent, /按本班学情调整/);

  const confirmed = await patchPlan(state, { type: "confirm" }, cookie);
  assert.equal(confirmed.status, 200, `confirm failed: ${confirmed.text}`);
  state = confirmed.json.plan;

  const duplicateConfirm = await patchPlan(state, { type: "confirm" }, cookie, state.revision);
  record("duplicate-plan-confirm", "idempotency", duplicateConfirm.status === 422, {
    status: duplicateConfirm.status,
    code: duplicateConfirm.json?.code || null,
    note: "Duplicate clicks are rejected as an invalid transition; the UI must debounce the button.",
  }, duplicateConfirm.status === 422 ? null : "P1");

  const compiling = await patchPlan(state, { type: "start_compile" }, cookie);
  assert.equal(compiling.status, 200, `start compile failed: ${compiling.text}`);
  state = compiling.json.plan;

  const failed = await patchPlan(state, { type: "fail", code: "SIMULATED_EMPTY_RESPONSE", message: "模拟上游空响应", retryable: true }, cookie);
  assert.equal(failed.status, 200, `mark failure failed: ${failed.text}`);
  state = failed.json.plan;
  const retried = await patchPlan(state, { type: "retry" }, cookie);
  assert.equal(retried.status, 200, `retry plan failed: ${retried.text}`);
  state = retried.json.plan;
  assert.equal(state.status, "compiling");

  const confirmedTask = {
    ...teacherTask,
    deckPlan: { ...state, status: "confirmed", confirmedAt: new Date().toISOString(), pageCount: state.pages.length },
  };
  const generated = await json("/api/generate-ppt", {
    method: "POST",
    body: JSON.stringify({
      scenario: "teacher_courseware",
      planningMode: "professional",
      mode: "agent",
      forceLocal: true,
      disablePublicSearch: true,
      projectId: state.projectId,
      teacherTask: confirmedTask,
      prompt: `请生成${teacherTask.schoolStage}${teacherTask.grade}${teacherTask.subject}${teacherTask.topic}课堂课件。`,
      uploadedAssets: teacherTask.uploadedFiles,
    }),
  }, cookie);
  assert.equal(generated.status, 200, `generation failed: ${generated.text.slice(0, 4000)}`);
  assert.equal(generated.json.project.slides.length, state.pages.length, "planned/generated page mismatch");

  const projectId = generated.json.projectId;
  const initialVersionId = generated.json.versionId;
  const initialSlides = generated.json.project.slides;
  const idempotencyKey = `matrix-edit-${projectId}`;
  const editBody = {
    projectId,
    baseVersionId: initialVersionId,
    operation: "manual_edit",
    idempotencyKey,
    payload: { slideId: initialSlides[0].id, patch: { subtitle: "客户路径矩阵：已完成可追溯编辑" } },
  };
  const edited = await json("/api/courseware-version", { method: "POST", body: JSON.stringify(editBody) }, cookie);
  assert.equal(edited.status, 201, `manual edit failed: ${edited.text}`);
  const duplicateEdit = await json("/api/courseware-version", { method: "POST", body: JSON.stringify(editBody) }, cookie);
  assert.equal(duplicateEdit.status, 200, `idempotent retry failed: ${duplicateEdit.text}`);
  assert.equal(duplicateEdit.json.versionId, edited.json.versionId);
  assert.equal(duplicateEdit.json.deduped, true);

  const restored = await json("/api/courseware-version", {
    method: "POST",
    body: JSON.stringify({
      projectId,
      baseVersionId: edited.json.versionId,
      operation: "restore_version",
      idempotencyKey: `matrix-restore-${projectId}`,
      payload: { restoreVersionId: initialVersionId },
    }),
  }, cookie);
  assert.equal(restored.status, 201, `restore failed: ${restored.text}`);
  assert.equal(JSON.stringify(restored.json.slides), JSON.stringify(initialSlides), "restored slide snapshot differs from original");

  const reopened = await json(`/api/courseware-version?projectId=${encodeURIComponent(projectId)}&versionId=${encodeURIComponent(restored.json.versionId)}`, {}, cookie);
  assert.equal(reopened.status, 200, `reopen failed: ${reopened.text}`);
  assert.equal(reopened.json.isCurrent, true);

  const exportedResponse = await raw("/api/export-pptx", {
    method: "POST",
    body: JSON.stringify({ projectId, versionId: restored.json.versionId }),
  }, cookie);
  const exported = Buffer.from(await exportedResponse.arrayBuffer());
  assert.equal(exportedResponse.status, 200, `export failed: ${exported.toString("utf8").slice(0, 500)}`);
  const artifactId = exportedResponse.headers.get("x-artifact-id") || "";
  assert.ok(artifactId, "export did not return artifact id");
  const downloadedResponse = await raw(`/api/courseware-artifacts/${artifactId}/download`, {}, cookie);
  const downloaded = Buffer.from(await downloadedResponse.arrayBuffer());
  assert.equal(downloadedResponse.status, 200, "durable download failed");
  assert.equal(sha256(downloaded), sha256(exported), "download hash differs from export hash");

  record("full-version-lifecycle", "delivery", true, {
    customerPath: "chapter -> replan -> confirm -> simulated failure -> retry -> generate -> edit -> duplicate retry -> restore -> export -> download -> reopen",
    projectId,
    initialVersionId,
    editedVersionId: edited.json.versionId,
    restoredVersionId: restored.json.versionId,
    artifactId,
    pageCount: initialSlides.length,
    exportBytes: downloaded.length,
    exportSha256: sha256(downloaded),
    idempotentRetryDeduped: duplicateEdit.json.deduped,
    elapsedMs: Date.now() - started,
  });
}

async function mobileAndErrorContracts() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  try {
    const imageRequests = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/generate-image")) imageRequests.push(request.url());
    });
    const response = await page.goto(`${BASE_URL}/teacher-ai-ppt`, { waitUntil: "networkidle", timeout: 60_000 });
    assert.equal(response?.status(), 200);
    const bodyText = await page.locator("body").innerText();
    const metrics = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    const expectedEntries = ["从教材章节备课", "从教案生成", "优化已有课件"];
    const foundEntries = expectedEntries.filter((text) => bodyText.includes(text));
    const screenshotPath = path.join(OUTPUT_DIR, "mobile-entry-390x844.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const passed = foundEntries.length === expectedEntries.length && metrics.scrollWidth <= metrics.viewportWidth + 1;
    record("mobile-entry", "mobile", passed, { ...metrics, expectedEntries, foundEntries, screenshotPath, imageRequests: imageRequests.length }, passed ? null : "P1");
  } finally {
    await browser.close();
  }

  const prototypeSource = fs.readFileSync(path.join(ROOT, "components", "TeacherPptBetaPrototype.tsx"), "utf8");
  const planHasEmptyGuard = /teacher-courseware-plan[\s\S]{0,500}response\.json\(\)\.catch/.test(prototypeSource);
  const generationHasEmptyGuard = /generate-ppt[\s\S]{0,1200}response\.json\(\)\.catch/.test(prototypeSource);
  record("empty-response-plan-ui", "error UX", planHasEmptyGuard, {
    behavior: planHasEmptyGuard ? "empty JSON is converted to a domain message" : "native Response.json SyntaxError can reach the teacher",
    source: "components/TeacherPptBetaPrototype.tsx#preparePlan",
  }, planHasEmptyGuard ? null : "P1");
  record("empty-response-generate-ui", "error UX", generationHasEmptyGuard, {
    behavior: generationHasEmptyGuard ? "empty response has a teacher-readable fallback" : "empty response can expose a JSON parser exception",
    source: "components/TeacherPptBetaPrototype.tsx#generate",
  }, generationHasEmptyGuard ? null : "P1");
  if (!planHasEmptyGuard) {
    finding(
      "CUSTOMER-PATH-EMPTY-PLAN-001",
      "P1",
      "规划接口空响应仍会把 JSON 解析异常暴露给教师",
      "在 /teacher-ai-ppt 完成基础信息后，将 POST /api/teacher-courseware-plan 拦截为 HTTP 500 空 body，再点击生成教学大纲。preparePlan 直接 await response.json()。",
      "让规划与生成共用安全 JSON 解析器；空 body 映射为“规划服务暂时无响应，请重试并提交工单”，同时保留 HTTP 状态和 requestId。",
      { source: "components/TeacherPptBetaPrototype.tsx#preparePlan" },
    );
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const health = await raw("/teacher-ai-ppt");
  assert.equal(health.status, 200, `${BASE_URL}/teacher-ai-ppt is not available`);
  const cookie = await register();

  const sourceText = fs.readFileSync(path.join(ROOT, "tests", "fixtures", "uploads", "sample.txt"));
  const textbookUpload = await uploadBytes(cookie, sourceText, "人教版高中物理选择性必修第二册教材.txt", "text/plain");
  const textbookAsset = uploadedAsset(textbookUpload, "textbook");
  record("upload-textbook", "upload", textbookUpload.analysis?.parseStatus === "parsed", {
    status: textbookUpload.status,
    parseStatus: textbookUpload.analysis?.parseStatus,
    blockCount: textbookUpload.analysis?.blockCount,
    assetId: textbookUpload.assetId,
  }, textbookUpload.analysis?.parseStatus === "parsed" ? null : "P0");

  const docxBytes = fs.readFileSync(path.join(ROOT, "tests", "fixtures", "uploads", "sample.docx"));
  const lessonPlanUpload = await uploadBytes(cookie, docxBytes, "八年级语文背影教案.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const lessonPlanAsset = uploadedAsset(lessonPlanUpload, "lesson_plan");
  record("upload-lesson-plan", "upload", ["parsed", "partial"].includes(lessonPlanUpload.analysis?.parseStatus), {
    status: lessonPlanUpload.status,
    parseStatus: lessonPlanUpload.analysis?.parseStatus,
    blockCount: lessonPlanUpload.analysis?.blockCount,
    assetId: lessonPlanUpload.assetId,
  }, ["parsed", "partial"].includes(lessonPlanUpload.analysis?.parseStatus) ? null : "P0");

  const pptxCandidates = fs.readdirSync(path.join(ROOT, "artifacts", "courseware-exports"), { recursive: true })
    .filter((name) => typeof name === "string" && name.toLowerCase().endsWith(".pptx"));
  let existingDeckAsset = null;
  if (pptxCandidates.length) {
    const pptxPath = path.join(ROOT, "artifacts", "courseware-exports", pptxCandidates[0]);
    const pptxUpload = await uploadBytes(cookie, fs.readFileSync(pptxPath), "已有课件-楞次定律.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    existingDeckAsset = uploadedAsset(pptxUpload, "existing_deck");
    record("upload-existing-pptx", "beautify intake", ["parsed", "partial"].includes(pptxUpload.analysis?.parseStatus), {
      status: pptxUpload.status,
      parseStatus: pptxUpload.analysis?.parseStatus,
      pageCount: pptxUpload.analysis?.pageCount,
      blockCount: pptxUpload.analysis?.blockCount,
      routeOnly: true,
      imageGeneration: false,
    }, ["parsed", "partial"].includes(pptxUpload.analysis?.parseStatus) ? null : "P1");
  } else {
    record("upload-existing-pptx", "beautify intake", false, { reason: "No existing PPTX artifact was available for route/parse validation." }, "P1");
  }

  const cases = [
    {
      id: "preschool-math-chapter",
      customerPath: "新建章节备课",
      ageSubject: "幼儿园小班/数学/30分钟",
      expectedStatuses: [200],
      teacherTask: task({ schoolStage: "幼儿园", grade: "小班", subject: "数学", topic: "数字1-10", duration: "30分钟", textbook: "幼儿园数学活动材料", chapter: "数字1-10", textbookIdentity: { displayName: "幼儿园数学活动材料", verificationStatus: "teacher_confirmed" }, chapterIdentity: { chapter: "数字1-10", verificationStatus: "teacher_confirmed" } }),
    },
    {
      id: "primary-math-catalog-candidate",
      customerPath: "新建章节备课/常见教材输入",
      ageSubject: "小学一年级/数学/40分钟",
      expectedStatuses: [200],
      teacherTask: task({ schoolStage: "小学", grade: "一年级", subject: "数学", topic: "10以内加减法", duration: "40分钟", textbook: "人教版数学一年级上册", chapter: "第五单元 6-10的认识和加减法", textbookIdentity: { displayName: "人教版数学一年级上册", publisher: "人民教育出版社", volume: "上册", verificationStatus: "unverified" }, chapterIdentity: { chapter: "第五单元 6-10的认识和加减法", verificationStatus: "unverified" } }),
    },
    {
      id: "junior-chinese-lesson-plan",
      customerPath: "从教案/材料生成",
      ageSubject: "初中八年级/语文/45分钟",
      expectedStatuses: [200],
      teacherTask: task({ generationMode: "lesson_plan", schoolStage: "初中", grade: "八年级", subject: "语文", topic: "背影", pastedMaterials: "抓住父亲过铁道买橘子的细节，分析人物形象和叙事视角。", uploadedFiles: [lessonPlanAsset], sourcePolicy: "uploaded_only" }),
    },
    {
      id: "junior-english-text-material",
      customerPath: "粘贴教材文本生成",
      ageSubject: "初中七年级/英语/45分钟",
      expectedStatuses: [200],
      teacherTask: task({ generationMode: "lesson_plan", schoolStage: "初中", grade: "七年级", subject: "英语", topic: "My school day", pastedMaterials: "Students describe their daily routines using the simple present tense and time expressions." }),
    },
    {
      id: "senior-physics-uploaded-textbook",
      customerPath: "上传教材并章节备课",
      ageSubject: "高中高二/物理/45分钟",
      expectedStatuses: [200],
      teacherTask: task({ schoolStage: "高中", grade: "高二", subject: "物理", topic: "楞次定律", textbook: "人教版高中物理选择性必修第二册", chapter: "第二章 电磁感应", textbookIdentity: { displayName: "人教版高中物理选择性必修第二册", publisher: "人民教育出版社", volume: "选择性必修第二册", sourceAssetId: textbookAsset.assetId, verificationStatus: "asset_verified" }, chapterIdentity: { chapter: "第二章 电磁感应", verificationStatus: "asset_verified" }, uploadedFiles: [textbookAsset], sourcePolicy: "uploaded_only" }),
    },
    {
      id: "ambiguous-textbook",
      customerPath: "教材简称/歧义识别",
      ageSubject: "小学三年级/数学",
      expectedStatuses: [422],
      teacherTask: task({ schoolStage: "小学", grade: "三年级", subject: "数学", topic: "分数的初步认识", textbook: "人教版", chapter: "分数", textbookIdentity: { displayName: "人教版", verificationStatus: "unverified" }, chapterIdentity: { chapter: "分数", verificationStatus: "unverified" } }),
    },
    {
      id: "missing-textbook-required",
      customerPath: "必填缺失",
      ageSubject: "初中八年级/物理",
      expectedStatuses: [422],
      teacherTask: task({ schoolStage: "初中", grade: "八年级", subject: "物理", topic: "光的反射", textbook: "", chapter: "" }),
    },
    {
      id: "trusted-catalog-exact",
      customerPath: "可信目录策略但未确认",
      ageSubject: "高中高一/化学",
      expectedStatuses: [422],
      teacherTask: task({ schoolStage: "高中", grade: "高一", subject: "化学", topic: "物质的量", textbook: "人教版高中化学必修第一册", chapter: "第二章", sourcePolicy: "trusted_catalog", textbookIdentity: { displayName: "人教版高中化学必修第一册", publisher: "人民教育出版社", volume: "必修第一册", verificationStatus: "unverified" }, chapterIdentity: { chapter: "第二章", verificationStatus: "unverified" } }),
    },
    {
      id: "failed-upload-blocked",
      customerPath: "上传解析失败",
      ageSubject: "高中高三/历史",
      expectedStatuses: [422],
      teacherTask: task({ generationMode: "lesson_plan", schoolStage: "高中", grade: "高三", subject: "历史", topic: "近代中国思想解放", uploadedFiles: [{ name: "损坏教案.docx", materialRole: "lesson_plan", analysis: { parseStatus: "failed", blockCount: 0, pageCount: 0 } }], sourcePolicy: "uploaded_only" }),
    },
    {
      id: "primary-chinese-catalog",
      customerPath: "小学语文教材章节",
      ageSubject: "小学三年级/语文/45分钟",
      expectedStatuses: [200],
      teacherTask: task({ schoolStage: "小学", grade: "三年级", subject: "语文", topic: "秋天的雨", textbook: "统编版语文三年级上册", chapter: "第三单元", textbookIdentity: { displayName: "统编版语文三年级上册", publisher: "人民教育出版社", volume: "上册", verificationStatus: "unverified" }, chapterIdentity: { chapter: "第三单元", verificationStatus: "unverified" } }),
    },
    {
      id: "junior-biology-catalog",
      customerPath: "初中生物教材章节",
      ageSubject: "初中八年级/生物/45分钟",
      expectedStatuses: [200],
      teacherTask: task({ schoolStage: "初中", grade: "八年级", subject: "生物", topic: "生物的遗传和变异", textbook: "人教版生物八年级上册", chapter: "第五单元", textbookIdentity: { displayName: "人教版生物八年级上册", publisher: "人民教育出版社", volume: "上册", verificationStatus: "unverified" }, chapterIdentity: { chapter: "第五单元", verificationStatus: "unverified" } }),
    },
    {
      id: "senior-geography-catalog",
      customerPath: "高中地理教材章节",
      ageSubject: "高中高一/地理/45分钟",
      expectedStatuses: [200],
      teacherTask: task({ schoolStage: "高中", grade: "高一", subject: "地理", topic: "大气的运动", textbook: "人教版高中地理必修第一册", chapter: "第二章", textbookIdentity: { displayName: "人教版高中地理必修第一册", publisher: "人民教育出版社", volume: "必修第一册", verificationStatus: "unverified" }, chapterIdentity: { chapter: "第二章", verificationStatus: "unverified" } }),
    },
  ];
  if (existingDeckAsset) {
    cases.push({
      id: "beautify-existing-pptx",
      customerPath: "已有 PPT 美化入口/只测路由与解析",
      ageSubject: "高中高二/物理",
      expectedStatuses: [200],
      teacherTask: task({ generationMode: "optimize_existing", schoolStage: "高中", grade: "高二", subject: "物理", topic: "楞次定律", uploadedFiles: [existingDeckAsset], sourcePolicy: "uploaded_only", beautifyOptions: { intensity: "balanced", sourceAssetId: existingDeckAsset.assetId, preserveBrand: true, preserveOrder: true } }),
    });
  }

  for (const caseInfo of cases) await planCase(caseInfo);

  const exactCatalog = results.find((item) => item.id === "primary-math-catalog-candidate");
  if (exactCatalog?.catalogStatus === "exact" && exactCatalog?.textbookMatch === "catalog_verified" && exactCatalog?.readiness === "ready") {
    finding(
      "CUSTOMER-PATH-CATALOG-IDENTITY-ONLY-003",
      "P1",
      "目录命中只证明教材身份，不证明章节内容依据",
      "输入完整的版次、学科、年级和册次后，目录在几十毫秒内返回 exact/catalog_verified，规划直接进入 ready；当前目录覆盖声明是 identity-only，不含章节、页码、ISBN，也没有上传教材原文。",
      "在界面和交付门禁中区分“教材身份已识别”和“章节依据已核验”；没有上传原文或可信章节源时，必须显示待核对状态并在教师确认/试讲前阻止宣称教材事实。",
      { catalogStatus: exactCatalog.catalogStatus, textbookMatch: exactCatalog.textbookMatch, readiness: exactCatalog.readiness, pageCount: exactCatalog.pageCount },
    );
  }
  if (exactCatalog?.catalogStatus === "exact" && exactCatalog?.textbookMatch !== "catalog_verified") {
    finding(
      "CUSTOMER-PATH-TEXTBOOK-CONFIRM-001",
      "P1",
      "教材候选可以即时识别，但不会自动成为可信教材依据",
      "选择小学一年级数学，输入“人教版数学一年级上册”和对应出版社/册次后请求规划。目录解析返回 exact，但 textbookMatch 仍是 catalog_candidate，需要教师确认或上传原件。",
      "在前端把“匹配到候选”和“已核验”分开显示；提供一键确认具体版次/册次/章节，确认后再写 catalog_verified。不要把候选静默当作事实。",
      { catalogStatus: exactCatalog.catalogStatus, textbookMatch: exactCatalog.textbookMatch, confidence: exactCatalog.matchConfidence },
    );
  }
  // Ambiguous chapter identities are now rejected by the planning API itself;
  // the UI additionally offers candidates and an upload-original shortcut.

  const fullTask = cases.find((item) => item.id === "senior-physics-uploaded-textbook").teacherTask;
  await fullLifecycle(cookie, fullTask);

  const invalidJson = await raw("/api/courseware-version", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }, cookie);
  const invalidJsonData = await responseData(invalidJson);
  record("invalid-json-400", "error contract", invalidJsonData.status === 400 && Boolean(invalidJsonData.json?.message), {
    status: invalidJsonData.status, contentType: invalidJsonData.contentType, message: invalidJsonData.json?.message || null,
  }, invalidJsonData.status === 400 && invalidJsonData.json?.message ? null : "P1");

  const invalidPlan = await json("/api/teacher-courseware-plan", { method: "POST", body: JSON.stringify({}) });
  record("missing-plan-task-400", "error contract", invalidPlan.status === 400 && Boolean(invalidPlan.json?.message), {
    status: invalidPlan.status, contentType: invalidPlan.contentType, message: invalidPlan.json?.message || null,
  }, invalidPlan.status === 400 && invalidPlan.json?.message ? null : "P1");

  await mobileAndErrorContracts();

  assert.equal(imageApiCalls, 0, "customer path matrix must never call the image API");
  const summary = {
    schemaVersion: "teacher-customer-path-matrix/v1",
    runId: RUN_ID,
    baseUrl: BASE_URL,
    startedAt,
    completedAt: new Date().toISOString(),
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
    p0: findings.filter((item) => item.severity === "P0").length,
    p1: findings.filter((item) => item.severity === "P1").length,
    p2: findings.filter((item) => item.severity === "P2").length,
    imageApiCalls,
    findings,
    results,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "report.json"), JSON.stringify(summary, null, 2), "utf8");
  const markdown = [
    "# Teacher Customer Path Matrix",
    "",
    `- Run: ${summary.runId}`,
    `- Base URL: ${summary.baseUrl}`,
    `- Checks: ${summary.passed}/${summary.total} passed`,
    `- Findings: P0 ${summary.p0} / P1 ${summary.p1} / P2 ${summary.p2}`,
    `- Image API calls: ${summary.imageApiCalls}`,
    "",
    "## Findings",
    "",
    ...(summary.findings.length ? summary.findings.flatMap((item) => [
      `### ${item.severity} ${item.id}: ${item.title}`,
      "",
      `- Reproduction: ${item.reproduction}`,
      `- Recommendation: ${item.recommendation}`,
      `- Evidence: \`${JSON.stringify(item.evidence)}\``,
      "",
    ]) : ["No product findings.", ""]),
    "## Matrix",
    "",
    "| Check | Area | Result | HTTP/State | Textbook match | Notes |",
    "|---|---|---:|---|---|---|",
    ...summary.results.map((item) => `| ${item.id} | ${item.area} | ${item.passed ? "PASS" : "FAIL"} | ${item.status ?? item.readiness ?? "-"} | ${item.textbookMatch ?? "-"} | ${(item.responseMessage || item.reason || item.behavior || item.customerPath || "-").replace(/\|/g, "\\|")} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUTPUT_DIR, "report.md"), markdown, "utf8");
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  const failure = { runId: RUN_ID, baseUrl: BASE_URL, fatal: String(error?.stack || error), imageApiCalls, results, findings };
  fs.writeFileSync(path.join(OUTPUT_DIR, "fatal.json"), JSON.stringify(failure, null, 2), "utf8");
  console.error(failure.fatal);
  process.exitCode = 1;
});
