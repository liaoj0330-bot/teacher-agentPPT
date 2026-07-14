import fs from "node:fs";
import { chromium } from "playwright";

const edge = [`${process.env.ProgramFiles}/Microsoft/Edge/Application/msedge.exe`, `${process.env["ProgramFiles(x86)"]}/Microsoft/Edge/Application/msedge.exe`].find((file) => file && fs.existsSync(file));
const browser = await chromium.launch({ headless: true, executablePath: edge });
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
const api = [];
const consoleErrors = [];
page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
page.on("response", async (response) => {
  if (!response.url().includes("/api/")) return;
  api.push({ method: response.request().method(), status: response.status(), url: response.url(), request: response.request().postDataJSON?.() });
});

try {
  await page.goto("http://127.0.0.1:3002/teacher-ai-ppt", { waitUntil: "networkidle", timeout: 60_000 });
  await page.getByText("从教材章节备课", { exact: true }).click();
  await page.getByLabel("课题").fill("一次函数的图像与变化趋势");
  await page.getByRole("button", { name: "继续" }).click();
  await page.getByPlaceholder("可选择或输入教材版本").fill("人教版八年级上册");
  await page.getByPlaceholder("可选择或输入章节").fill("第十四章 一次函数");
  await page.getByLabel("教学要求").fill("理解图像特征，完成课堂练习并说明判断依据");
  await page.getByRole("button", { name: "继续" }).click();
  const planResponse = page.waitForResponse((response) => response.url().endsWith("/api/teacher-courseware-plan") && response.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /开始生成课件|登录后生成课件/ }).click();
  if ((await planResponse).status() !== 200) throw new Error("planning API failed");
  const planner = page.getByTestId("teacher-outline-planner");
  await planner.waitFor({ timeout: 30_000 });
  const initialCount = await planner.locator("article").count();
  if (initialCount < 1 || initialCount === 9 && !(await planner.getByText(/页数由教学环节决定/).count())) throw new Error(`invalid initial plan count ${initialCount}`);

  const firstTitle = planner.getByLabel("第 1 页标题");
  await firstTitle.fill("真实交互修改后的导入页");
  await planner.getByRole("button", { name: "下移" }).first().click();
  if ((await planner.getByLabel("第 2 页标题").inputValue()) !== "真实交互修改后的导入页") throw new Error("move did not change real order");
  await planner.getByRole("button", { name: "添加教学环节" }).click();
  const finalCount = await planner.locator("article").count();
  if (finalCount !== initialCount + 1) throw new Error(`add section failed: ${initialCount} -> ${finalCount}`);
  const newTitle = planner.getByLabel(`第 ${finalCount} 页标题`);
  await newTitle.fill("学生迁移任务");

  await planner.getByRole("button", { name: "确认大纲并逐页生成" }).click();
  const modal = page.locator("div.fixed.inset-0").last();
  await modal.getByRole("button", { name: "登录" }).first().waitFor({ timeout: 15_000 });
  await modal.getByRole("button", { name: "注册" }).click();
  const inputs = modal.locator("input");
  await inputs.nth(0).fill("Outline E2E");
  await inputs.nth(1).fill(`outline-${Date.now()}@example.com`);
  await inputs.nth(2).fill("Teacher123!");
  await modal.getByRole("button", { name: /注册并领取/ }).click();
  await modal.waitFor({ state: "detached", timeout: 30_000 });

  const stateCreated = page.waitForResponse((response) => response.url().endsWith("/api/teacher-courseware-plan/state") && response.request().method() === "POST", { timeout: 60_000 });
  const generated = page.waitForResponse((response) => response.url().endsWith("/api/generate-ppt") && response.request().method() === "POST", { timeout: 240_000 });
  await planner.getByRole("button", { name: "确认大纲并逐页生成" }).click();
  const createdResponse = await stateCreated;
  if (createdResponse.status() !== 201) throw new Error(`state create ${createdResponse.status()} ${await createdResponse.text()}`);
  const createdBody = await createdResponse.json();
  const generatedResponse = await generated;
  if (!generatedResponse.ok()) throw new Error(`generate ${generatedResponse.status()} ${(await generatedResponse.text()).slice(0, 300)}`);
  await page.getByRole("button", { name: "编辑本页结构与区块" }).waitFor({ timeout: 120_000 });

  const generationCall = api.find((item) => item.url.endsWith("/api/generate-ppt") && item.method === "POST");
  if (generationCall?.request?.projectId !== createdBody.plan.projectId) throw new Error("planning project was not reused by version generation");
  if (generationCall?.request?.teacherTask?.deckPlan?.pages?.length !== finalCount) throw new Error("edited outline page count did not reach generation");
  const stateCalls = api.filter((item) => item.url.endsWith("/api/teacher-courseware-plan/state"));
  if (!stateCalls.some((item) => item.method === "PATCH" && item.request?.action?.type === "confirm")) throw new Error("confirm transition missing");
  if (!stateCalls.some((item) => item.method === "PATCH" && item.request?.action?.type === "start_compile")) throw new Error("compile transition missing");
  if (!stateCalls.some((item) => item.method === "PATCH" && item.request?.action?.type === "complete")) throw new Error("ready transition missing");
  if (consoleErrors.length) throw new Error(`console errors: ${consoleErrors.join(" | ")}`);
  console.log(JSON.stringify({ pass: true, initialCount, finalCount, projectId: createdBody.plan.projectId, stateTransitions: stateCalls.filter((item) => item.method === "PATCH").map((item) => item.request?.action?.type), generateStatus: generatedResponse.status(), consoleErrors }, null, 2));
} finally {
  await browser.close();
}
