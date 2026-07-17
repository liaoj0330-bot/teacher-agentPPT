import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-lesson-blueprint-persistence");
fs.mkdirSync(outputDir, { recursive: true });
const edge = [
  `${process.env.ProgramFiles}/Microsoft/Edge/Application/msedge.exe`,
  `${process.env["ProgramFiles(x86)"]}/Microsoft/Edge/Application/msedge.exe`,
].find((file) => file && fs.existsSync(file));
const browser = await chromium.launch({ headless: true, executablePath: edge });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const consoleErrors = [];
let generatedRequest;
page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
page.on("request", (request) => {
  if (request.url().endsWith("/api/generate-ppt") && request.method() === "POST") generatedRequest = request.postDataJSON();
});

const report = { startedAt: new Date().toISOString(), base, pass: false };
try {
  await page.goto(`${base}/teacher-ai-ppt`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByText("从教材章节备课", { exact: true }).click();
  await page.getByLabel("学段").selectOption("高中");
  await page.getByLabel("年级").selectOption("高二");
  await page.getByLabel("学科").selectOption("物理");
  await page.getByLabel("课题").fill("楞次定律");
  await page.getByRole("button", { name: "继续" }).click();
  await page.getByPlaceholder("可选择或输入教材版本").fill("人教版高中物理选择性必修第二册");
  await page.getByPlaceholder("可选择或输入章节").fill("第二章 电磁感应");
  await page.getByLabel("可用设备").fill("仅投影，无实验设备");
  await page.getByLabel("学生基础").fill("已经学习磁通量，但右手螺旋定则不熟练");
  await page.getByLabel("常见困难").fill("容易把阻碍变化理解为方向永远相反");
  await page.getByRole("button", { name: "理解建构" }).click();
  await page.getByLabel("教学要求").fill("包含实验观察、方向判断、纠错和迁移练习");
  await page.getByRole("button", { name: "继续" }).click();
  const planResponse = page.waitForResponse((response) => response.url().endsWith("/api/teacher-courseware-plan") && response.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /开始生成课件|登录后生成课件/ }).click();
  if ((await planResponse).status() !== 200) throw new Error("planning API failed");
  const planner = page.getByTestId("teacher-outline-planner");
  await planner.waitFor({ timeout: 30_000 });
  const editedAction = "先展示两组相反现象，让学生只记录事实，不提前公布规律。";
  await planner.getByLabel("教师动作").first().fill(editedAction);
  await planner.getByRole("button", { name: /确认课堂方案并生成/ }).click();
  const modal = page.locator("div.fixed.inset-0").last();
  await modal.getByRole("button", { name: "注册" }).click();
  const inputs = modal.locator("input");
  await inputs.nth(0).fill("Blueprint E2E");
  await inputs.nth(1).fill(`blueprint-${Date.now()}@example.com`);
  await inputs.nth(2).fill("Teacher123!");
  await modal.getByRole("button", { name: /注册并领取/ }).click();
  await modal.waitFor({ state: "detached", timeout: 30_000 });
  const stateResponse = page.waitForResponse((response) => response.url().endsWith("/api/teacher-courseware-plan/state") && response.request().method() === "POST", { timeout: 60_000 });
  const generateResponse = page.waitForResponse((response) => response.url().endsWith("/api/generate-ppt") && response.request().method() === "POST", { timeout: 240_000 });
  await planner.getByRole("button", { name: /确认课堂方案并生成/ }).click();
  const created = await stateResponse;
  if (created.status() !== 201) throw new Error(`state create failed ${created.status()}`);
  const createdBody = await created.json();
  const generated = await generateResponse;
  if (!generated.ok()) throw new Error(`generate failed ${generated.status()}`);
  const generatedBody = await generated.json();
  const requestBlueprint = generatedRequest?.teacherTask?.deckPlan?.lessonBlueprint;
  if (!requestBlueprint || requestBlueprint.lessonPlan?.events?.[0]?.teacherAction !== editedAction) throw new Error("edited classroom event did not reach generation request");
  const versionId = generatedBody.versionId;
  const projectId = generatedBody.projectId;
  const reopenedResponse = await page.request.get(`${base}/api/courseware-version?projectId=${encodeURIComponent(projectId)}&versionId=${encodeURIComponent(versionId)}`);
  if (!reopenedResponse.ok()) throw new Error(`reopen failed ${reopenedResponse.status()}`);
  const reopened = await reopenedResponse.json();
  if (reopened.contentPlan?.lessonBlueprint?.status !== "teacher_confirmed") throw new Error("reopened version lost confirmed blueprint status");
  if (reopened.contentPlan?.lessonBlueprint?.lessonPlan?.events?.[0]?.teacherAction !== editedAction) throw new Error("reopened version lost edited classroom event");
  await page.getByRole("button", { name: "导出课件" }).waitFor({ timeout: 120_000 });
  await page.screenshot({ path: path.join(outputDir, "generated-workspace.png"), fullPage: true });
  if (consoleErrors.length) throw new Error(`console errors: ${consoleErrors.join(" | ")}`);
  Object.assign(report, { pass: true, projectId, versionId, planProjectId: createdBody.plan.projectId, editedAction, blueprintStatus: reopened.contentPlan.lessonBlueprint.status, lessonEventCount: reopened.contentPlan.lessonBlueprint.lessonPlan.events.length });
} catch (error) {
  report.error = String(error?.stack || error);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.pass) process.exitCode = 1;
}
