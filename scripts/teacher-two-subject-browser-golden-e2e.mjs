import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-two-subject-browser-golden");
const edge = [
  `${process.env.ProgramFiles}/Microsoft/Edge/Application/msedge.exe`,
  `${process.env["ProgramFiles(x86)"]}/Microsoft/Edge/Application/msedge.exe`,
].find((file) => file && fs.existsSync(file));

const cases = [
  {
    id: "physics-h2-lenz",
    folder: "高二物理-楞次定律",
    schoolStage: "高中",
    grade: "高二",
    subject: "物理",
    topic: "楞次定律",
    textbook: "人教版高中物理选择性必修第二册",
    chapter: "第二章 电磁感应",
    classSize: "46",
    equipment: "仅投影，无实验设备",
    baseline: "已经学习磁通量，但右手螺旋定则不熟练",
    difficulties: "容易把阻碍变化理解为感应磁场方向永远与原磁场相反",
    requirements: "包含实验观察、方向判断、纠错和迁移练习",
    architectureLabel: "实验探究课",
    editedAction: "先展示两组相反现象，让学生只记录事实，不提前公布规律。",
    noteSuffix: "；提醒学生先判断磁通量变化，再判断感应磁场方向。",
    requiredTerms: ["楞次定律", "磁通量", "右手螺旋定则"],
  },
  {
    id: "chinese-j8-beiying",
    folder: "初二语文-背影",
    schoolStage: "初中",
    grade: "八年级",
    subject: "语文",
    topic: "背影",
    textbook: "人教版八年级上册",
    chapter: "第五单元",
    classSize: "44",
    equipment: "投影、黑板，可播放朗读音频",
    baseline: "能够概括叙事内容，但引用文本证据解释情感变化的能力较弱",
    difficulties: "容易只概括父爱，忽略动作词、叙述视角和情感推进",
    requirements: "围绕关键段落进行细读，完成朗读、批注、证据回扣和表达迁移",
    architectureLabel: "文本精读课",
    editedAction: "先让学生默读并圈画父亲过铁道时的动作词，再交流这些动作带来的画面感。",
    noteSuffix: "；追问学生必须引用动作词说明情感，而不能只回答“父爱伟大”。",
    requiredTerms: ["背影", "攀", "缩", "倾"],
  },
];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function waitForCommit(page, operation) {
  return page.waitForResponse((response) => {
    if (!response.url().endsWith("/api/courseware-version") || response.request().method() !== "POST") return false;
    try {
      return response.request().postDataJSON()?.operation === operation;
    } catch {
      return false;
    }
  }, { timeout: 120_000 });
}

async function screenshot(page, folder, name, fullPage = false) {
  const target = path.join(outputDir, folder, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: target, fullPage, animations: "disabled" });
  return target;
}

async function registerFromEntry(page) {
  await page.getByRole("button", { name: "登录查看历史课件" }).click();
  await screenshot(page, "操作入口", "00-登录窗口.png");
  const modal = page.locator("div.fixed.inset-0").last();
  await modal.getByRole("button", { name: "注册" }).click();
  const inputs = modal.locator("input");
  await inputs.nth(0).fill("双学科黄金链教师");
  await inputs.nth(1).fill(`browser-golden-${Date.now()}@example.com`);
  await inputs.nth(2).fill("Teacher123!");
  await screenshot(page, "操作入口", "01-注册信息.png");
  await modal.getByRole("button", { name: /注册并领取/ }).click();
  await modal.waitFor({ state: "detached", timeout: 30_000 });
  await page.getByTestId("teacher-recent-projects").waitFor({ timeout: 30_000 });
}

async function startNewLesson(page, testCase) {
  await page.getByText("从教材章节备课", { exact: true }).click();
  await page.getByLabel("学段").selectOption(testCase.schoolStage);
  await page.getByLabel("年级").selectOption(testCase.grade);
  await page.getByLabel("学科").selectOption(testCase.subject);
  await page.getByLabel("课题").fill(testCase.topic);
  await screenshot(page, testCase.folder, "01-课堂基本信息.png");
  await page.getByRole("button", { name: "继续" }).click();

  await page.getByPlaceholder("可选择或输入教材版本").fill(testCase.textbook);
  await page.getByPlaceholder("可选择或输入章节").fill(testCase.chapter);
  await page.getByLabel("班级人数").fill(testCase.classSize);
  await page.getByLabel("可用设备").fill(testCase.equipment);
  await page.getByLabel("学生基础").fill(testCase.baseline);
  await page.getByLabel("常见困难").fill(testCase.difficulties);
  await page.getByRole("button", { name: "理解建构" }).click();
  await page.getByLabel("教学要求").fill(testCase.requirements);
  await screenshot(page, testCase.folder, "02-教材学情与课堂条件.png");
  await page.getByRole("button", { name: "继续" }).click();
  await screenshot(page, testCase.folder, "03-生成偏好.png");

  const planResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/teacher-courseware-plan") && response.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: "开始生成课件" }).click();
  const planResponse = await planResponsePromise;
  if (!planResponse.ok()) throw new Error(`${testCase.id}: planning failed ${planResponse.status()}`);
  const planner = page.getByTestId("teacher-outline-planner");
  await planner.waitFor({ timeout: 30_000 });
  await planner.getByText(testCase.architectureLabel, { exact: true }).waitFor();
  await planner.getByTestId("teacher-lesson-canvas").waitFor();
  await screenshot(page, testCase.folder, "04-课堂画布.png", true);
  await planner.getByRole("tab", { name: "列表编辑" }).click();
  const eventCount = await planner.locator('article[data-testid^="lesson-event-"]').count();
  const pageCount = await planner.locator('[data-testid^="outline-page-"]').count();
  if (eventCount === pageCount || eventCount < 5 || pageCount < 7) {
    throw new Error(`${testCase.id}: lesson events/pages are not independently planned (${eventCount}/${pageCount})`);
  }
  await planner.getByLabel("教师动作").first().fill(testCase.editedAction);
  await screenshot(page, testCase.folder, "05-课堂方案确认.png", true);

  const stateResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/teacher-courseware-plan/state") && response.request().method() === "POST", { timeout: 60_000 });
  const generateResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/generate-ppt") && response.request().method() === "POST", { timeout: 240_000 });
  await planner.getByRole("button", { name: "确认课堂方案并生成" }).click();
  const stateResponse = await stateResponsePromise;
  const generateResponse = await generateResponsePromise;
  if (stateResponse.status() !== 201 || !generateResponse.ok()) {
    throw new Error(`${testCase.id}: persistence/generation failed ${stateResponse.status()}/${generateResponse.status()}`);
  }
  const generated = await generateResponse.json();
  try {
    await page.getByRole("button", { name: "导出课件" }).waitFor({ timeout: 120_000 });
  } catch (error) {
    await screenshot(page, testCase.folder, "05-生成后异常现场.png").catch(() => undefined);
    const bodyText = await page.locator("body").innerText().catch(() => "");
    throw new Error(`${testCase.id}: workspace did not become ready at ${page.url()} body=${bodyText.slice(0, 1200)}; ${error instanceof Error ? error.message : error}`);
  }
  await screenshot(page, testCase.folder, "05-课件工作台.png");
  if (process.env.GENERATE_VISUALS === "1") {
    await page.getByTitle("设计").click();
    const visualsCommitPromise = waitForCommit(page, "generate_visuals");
    await page.getByRole("button", { name: "生成页面视觉" }).click();
    const visualsCommit = await visualsCommitPromise;
    if (!visualsCommit.ok()) throw new Error(`${testCase.id}: visual generation commit failed ${visualsCommit.status()}`);
    await page.getByText(/视觉生成完成|已生成.*课堂视觉/).waitFor({ timeout: 300_000 });
    await screenshot(page, testCase.folder, "05a-高质量页面视觉.png");
  }
  return { generated, eventCount, pageCount };
}

async function verifyDeliveryAndEdit(page, testCase) {
  await page.getByText("交付包", { exact: true }).first().click();
  const pack = page.getByTestId("teacher-delivery-pack");
  await pack.waitFor();
  for (const text of ["逐页讲稿", "答案要点", "板书分区", "分层作业", "基础", "提高", "迁移"]) {
    await pack.getByText(text, { exact: false }).first().waitFor();
  }
  await screenshot(page, testCase.folder, "06-教师交付包.png");

  await page.getByTitle("内容").click();
  const note = page.getByLabel("教师讲稿");
  const originalNote = await note.inputValue();
  await note.fill(`${originalNote}${testCase.noteSuffix}`);
  const commitPromise = waitForCommit(page, "manual_edit");
  await page.getByRole("button", { name: "保存本页" }).click();
  const commitResponse = await commitPromise;
  if (!commitResponse.ok()) throw new Error(`${testCase.id}: manual edit failed ${commitResponse.status()}`);
  const commit = await commitResponse.json();
  await screenshot(page, testCase.folder, "07-修改后新版本.png");
  return { editedNote: `${originalNote}${testCase.noteSuffix}`, versionId: commit.versionId };
}

async function reviewAndExport(page, testCase, generated, editedNote) {
  await page.getByTitle("检查").click();
  await page.getByRole("button", { name: "提交教师审核" }).waitFor();
  await screenshot(page, testCase.folder, "08-课前检查.png");
  const reviewPromise = waitForCommit(page, "teacher_submit_for_review");
  await page.getByRole("button", { name: "提交教师审核" }).click();
  const reviewResponse = await reviewPromise;
  if (!reviewResponse.ok()) throw new Error(`${testCase.id}: teacher review failed ${reviewResponse.status()}`);
  const review = await reviewResponse.json();
  const exportResponsePromise = page.waitForResponse((response) => response.url().endsWith("/api/export-pptx") && response.request().method() === "POST", { timeout: 240_000 });
  const downloadPromise = page.waitForEvent("download", { timeout: 240_000 }).catch(() => null);
  await page.getByRole("button", { name: "导出课件" }).click();
  const exportResponse = await exportResponsePromise;
  if (!exportResponse.ok()) {
    const detail = await exportResponse.text().catch(() => "");
    throw new Error(`${testCase.id}: export failed ${exportResponse.status()} ${detail.slice(0, 1500)}`);
  }
  await page.getByText(/教师批准稿已按当前服务器版本导出/).waitFor({ timeout: 30_000 });
  await screenshot(page, testCase.folder, "09-导出成功.png");
  const download = await downloadPromise;
  if (!download) throw new Error(`${testCase.id}: export succeeded without a browser download`);
  const downloadedPath = path.join(outputDir, testCase.folder, `${testCase.folder}-教师确认稿.pptx`);
  await download.saveAs(downloadedPath);
  const downloadedBytes = fs.readFileSync(downloadedPath);
  const zip = await JSZip.loadAsync(downloadedBytes);
  const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  if (slideFiles.length !== generated.project.slides.length) throw new Error(`${testCase.id}: downloaded slide count mismatch`);
  const artifactId = exportResponse.headers()["x-artifact-id"] || "";
  if (!artifactId) throw new Error(`${testCase.id}: export did not return artifact id`);
  const durable = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "same-origin" });
    const bytes = response.ok ? Array.from(new Uint8Array(await response.arrayBuffer())) : [];
    return { ok: response.ok, status: response.status, bytes };
  }, `/api/courseware-artifacts/${artifactId}/download`);
  if (!durable.ok) throw new Error(`${testCase.id}: durable download failed ${durable.status}`);
  const durableBytes = Buffer.from(durable.bytes);
  if (sha256(durableBytes) !== sha256(downloadedBytes)) throw new Error(`${testCase.id}: browser download and durable artifact differ`);
  const reopened = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "same-origin" });
    return { ok: response.ok, status: response.status, data: response.ok ? await response.json() : null };
  }, `/api/courseware-version?projectId=${encodeURIComponent(generated.projectId)}&versionId=${encodeURIComponent(review.versionId)}`);
  if (!reopened.ok) throw new Error(`${testCase.id}: reviewed version cannot be read (${reopened.status})`);
  const snapshot = reopened.data;
  if (snapshot.teacherReadiness !== "ready_for_teacher") throw new Error(`${testCase.id}: teacher review state was not persisted`);
  if (!snapshot.slides?.[0]?.speakerNote?.includes(testCase.noteSuffix.slice(1))) throw new Error(`${testCase.id}: edited teacher note was lost`);
  const contentText = JSON.stringify(snapshot);
  const missingTerms = testCase.requiredTerms.filter((term) => !contentText.includes(term));
  if (missingTerms.length) throw new Error(`${testCase.id}: reopened version missing ${missingTerms.join(", ")}`);
  return {
    artifactId,
    versionId: review.versionId,
    versionNumber: snapshot.versionNumber,
    teacherReadiness: snapshot.teacherReadiness,
    downloadedPath,
    byteSize: downloadedBytes.length,
    sha256: sha256(downloadedBytes),
  };
}

async function reopenFromHome(context, oldPage, testCase, expected) {
  const page = await context.newPage();
  await page.goto(`${base}/teacher-ai-ppt`, { waitUntil: "networkidle", timeout: 60_000 });
  const recent = page.getByTestId("teacher-recent-projects");
  await recent.waitFor({ timeout: 30_000 });
  await recent.getByText(testCase.topic, { exact: true }).waitFor();
  await screenshot(page, testCase.folder, "10-新页面最近课件.png");
  await recent.getByText(testCase.topic, { exact: true }).click();
  await page.getByRole("button", { name: "导出课件" }).waitFor({ timeout: 60_000 });
  await page.getByText(testCase.topic, { exact: true }).first().waitFor();
  await page.getByRole("button", { name: new RegExp(`版本 V${expected.versionNumber}`) }).click();
  await page.getByText("版本历史", { exact: true }).waitFor();
  await screenshot(page, testCase.folder, "11-重新打开与版本历史.png");
  await page.getByLabel("关闭版本列表").click();
  await oldPage.close();
  return page;
}

fs.mkdirSync(outputDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), base, pass: false, cases: [], consoleErrors: [] };
const browser = await chromium.launch({ headless: true, executablePath: edge });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
let page = await context.newPage();
  page.on("console", (message) => message.type() === "error" && !/ERR_NETWORK_ACCESS_DENIED/.test(message.text()) && report.consoleErrors.push(message.text()));

try {
  await page.goto(`${base}/teacher-ai-ppt`, { waitUntil: "networkidle", timeout: 60_000 });
  await registerFromEntry(page);
  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index];
    if (index > 0) {
      await page.getByRole("button", { name: "新建课件" }).click();
      await page.getByText("从教材章节备课", { exact: true }).waitFor();
    }
    const planned = await startNewLesson(page, testCase);
    const edited = await verifyDeliveryAndEdit(page, testCase);
    const exported = await reviewAndExport(page, testCase, planned.generated, edited.editedNote);
    page = await reopenFromHome(context, page, testCase, exported);
    page.on("console", (message) => message.type() === "error" && !/ERR_NETWORK_ACCESS_DENIED/.test(message.text()) && report.consoleErrors.push(message.text()));
    report.cases.push({
      id: testCase.id,
      projectId: planned.generated.projectId,
      eventCount: planned.eventCount,
      pageCount: planned.pageCount,
      architecture: planned.generated.project.contentPlan.lessonBlueprint.architecture,
      ...exported,
    });
  }
  if (report.consoleErrors.length) throw new Error(`browser console errors: ${report.consoleErrors.join(" | ")}`);
  report.pass = true;
} catch (error) {
  report.error = String(error?.stack || error);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.pass) process.exitCode = 1;
}
