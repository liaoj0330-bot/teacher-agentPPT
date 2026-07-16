import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "D:/tmp/sandun-replica/teacher-reopen-visual-acceptance");
const email = process.env.TEACHER_EMAIL || "grade1-arithmetic-1784133899824-1@example.com";
const password = process.env.TEACHER_PASSWORD || "Teacher123!";
const identity = {
  projectType: "teacher_courseware",
  projectId: process.env.PROJECT_ID || "cmrmb9bxp00550wqwndl4ayh2",
  requestId: process.env.REQUEST_ID || "cmrmbkvv3005h0wqwvgu6vklu",
  versionId: process.env.VERSION_ID || "cmrmbkvw3005j0wqw704ovksa",
  versionNumber: Number(process.env.VERSION_NUMBER || 2),
  lifecycleStatus: "review_required",
};

fs.mkdirSync(outputDir, { recursive: true });
const edge = [
  `${process.env.ProgramFiles}/Microsoft/Edge/Application/msedge.exe`,
  `${process.env["ProgramFiles(x86)"]}/Microsoft/Edge/Application/msedge.exe`,
].find((candidate) => candidate && fs.existsSync(candidate));
if (!edge) throw new Error("Microsoft Edge was not found.");

const browser = await chromium.launch({ headless: true, executablePath: edge });
const context = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(`${base}/teacher-ai-ppt`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const login = await page.evaluate(async ({ email: loginEmail, password: loginPassword }) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  }, { email, password });
  if (login.status !== 200) throw new Error(`Login failed: HTTP ${login.status}`);

  await page.evaluate((workspaceIdentity) => {
    sessionStorage.setItem("sandun.teacher-courseware.identity.v1", JSON.stringify(workspaceIdentity));
    sessionStorage.removeItem("sandun.teacher-courseware.bootstrap.v1");
  }, identity);

  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  const version = await page.evaluate(async ({ projectId, versionId }) => {
    const response = await fetch(`/api/courseware-version?projectId=${encodeURIComponent(projectId)}&versionId=${encodeURIComponent(versionId)}`);
    const data = await response.json();
    return {
      status: response.status,
      projectId: data.projectId,
      versionId: data.versionId,
      slideCount: Array.isArray(data.slides) ? data.slides.length : 0,
      manifestCount: Object.keys(data.renderManifest || {}).length,
      renderManifestArtifactId: data.renderManifestArtifactId || null,
    };
  }, identity);
  if (version.status !== 200) throw new Error(`Version read failed: HTTP ${version.status}`);

  await page.getByRole("button", { name: "设计", exact: true }).click();
  await page.waitForTimeout(1_000);
  const renderedImages = await page.locator('img[src^="data:image/"]').evaluateAll((images) => images.map((image) => {
    const rect = image.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      visible: rect.width > 20 && rect.height > 20,
    };
  }));
  const screenshotPath = path.join(outputDir, "editor-reopened-with-visuals.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const report = {
    base,
    projectId: version.projectId,
    versionId: version.versionId,
    slideCount: version.slideCount,
    manifestCount: version.manifestCount,
    renderManifestArtifactId: version.renderManifestArtifactId,
    renderedImageCount: renderedImages.filter((image) => image.visible && image.naturalWidth > 0).length,
    renderedImages,
    screenshotPath,
    errors,
  };
  fs.writeFileSync(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (version.slideCount === 0 || version.manifestCount !== version.slideCount || report.renderedImageCount === 0) process.exitCode = 1;
} finally {
  await browser.close();
}
