/* Host-only runner for START/RUN/STOP_TEACHER_PPT_LOCAL.ps1. It uses the real teacher UI and APIs. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import JSZip from "jszip";
import { chromium } from "playwright";

const root = path.resolve(process.cwd());
const out = path.join(root, "artifacts", "teacher-ppt-host-e2e-006");
const dirs = Object.fromEntries(["requests", "responses", "plans", "pptx", "pdf", "png", "screenshots", "logs", "reports"].map((name) => [name, path.join(out, name)]));
for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
const materialPath = path.join(out, "input", "ENGINEERING_DEMO_MATERIAL.md");
const material = fs.readFileSync(materialPath, "utf8");
const baseUrl = process.env.TEACHER_PPT_BASE_URL || "http://127.0.0.1:3002";
const summaryPath = path.join(out, "host-e2e-summary.json");
const writeJson = (name, data) => fs.writeFileSync(name, JSON.stringify(data, null, 2), "utf8");
const now = () => new Date().toISOString();
const banned = ["audienceQuestion", "mustProve", "masteryCheck", "childOutputRequired", "TODO", "\u8bf7\u8865\u5145", "\u5efa\u8bae\u63d2\u5165", "\u6b64\u5904\u5c55\u793a", "\u5de5\u7a0b\u8def\u5f84", "JSON", "\u7cfb\u7edf\u63d0\u793a\u8bcd"];

function findBrowser() {
  const candidates = [process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"), process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe"), process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe")].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}
function visibleText(obj) { return JSON.stringify(obj); }
function findBanned(text) { return banned.filter((item) => text.includes(item)); }
async function inspectPptx(pptxPath) {
  const buffer = fs.readFileSync(pptxPath);
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const text = (await Promise.all(slides.map((name) => zip.files[name].async("string")))).join(" ").replace(/<[^>]+>/g, " ");
  return { officeZip: zip.file("[Content_Types].xml") !== null && zip.file("ppt/presentation.xml") !== null, slideCount: slides.length, visibleTextLength: text.length, bannedVisibleMatches: findBanned(text), mojibakeDetected: /(?:\uFFFD|脙.|脗.|忙.|莽.|猫.)/.test(text) };
}
function renderWithPowerPoint(pptxPath) {
  const pdfPath = path.join(dirs.pdf, "teacher-once-function.pptx.pdf");
  const pngDir = path.join(dirs.png, "teacher-once-function");
  fs.mkdirSync(pngDir, { recursive: true });
  const ps = `param([string]$PptxPath,[string]$PdfPath,[string]$PngDir)
$ErrorActionPreference='Stop'; $before=@(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object Id); $app=$null; $presentation=$null; $created=@(); $warnings=@(); $errors=@(); $pngFiles=@(); $slideCount=0; $pdfOk=$false
try { $app=New-Object -ComObject PowerPoint.Application; Start-Sleep -Milliseconds 500; $created=@((Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object Id) | Where-Object { $before -notcontains $_ }); $presentation=$app.Presentations.Open($PptxPath,-1,0,0); $slideCount=[int]$presentation.Slides.Count; 1..$slideCount | ForEach-Object { $p=Join-Path $PngDir ('slide-{0:D2}.png' -f $_); $presentation.Slides.Item($_).Export($p,'PNG',1920,1080) }; $pngFiles=@(Get-ChildItem -LiteralPath $PngDir -Filter '*.png' | Sort-Object Name | ForEach-Object FullName); $presentation.SaveAs($PdfPath,32); $pdfOk=Test-Path -LiteralPath $PdfPath }
catch { $errors += $_.Exception.Message }
finally { if($presentation){try{$presentation.Close()}catch{};try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)}catch{}}; if($app){if($created.Count -gt 0){try{$app.Quit()}catch{}};try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)}catch{}}; [GC]::Collect(); [GC]::WaitForPendingFinalizers() }
[pscustomobject]@{ok=($errors.Count -eq 0 -and $pdfOk -and $pngFiles.Count -gt 0);slideCount=$slideCount;pdfPath=$(if($pdfOk){$PdfPath}else{''});pngFiles=$pngFiles;warnings=$warnings;errors=$errors;createdPids=$created}|ConvertTo-Json -Depth 5 -Compress`;
  const psPath = path.join(dirs.logs, "teacher-ppt-com-render.ps1");
  fs.writeFileSync(psPath, ps, "utf8");
  const raw = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psPath, pptxPath, pdfPath, pngDir], { encoding: "utf8", timeout: 300000 });
  return JSON.parse(raw.trim());
}

const summary = { status: "HOST_E2E_FAIL", generatedAt: now(), baseUrl, artifactsRoot: out, checks: {}, errors: [] };
try {
  const browserPath = findBrowser();
  if (!browserPath) throw new Error("No Edge/Chrome executable found for the existing Playwright browser capability.");
  const browser = await chromium.launch({ headless: true, executablePath: browserPath });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  // Capture API bodies as soon as Chromium emits the response. In host runs the
  // app can consume a response before a later `response.text()` call, which
  // makes CDP report "No resource with given identifier found".
  const capturedBodies = new WeakMap();
  page.on("response", (response) => {
    if (["/api/generate-ppt", "/api/export-pptx"].some((suffix) => response.url().endsWith(suffix))) {
      capturedBodies.set(response, response.body().catch(() => null));
    }
  });
  const responseBody = async (response) => {
    const body = await capturedBodies.get(response);
    if (body) return body;
    try { return await response.body(); } catch { return Buffer.alloc(0); }
  };
  await page.goto(`${baseUrl}/teacher-ai-ppt`, { waitUntil: "networkidle", timeout: 60000 });
  await page.screenshot({ path: path.join(dirs.screenshots, "01-teacher-form.png"), fullPage: true });
  const inputs = page.locator("input");
  await inputs.nth(0).fill("\u521d\u4e2d"); await inputs.nth(1).fill("\u516b\u5e74\u7ea7"); await inputs.nth(2).fill("\u6570\u5b66"); await inputs.nth(3).fill("\u4e00\u6b21\u51fd\u6570\u7684\u6982\u5ff5\u4e0e\u56fe\u50cf"); await inputs.nth(4).fill("45\u5206\u949f");
  await page.locator("textarea").fill(material);
  const generateResponse = page.waitForResponse((response) => response.url().endsWith("/api/generate-ppt") && response.request().method() === "POST", { timeout: 180000 });
  await page.getByRole("button", { name: "生成并进入工作台" }).click();
  await page.screenshot({ path: path.join(dirs.screenshots, "02-generating.png"), fullPage: true });
  const generation = await generateResponse;
  const request = JSON.parse(generation.request().postData() || "{}");
  const responseBuffer = await responseBody(generation); const responseText = responseBuffer.toString("utf8"); const response = JSON.parse(responseText);
  writeJson(path.join(dirs.requests, "teacher-request.json"), request); writeJson(path.join(dirs.responses, "teacher-response.json"), response);
  if (!generation.ok() || !response.project || !["local", "openai"].includes(response.provider) || /sampleSlides|simulated/i.test(responseText)) throw new Error(`Teacher generation was not a valid real response (HTTP ${generation.status()}).`);
  writeJson(path.join(dirs.plans, "ContentPlan.json"), response.contentPlan || response.project.contentPlan || {});
  writeJson(path.join(dirs.plans, "SlidePagePlan.json"), response.project.slidePagePlans || response.pagePlans || []);
  writeJson(path.join(dirs.plans, "LayoutPlan.json"), response.project.layoutPlans || response.layoutPlans || []);
  await page.screenshot({ path: path.join(dirs.screenshots, "03-structure-preview.png"), fullPage: true });
  const exportResponse = page.waitForResponse((r) => r.url().endsWith("/api/export-pptx") && r.request().method() === "POST", { timeout: 180000 });
  await page.getByRole("button", { name: "导出" }).click();
  const exported = await exportResponse; const exportRequest = JSON.parse(exported.request().postData() || "{}");
  let exportBuffer = await responseBody(exported);
  // Chromium may expose attachment responses as an already-consumed stream.
  // Replay the exact browser request through Node so artifact validation still
  // exercises the production export endpoint and captures the ZIP bytes.
  if (!exportBuffer.length) {
    const replay = await fetch(`${baseUrl}/api/export-pptx`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(exportRequest) });
    exportBuffer = Buffer.from(await replay.arrayBuffer());
  }
  const exportHeaders = await exported.headers();
  writeJson(path.join(dirs.requests, "export-request.json"), exportRequest); writeJson(path.join(dirs.responses, "export-response.json"), { status: exported.status(), headers: exportHeaders, byteLength: exportBuffer.length });
  if (!exported.ok()) throw new Error(`PPTX export failed: HTTP ${exported.status()}: ${exportBuffer.toString("utf8").slice(0, 500)}`);
  const pptxPath = path.join(dirs.pptx, "teacher-once-function.pptx"); fs.writeFileSync(pptxPath, exportBuffer);
  await page.screenshot({ path: path.join(dirs.screenshots, "04-export-success.png"), fullPage: true }); await browser.close();
  const inspection = await inspectPptx(pptxPath); const render = renderWithPowerPoint(pptxPath);
  const pngCount = (render.pngFiles || []).filter((file) => fs.existsSync(file) && fs.statSync(file).size > 0).length;
  // Planning fields are intentionally present in the API project object for the
  // workbench.  The export contract is that they must not appear in the PPTX.
  const quality = { pptxBannedFields: inspection.bannedVisibleMatches, mojibakeDetected: inspection.mojibakeDetected };
  writeJson(path.join(dirs.reports, "quality-check.json"), quality);
  summary.checks = { teacherResponse: { status: generation.status(), provider: response.provider, projectSlides: response.project.slides.length }, pptx: { path: pptxPath, bytes: exportBuffer.length, ...inspection }, render: { ...render, pngCount }, quality };
  if (!(exportBuffer.length > 0 && inspection.officeZip && render.pdfPath && fs.existsSync(render.pdfPath) && fs.statSync(render.pdfPath).size > 0 && pngCount === inspection.slideCount && !quality.pptxBannedFields.length && !quality.mojibakeDetected)) throw new Error("One or more required artifact or quality checks failed.");
  summary.status = "HOST_E2E_PASS";
} catch (error) { summary.errors.push(error instanceof Error ? error.stack || error.message : String(error)); }
summary.finishedAt = now(); writeJson(summaryPath, summary); console.log(JSON.stringify(summary, null, 2)); process.exitCode = summary.status === "HOST_E2E_PASS" ? 0 : 1;

