import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-lesson-blueprint-ui");
fs.mkdirSync(outputDir, { recursive: true });
const edge = [
  `${process.env.ProgramFiles}/Microsoft/Edge/Application/msedge.exe`,
  `${process.env["ProgramFiles(x86)"]}/Microsoft/Edge/Application/msedge.exe`,
].find((file) => file && fs.existsSync(file));
const browser = await chromium.launch({ headless: true, executablePath: edge });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
let planningRequest;
page.on("console", (message) => message.type() === "error" && !/ERR_NETWORK_ACCESS_DENIED/.test(message.text()) && consoleErrors.push(message.text()));
page.on("request", (request) => {
  if (request.url().endsWith("/api/teacher-courseware-plan") && request.method() === "POST") planningRequest = request.postDataJSON();
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
  await page.getByLabel("班级人数").fill("46");
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
  await planner.getByText("实验探究课", { exact: true }).waitFor();
  await planner.getByText(/学生不是背诵“楞次定律”/).waitFor();
  await planner.getByTestId("teacher-lesson-canvas").waitFor();
  await page.screenshot({ path: path.join(outputDir, "physics-plan-canvas-desktop.png"), fullPage: true });
  await planner.getByRole("tab", { name: "列表编辑" }).click();
  const eventCount = await planner.locator('article[data-testid^="lesson-event-"]').count();
  const pageCount = await planner.locator('[data-testid^="outline-page-"]').count();
  if (eventCount !== 7 || pageCount < 15) throw new Error(`expected 7 events and at least 15 pages, got ${eventCount}/${pageCount}`);
  const firstTeacherAction = planner.getByLabel("教师动作").first();
  await firstTeacherAction.fill("先展示两组相反现象，让学生只记录事实，不提前公布规律。");
  if (!(await firstTeacherAction.inputValue()).includes("不提前公布规律")) throw new Error("lesson event edit did not persist in UI state");
  if (planningRequest?.teacherTask?.learnerProfile?.classSize !== 46) throw new Error("class size did not reach planning request");
  if (planningRequest?.teacherTask?.classroomConstraints?.equipment !== "仅投影，无实验设备") throw new Error("equipment did not reach planning request");
  await page.screenshot({ path: path.join(outputDir, "physics-plan-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(outputDir, "physics-plan-mobile.png"), fullPage: true });
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (horizontalOverflow) throw new Error("mobile layout has horizontal overflow");
  if (consoleErrors.length) throw new Error(`console errors: ${consoleErrors.join(" | ")}`);
  Object.assign(report, { pass: true, eventCount, pageCount, horizontalOverflow, planningInput: planningRequest.teacherTask.learnerProfile, classroomConstraints: planningRequest.teacherTask.classroomConstraints });
} catch (error) {
  report.error = String(error?.stack || error);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.pass) process.exitCode = 1;
}
