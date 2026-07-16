import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(
  process.env.OUTPUT_DIR || "D:/tmp/sandun-replica/teacher-product-v3-acceptance",
);
const edge = [
  `${process.env.ProgramFiles}/Microsoft/Edge/Application/msedge.exe`,
  `${process.env["ProgramFiles(x86)"]}/Microsoft/Edge/Application/msedge.exe`,
].find((candidate) => candidate && fs.existsSync(candidate));

if (!edge) throw new Error("Microsoft Edge was not found.");
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: edge });
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
const page = await context.newPage();
const errors = [];
const requestFailures = [];

page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("requestfailed", (request) => {
  requestFailures.push({
    url: request.url(),
    method: request.method(),
    errorText: request.failure()?.errorText || "unknown",
  });
});

async function assertVisibleText(text) {
  const locator = page.getByText(text, { exact: true });
  await locator.first().waitFor({ state: "visible", timeout: 15_000 });
}

async function clickBack() {
  await page.getByRole("button", { name: "返回上一步" }).click();
}

function fieldControl(label) {
  return page
    .locator("label")
    .filter({ hasText: label })
    .locator("input,select,textarea")
    .first();
}

try {
  await page.goto(`${base}/teacher-ai-ppt`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });

  for (const entry of ["从教材章节备课", "从教案生成", "优化已有课件"]) {
    await assertVisibleText(entry);
  }
  await page.screenshot({
    path: path.join(outputDir, "01-three-entry-desktop.png"),
    fullPage: true,
  });

  await page.getByText("从教材章节备课", { exact: true }).click();
  await page.getByLabel("课题").fill("10以内加减法");
  await page.getByRole("button", { name: "继续" }).click();

  for (const label of [
    "教材版本",
    "出版社",
    "版本年份",
    "册次",
    "页码",
    "单元",
    "章节/课时",
  ]) {
    await fieldControl(label).waitFor({ state: "attached" });
  }
  await fieldControl("教材版本").fill("人教版一年级上册");
  await fieldControl("出版社").fill("人民教育出版社");
  await fieldControl("版本年份").fill("2024");
  await fieldControl("页码").fill("32-37");
  await fieldControl("单元").fill("第五单元");
  await fieldControl("章节/课时").fill("10以内的加法和减法");
  await page.screenshot({
    path: path.join(outputDir, "02-textbook-chapter-identity.png"),
    fullPage: true,
  });

  await clickBack();
  await clickBack();
  await page.getByText("优化已有课件", { exact: true }).click();
  await page.getByLabel("课题").fill("现有数学课件视觉优化");
  await page.getByRole("button", { name: "继续" }).click();
  for (const intensity of ["保守优化", "标准重排", "深度重构"]) {
    await assertVisibleText(intensity);
  }
  await page.screenshot({
    path: path.join(outputDir, "03-beautify-intensity.png"),
    fullPage: true,
  });

  const desktopLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await page.screenshot({
    path: path.join(outputDir, "04-mobile-responsiveness.png"),
    fullPage: true,
  });
  const mobileLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  const report = {
    pass:
      errors.length === 0 &&
      desktopLayout.documentWidth <= desktopLayout.viewportWidth + 1 &&
      desktopLayout.bodyWidth <= desktopLayout.viewportWidth + 1 &&
      mobileLayout.documentWidth <= mobileLayout.viewportWidth + 1 &&
      mobileLayout.bodyWidth <= mobileLayout.viewportWidth + 1,
    base,
    entries: ["chapter", "materials", "polish"],
    textbookFields: [
      "textbook",
      "publisher",
      "editionYear",
      "volume",
      "pageRange",
      "unit",
      "chapter",
    ],
    beautifyIntensities: ["preserve", "standard", "deep"],
    desktopLayout,
    mobileLayout,
    errors,
    requestFailures,
    screenshots: fs
      .readdirSync(outputDir)
      .filter((file) => file.endsWith(".png"))
      .sort(),
  };
  fs.writeFileSync(
    path.join(outputDir, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
} finally {
  await browser.close();
}
