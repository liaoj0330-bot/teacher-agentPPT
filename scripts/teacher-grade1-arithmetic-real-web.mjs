import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:3002";
const skipVisuals = process.env.SKIP_VISUALS === "1";
const runRoot = path.join("D:\\tmp\\sandun-replica", `teacher-grade1-arithmetic-${Date.now()}`);
fs.mkdirSync(runRoot, { recursive: true });

const text = {
  chapter: "\u4ece\u6559\u6750\u7ae0\u8282\u5907\u8bfe",
  topic: "\u8bfe\u9898",
  next: "\u7ee7\u7eed",
  textbook: "\u53ef\u9009\u62e9\u6216\u8f93\u5165\u6559\u6750\u7248\u672c",
  section: "\u53ef\u9009\u62e9\u6216\u8f93\u5165\u7ae0\u8282",
  requirement: "\u6559\u5b66\u8981\u6c42",
  save: "\u4fdd\u5b58",
  prepare: /\u5f00\u59cb\u751f\u6210\u8bfe\u4ef6|\u767b\u5f55\u540e\u751f\u6210\u8bfe\u4ef6/,
  confirm: "\u786e\u8ba4\u5927\u7eb2\u5e76\u9010\u9875\u751f\u6210",
  register: "\u6ce8\u518c",
  registerSubmit: /\u6ce8\u518c\u5e76\u9886\u53d6/,
  design: "\u8bbe\u8ba1",
  visuals: "\u751f\u6210\u9875\u9762\u89c6\u89c9",
  export: "\u5bfc\u51fa",
  editor: "\u7f16\u8f91\u672c\u9875\u7ed3\u6784\u4e0e\u533a\u5757",
};

const edge = [
  `${process.env.ProgramFiles}/Microsoft/Edge/Application/msedge.exe`,
  `${process.env["ProgramFiles(x86)"]}/Microsoft/Edge/Application/msedge.exe`,
].find((candidate) => candidate && fs.existsSync(candidate));

if (!edge) throw new Error("Microsoft Edge was not found for browser verification.");

const report = { runRoot, startedAt: new Date().toISOString(), skipVisuals, attempts: [] };
fs.writeFileSync(path.join(runRoot, "report.json"), JSON.stringify(report, null, 2));

function writeProgress(progress) {
  fs.writeFileSync(path.join(runRoot, "progress.json"), JSON.stringify({ updatedAt: new Date().toISOString(), ...progress }, null, 2));
}

async function runAttempt(attempt) {
  const browser = await chromium.launch({ headless: true, executablePath: edge });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1050 }, acceptDownloads: true });
  const page = await context.newPage();
  const api = [];
  const imageResponses = [];
  const consoleErrors = [];
  let attemptDir = "";
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", async (response) => {
    if (!response.url().includes("/api/")) return;
    api.push({ url: response.url(), method: response.request().method(), status: response.status() });
    if (response.url().endsWith("/api/generate-image")) {
      const data = await response.json().catch(() => null);
      const item = {
        status: response.status(),
        provider: data?.provider || null,
        model: data?.model || null,
        transport: data?.transport || null,
        elapsedMs: Number(data?.elapsedMs || 0),
        attempts: Number(data?.attempts || 0),
        isDataImage: typeof data?.image === "string" && data.image.startsWith("data:image/"),
        imageLength: typeof data?.image === "string" ? data.image.length : 0,
      };
      imageResponses.push(item);
      const imageIndex = imageResponses.length;
      if (item.isDataImage && attemptDir) {
        const base64 = data.image.slice(data.image.indexOf(",") + 1);
        fs.writeFileSync(path.join(attemptDir, `image2-${String(imageIndex).padStart(2, "0")}.png`), Buffer.from(base64, "base64"));
      }
      writeProgress({ step: "generating_visuals", completedImages: imageResponses.length, imageResponses });
      console.log(`[acceptance] image ${imageIndex} status=${item.status} elapsedMs=${item.elapsedMs} attempts=${item.attempts}`);
    }
  });

  attemptDir = path.join(runRoot, `attempt-${attempt}`);
  fs.mkdirSync(attemptDir, { recursive: true });
  try {
    writeProgress({ step: "opening_latest_3002", completedImages: 0 });
    await page.goto(`${baseUrl}/teacher-ai-ppt`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.screenshot({ path: path.join(attemptDir, "01-entry.png"), fullPage: true });

    await page.getByTestId("teacher-task-chapter").click();
    await page.getByLabel("\u5b66\u6bb5").waitFor({ timeout: 30_000 });
    await page.getByLabel("\u5b66\u6bb5").selectOption({ label: "\u5c0f\u5b66" });
    await page.getByLabel("\u5e74\u7ea7").selectOption({ label: "\u4e00\u5e74\u7ea7" });
    await page.getByLabel("\u5b66\u79d1").selectOption({ label: "\u6570\u5b66" });
    await page.getByLabel(text.topic).fill("10\u4ee5\u5185\u7684\u52a0\u51cf\u6cd5");
    await page.getByLabel("\u6388\u8bfe\u65f6\u957f").fill("40\u5206\u949f");
    await page.getByRole("button", { name: text.next }).click();
    await page.getByPlaceholder(text.textbook).fill("\u4eba\u6559\u7248\u4e00\u5e74\u7ea7\u4e0a\u518c");
    await page.getByPlaceholder(text.section).fill("\u7b2c\u4e09\u5355\u5143 10\u4ee5\u5185\u7684\u52a0\u51cf\u6cd5");
    await page.getByLabel(text.requirement).fill("\u8ba4\u8bc6 10 \u4ee5\u5185\u52a0\u6cd5\u548c\u51cf\u6cd5\u7684\u542b\u4e49\uff0c\u80fd\u501f\u52a9\u5b66\u5177\u6216\u56fe\u7247\u6b63\u786e\u8ba1\u7b97\uff0c\u5728\u6e38\u620f\u4e2d\u4f53\u4f1a\u52a0\u51cf\u7684\u5173\u7cfb\u3002");
    await page.getByLabel(/\u8865\u5145\u8bf4\u660e/).fill("\u9762\u5411\u4e00\u5e74\u7ea7\u5b66\u751f\uff0c\u6bcf\u9875\u53ea\u7ed9\u4e00\u4e2a\u6e05\u6670\u4efb\u52a1\uff0c\u591a\u7528\u82f9\u679c\u3001\u79ef\u6728\u548c\u8ba1\u6570\u68d2\u7684\u751f\u6d3b\u60c5\u5883\uff0c\u5b89\u6392\u4e00\u9053\u8d85\u8fc7\u4e0d\u8fdb\u4f4d\u7684\u7ec3\u4e60\u3002");
    await page.getByRole("button", { name: text.next }).click();
    await page.getByRole("button", { name: text.save }).click();

    const planResponse = page.waitForResponse((response) => response.url().endsWith("/api/teacher-courseware-plan") && response.request().method() === "POST", { timeout: 90_000 });
    await page.getByRole("button", { name: text.prepare }).click();
    const plan = await planResponse;
    if (!plan.ok()) throw new Error(`Planning failed with HTTP ${plan.status()}: ${(await plan.text()).slice(0, 500)}`);
    const planner = page.getByTestId("teacher-outline-planner");
    await planner.waitFor({ timeout: 60_000 });
    const plannedPageCount = await planner.locator("article").count();
    if (plannedPageCount < 6) throw new Error(`Planning produced only ${plannedPageCount} pages.`);
    await page.screenshot({ path: path.join(attemptDir, "02-plan.png"), fullPage: true });

    await planner.getByRole("button", { name: text.confirm }).click();
    const modal = page.locator("div.fixed.inset-0").last();
    await modal.getByRole("button", { name: text.register, exact: true }).click();
    const inputs = modal.locator("input");
    await inputs.nth(0).fill("\u4e00\u5e74\u7ea7\u6570\u5b66\u5b9e\u9a8c\u6559\u5e08");
    await inputs.nth(1).fill(`grade1-arithmetic-${Date.now()}-${attempt}@example.com`);
    await inputs.nth(2).fill("Teacher123!");
    await modal.getByRole("button", { name: text.registerSubmit }).click();
    await modal.waitFor({ state: "detached", timeout: 30_000 });

    const stateCreated = page.waitForResponse((response) => response.url().endsWith("/api/teacher-courseware-plan/state") && response.request().method() === "POST", { timeout: 60_000 });
    const generation = page.waitForResponse((response) => response.url().endsWith("/api/generate-ppt") && response.request().method() === "POST", { timeout: 240_000 });
    await planner.getByRole("button", { name: text.confirm }).click();
    const state = await stateCreated;
    if (state.status() !== 201) throw new Error(`Server plan state failed: HTTP ${state.status()} ${(await state.text()).slice(0, 500)}`);
    const generationResponse = await generation;
    const generationBody = await generationResponse.json().catch(() => null);
    if (!generationResponse.ok()) throw new Error(`Generation failed: HTTP ${generationResponse.status()} ${JSON.stringify(generationBody).slice(0, 500)}`);
    if (generationBody?.provider !== "openai") throw new Error(`Text generation was not remote-model backed: provider=${generationBody?.provider}`);
    if (generationBody?.slides !== plannedPageCount) throw new Error(`Generated ${generationBody?.slides} slides but planned ${plannedPageCount}.`);
    await page.getByRole("button", { name: text.editor }).waitFor({ timeout: 120_000 });
    await page.screenshot({ path: path.join(attemptDir, "03-editor.png"), fullPage: true });

    let visualCommitBody = null;
    let retryRounds = 0;
    if (!skipVisuals) {
    await page.getByRole("button", { name: text.design }).click();
    const visualCommit = page.waitForResponse((response) => {
      if (!response.url().endsWith("/api/courseware-version") || response.request().method() !== "POST") return false;
      return JSON.parse(response.request().postData() || "{}").operation === "generate_visuals";
    }, { timeout: 900_000 });
    await page.getByRole("button", { name: text.visuals }).click();
    writeProgress({ step: "generating_visuals", completedImages: 0, plannedPageCount });
    await page.screenshot({ path: path.join(attemptDir, "03b-visual-generation-started.png"), fullPage: true });
    const visualCommitResponse = await visualCommit;
    const visualCommitBody = await visualCommitResponse.json().catch(() => null);
    if (visualCommitResponse.status() !== 201 || !visualCommitBody?.artifactId) throw new Error(`Visual manifest commit failed: HTTP ${visualCommitResponse.status()} ${JSON.stringify(visualCommitBody).slice(0, 500)}`);
    await page.waitForTimeout(500);
    if (imageResponses.length !== plannedPageCount) throw new Error(`Expected ${plannedPageCount} image calls, received ${imageResponses.length}.`);
    await page.getByText(`${plannedPageCount}/${plannedPageCount}`, { exact: true }).waitFor({ timeout: 10_000 });

    let failedImages = imageResponses.filter((image) => image.status !== 200 || image.provider !== "openai-compatible" || image.model !== "gpt-image-2" || image.transport !== "sse" || !image.isDataImage || image.imageLength < 20_000);
    while (failedImages.length && retryRounds < 2) {
      retryRounds += 1;
      await page.screenshot({ path: path.join(attemptDir, `04a-retry-required-${retryRounds}.png`), fullPage: true });
      const retryStart = imageResponses.length;
      const retryCommit = page.waitForResponse((response) => {
        if (!response.url().endsWith("/api/courseware-version") || response.request().method() !== "POST") return false;
        return JSON.parse(response.request().postData() || "{}").operation === "generate_visuals";
      }, { timeout: 900_000 });
      await page.getByRole("button", { name: /\u91cd\u8bd5\u5931\u8d25\u9875/ }).click();
      const retryCommitResponse = await retryCommit;
      if (retryCommitResponse.status() !== 201) throw new Error(`Retry visual manifest commit failed: HTTP ${retryCommitResponse.status()}`);
      await page.waitForTimeout(500);
      const retryBatch = imageResponses.slice(retryStart);
      if (retryBatch.length !== failedImages.length) throw new Error(`Expected ${failedImages.length} retry image calls, received ${retryBatch.length}.`);
      failedImages = retryBatch.filter((image) => image.status !== 200 || image.provider !== "openai-compatible" || image.model !== "gpt-image-2" || image.transport !== "sse" || !image.isDataImage || image.imageLength < 20_000);
    }
    if (failedImages.length) {
      throw new Error(`Images were still missing after ${retryRounds} visible UI retry rounds: ${JSON.stringify(failedImages)}`);
    }
    await page.screenshot({ path: path.join(attemptDir, "04-all-page-visuals.png"), fullPage: true });
    } else {
      writeProgress({ step: "exporting_without_images", completedImages: 0, plannedPageCount });
      await page.screenshot({ path: path.join(attemptDir, "04-native-visual-layout.png"), fullPage: true });
    }

    const exportResponse = page.waitForResponse((response) => response.url().endsWith("/api/export-pptx") && response.request().method() === "POST", { timeout: 240_000 });
    const downloadEvent = page.waitForEvent("download", { timeout: 240_000 })
      .then((download) => ({ download, error: null }))
      .catch((error) => ({ download: null, error }));
    await page.getByRole("button", { name: text.export }).click();
    const exported = await exportResponse;
    if (exported.status() !== 200) throw new Error(`PPTX export failed: HTTP ${exported.status()} ${(await exported.text()).slice(0, 800)}`);
    const downloadResult = await downloadEvent;
    if (!downloadResult.download) throw downloadResult.error || new Error("Browser download event did not produce a file.");
    const download = downloadResult.download;
    const pptxPath = path.join(runRoot, "grade1-10-add-subtract.pptx");
    await download.saveAs(pptxPath);
    const downloadFailure = await download.failure();
    if (downloadFailure) throw new Error(`Browser download failed: ${downloadFailure}`);
    const pptxBuffer = fs.readFileSync(pptxPath);
    if (pptxBuffer.length < 10_000 || pptxBuffer.subarray(0, 2).toString("ascii") !== "PK") {
      throw new Error(`Export response is not a valid PPTX ZIP package (${pptxBuffer.length} bytes).`);
    }
    await page.screenshot({ path: path.join(attemptDir, "05-exported.png"), fullPage: true });

    return {
      ok: true,
      plannedPageCount,
      generatedSlides: generationBody.slides,
      textProvider: generationBody.provider,
      skipVisuals,
      imageResponses,
      projectId: visualCommitBody?.projectId || generationBody.projectId,
      versionId: visualCommitBody?.versionId || generationBody.versionId,
      artifactId: visualCommitBody?.artifactId || null,
      retryRounds,
      pptxPath,
      pptxBytes: fs.statSync(pptxPath).size,
      consoleErrors,
      api,
    };
  } finally {
    await browser.close();
  }
}

for (let attempt = 1; attempt <= 1; attempt += 1) {
  try {
    const result = await runAttempt(attempt);
    report.attempts.push(result);
    report.finishedAt = new Date().toISOString();
    report.pass = true;
    fs.writeFileSync(path.join(runRoot, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  } catch (error) {
    report.attempts.push({ ok: false, error: error instanceof Error ? error.stack || error.message : String(error) });
    fs.writeFileSync(path.join(runRoot, "report.json"), JSON.stringify(report, null, 2));
  }
}

report.finishedAt = new Date().toISOString();
report.pass = false;
fs.writeFileSync(path.join(runRoot, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(1);
