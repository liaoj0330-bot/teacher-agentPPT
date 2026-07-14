import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const stageArg = process.argv.find((arg) => arg.startsWith("--stage="));
const stage = (stageArg?.split("=")[1] || "p1h").toLowerCase();
const stageDirName = stage === "p1i" || stage === "p1-i" ? "p1-i" : "p1-h";
const generateScriptName = stageDirName === "p1-i" ? "p1i:generate-samples" : "p1h:generate";
const p1hRoot = path.join(repoRoot, "test-results", stageDirName);
const pptxDir = path.join(p1hRoot, "exported-pptx");
const pdfDir = path.join(p1hRoot, "rendered-pdf");
const pagesRoot = path.join(p1hRoot, "rendered-pages");
const metadataDir = path.join(p1hRoot, "deck-metadata");
const reportPath = path.join(p1hRoot, "render-report.json");
const manifestPath = path.join(p1hRoot, "review-input-manifest.json");

const sampleIds = ["product_intro", "project_report", "sales_proposal", "courseware"];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function tryExec(file, args, options = {}) {
  try {
    const result = await execFileAsync(file, args, {
      cwd: options.cwd || repoRoot,
      encoding: "utf8",
      timeout: options.timeout || 120000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: error?.stdout || "",
      stderr: error?.stderr || "",
      error: error instanceof Error ? error.message : String(error),
      code: error?.code
    };
  }
}

function candidateLibreOfficeBins() {
  const candidates = [
    process.env.LIBREOFFICE_BIN,
    process.env.SOFFICE_BIN
  ];
  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"
    );
  }
  candidates.push("soffice", "libreoffice");
  return candidates.filter(Boolean);
}

function candidatePdfToPngBins() {
  const candidates = [process.env.PDFTOPPM_BIN, "pdftoppm"];
  const codexRoot = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies");
  if (process.platform === "win32") {
    candidates.push(
      path.join(codexRoot, "poppler", "bin", "pdftoppm.exe"),
      "C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe",
      "C:\\Program Files\\poppler\\bin\\pdftoppm.exe"
    );
  }
  return candidates.filter(Boolean);
}

async function findExecutable(candidates, versionArgs = ["--version"]) {
  const attempts = [];
  for (const candidate of candidates) {
    const result = await tryExec(candidate, versionArgs, { timeout: 8000 });
    attempts.push({
      candidate,
      ok: result.ok,
      version: result.ok ? `${result.stdout || result.stderr}`.trim().split(/\r?\n/)[0] || "" : "",
      error: result.ok ? "" : `${result.error || ""} ${result.stderr || ""}`.trim()
    });
    if (result.ok) {
      return { path: candidate, version: attempts.at(-1).version, attempts };
    }
  }
  return { path: "", version: "", attempts };
}

function cleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
}

function deckExpectedSlideCount(deckId, fallback = 0) {
  const metadata = readJson(path.join(metadataDir, `${deckId}.json`), null);
  const count = Number(metadata?.slideCount || metadata?.projectSlideCount || fallback || 0);
  return Number.isFinite(count) ? count : 0;
}

function pngFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((name) => path.join(dir, name));
}

function renderRecord(input) {
  const pageImageCount = input.pngPages?.length || 0;
  const pdfPath = input.pdfPath && fs.existsSync(input.pdfPath) ? input.pdfPath : "";
  const imageCountMatchesSlideCount = input.expectedSlideCount > 0 && pageImageCount === input.expectedSlideCount;
  const warnings = [...(input.warnings || [])];
  if (pageImageCount > 0 && input.expectedSlideCount > 0 && !imageCountMatchesSlideCount) {
    warnings.push(`PNG page count ${pageImageCount} does not match expected slide count ${input.expectedSlideCount}.`);
  }
  if (!pdfPath && pageImageCount === 0 && input.rendererUsed !== "skipped") {
    warnings.push("Renderer ran but no PDF or PNG output was produced.");
  }
  if (pdfPath && pageImageCount === 0) {
    warnings.push("PDF was generated, but PNG pages were not generated.");
  }
  return {
    deckId: input.deckId,
    pptxPath: input.pptxPath,
    renderStatus: input.renderStatus,
    rendererUsed: input.rendererUsed,
    pdfPath,
    pngDir: input.pngDir,
    pngPages: input.pngPages || [],
    pageImageCount,
    expectedSlideCount: input.expectedSlideCount,
    imageCountMatchesSlideCount,
    error: input.error || "",
    warnings
  };
}

async function convertPptxToPdf(soffice, pptxPath, targetPdfPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "sandun-p1h-lo-"));
  try {
    const result = await tryExec(soffice, [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      tempDir,
      pptxPath
    ], { timeout: 180000 });
    if (!result.ok) {
      return { ok: false, error: `${result.error || ""} ${result.stderr || ""}`.trim(), stdout: result.stdout, stderr: result.stderr };
    }
    const produced = fs.readdirSync(tempDir).find((name) => name.toLowerCase().endsWith(".pdf"));
    if (!produced) {
      return { ok: false, error: "LibreOffice did not produce a PDF file.", stdout: result.stdout, stderr: result.stderr };
    }
    ensureDir(path.dirname(targetPdfPath));
    fs.copyFileSync(path.join(tempDir, produced), targetPdfPath);
    return { ok: fs.existsSync(targetPdfPath), stdout: result.stdout, stderr: result.stderr };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function convertPdfToPng(pdftoppm, pdfPath, pagesDir, id) {
  cleanDir(pagesDir);
  const prefix = path.join(pagesDir, `${id}-page`);
  const result = await tryExec(pdftoppm, ["-png", "-r", "160", pdfPath, prefix], { timeout: 180000 });
  if (!result.ok) {
    return { ok: false, error: `${result.error || ""} ${result.stderr || ""}`.trim(), pages: [], stdout: result.stdout, stderr: result.stderr };
  }
  const pages = pngFiles(pagesDir);
  return { ok: pages.length > 0, pages, stdout: result.stdout, stderr: result.stderr };
}

function powershellExe() {
  return process.platform === "win32" ? "powershell.exe" : "pwsh";
}

async function runPowerShellScript(script, args = [], timeout = 180000) {
  const scriptPath = path.join(os.tmpdir(), `sandun-p1h-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`);
  fs.writeFileSync(scriptPath, script, "utf8");
  try {
    const result = await tryExec(powershellExe(), ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, ...args], { timeout });
    if (!result.ok) return { ...result, json: null };
    const text = result.stdout.trim();
    try {
      return { ...result, json: JSON.parse(text) };
    } catch {
      return { ...result, json: null };
    }
  } finally {
    fs.rmSync(scriptPath, { force: true });
  }
}

const detectPowerPointScript = String.raw`
$ErrorActionPreference = "Stop"
$before = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$app = $null
$createdPids = @()
$warnings = @()
try {
  $app = New-Object -ComObject PowerPoint.Application
  Start-Sleep -Milliseconds 500
  $afterCreate = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  $createdPids = @($afterCreate | Where-Object { $before -notcontains $_ })
  $version = [string]$app.Version
  if ($createdPids.Count -eq 0 -and $before.Count -gt 0) {
    $warnings += "PowerPoint COM attached to an existing POWERPNT.EXE process; script will not force-kill existing user processes."
  }
  if ($createdPids.Count -gt 0) {
    try { $app.Quit() } catch { $warnings += "PowerPoint Quit during detection failed: $($_.Exception.Message)" }
  }
  if ($app -ne $null) {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
  Start-Sleep -Milliseconds 700
  foreach ($createdPid in $createdPids) {
    $proc = Get-Process -Id $createdPid -ErrorAction SilentlyContinue
    if ($proc) {
      try { Stop-Process -Id $createdPid -Force -ErrorAction Stop } catch { $warnings += "Failed to stop detection POWERPNT.EXE pid $($createdPid): $($_.Exception.Message)" }
    }
  }
  $deadline = (Get-Date).AddSeconds(8)
  do {
    $stillRunning = @($createdPids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
    if ($stillRunning.Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  [pscustomobject]@{
    available = $true
    version = $version
    beforePids = $before
    createdPids = $createdPids
    warnings = $warnings
    error = ""
  } | ConvertTo-Json -Depth 6 -Compress
} catch {
  try {
    if ($app -ne $null) {
      [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app)
    }
  } catch {}
  [pscustomobject]@{
    available = $false
    version = ""
    beforePids = $before
    createdPids = $createdPids
    warnings = $warnings
    error = $_.Exception.Message
  } | ConvertTo-Json -Depth 6 -Compress
}
`;

const renderPowerPointScript = String.raw`
param(
  [string]$PptxPath,
  [string]$PdfPath,
  [string]$PngDir
)
$ErrorActionPreference = "Stop"
$before = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$app = $null
$presentation = $null
$createdPids = @()
$warnings = @()
$errors = @()
$pdfOk = $false
$pngFiles = @()
$slideCount = 0
$version = ""
try {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $PdfPath) | Out-Null
  New-Item -ItemType Directory -Force -Path $PngDir | Out-Null
  Get-ChildItem -LiteralPath $PngDir -Filter "*.png" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $PdfPath) { Remove-Item -LiteralPath $PdfPath -Force -ErrorAction SilentlyContinue }

  $app = New-Object -ComObject PowerPoint.Application
  Start-Sleep -Milliseconds 500
  $afterCreate = @(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
  $createdPids = @($afterCreate | Where-Object { $before -notcontains $_ })
  $version = [string]$app.Version
  if ($createdPids.Count -eq 0 -and $before.Count -gt 0) {
    $warnings += "PowerPoint COM used an existing POWERPNT.EXE process; existing user processes will not be force-killed."
  }

  $msoTrue = -1
  $msoFalse = 0
  $presentation = $app.Presentations.Open($PptxPath, $msoTrue, $msoFalse, $msoFalse)
  $slideCount = [int]$presentation.Slides.Count

  for ($i = 1; $i -le $slideCount; $i++) {
    $pngPath = Join-Path $PngDir ("slide-{0:D2}.png" -f $i)
    try {
      [void]$presentation.Slides.Item($i).Export($pngPath, "PNG", 1920, 1080)
    } catch {
      $warnings += "Slide $($i) PNG export failed: $($_.Exception.Message)"
    }
  }
  $pngFiles = @(Get-ChildItem -LiteralPath $PngDir -Filter "*.png" -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object { $_.FullName })

  try {
    [void]$presentation.SaveAs($PdfPath, 32)
    $pdfOk = Test-Path -LiteralPath $PdfPath
  } catch {
    $warnings += "PDF SaveAs failed: $($_.Exception.Message)"
  }
} catch {
  $errors += $_.Exception.Message
} finally {
  if ($presentation -ne $null) {
    try { $presentation.Close() } catch { $warnings += "Presentation close failed: $($_.Exception.Message)" }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) } catch {}
  }
  if ($app -ne $null) {
    if ($createdPids.Count -gt 0) {
      try { $app.Quit() } catch { $warnings += "PowerPoint Quit failed: $($_.Exception.Message)" }
    }
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) } catch {}
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
  Start-Sleep -Milliseconds 1000
  foreach ($createdPid in $createdPids) {
    $proc = Get-Process -Id $createdPid -ErrorAction SilentlyContinue
    if ($proc) {
      try { Stop-Process -Id $createdPid -Force -ErrorAction Stop } catch { $warnings += "Failed to stop POWERPNT.EXE pid $($createdPid): $($_.Exception.Message)" }
    }
  }
}
$deadline = (Get-Date).AddSeconds(8)
do {
  $remainingCreatedPids = @($createdPids | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue })
  if ($remainingCreatedPids.Count -eq 0) { break }
  Start-Sleep -Milliseconds 500
} while ((Get-Date) -lt $deadline)
[pscustomobject]@{
  ok = (($pngFiles.Count -gt 0) -or $pdfOk) -and ($errors.Count -eq 0)
  version = $version
  slideCount = $slideCount
  pdfOk = $pdfOk
  pdfPath = $(if ($pdfOk) { $PdfPath } else { "" })
  pngFiles = $pngFiles
  pngCount = $pngFiles.Count
  beforePids = $before
  createdPids = $createdPids
  remainingCreatedPids = $remainingCreatedPids
  warnings = $warnings
  errors = $errors
} | ConvertTo-Json -Depth 8 -Compress
`;

async function detectPowerPointCom() {
  if (process.platform !== "win32") {
    return { available: false, version: "", warnings: [], error: "PowerPoint COM fallback is only available on Windows.", attempts: [] };
  }
  const result = await runPowerShellScript(detectPowerPointScript, [], 60000);
  const payload = result.json || {};
  return {
    available: Boolean(payload.available),
    version: payload.version || "",
    beforePids: payload.beforePids || [],
    createdPids: payload.createdPids || [],
    warnings: payload.warnings || [],
    error: payload.error || (result.ok ? "" : `${result.error || ""} ${result.stderr || ""}`.trim()),
    rawStdout: result.stdout,
    rawStderr: result.stderr
  };
}

async function renderWithPowerPointCom(item) {
  cleanDir(item.pagesDir);
  const result = await runPowerShellScript(renderPowerPointScript, [item.pptxPath, item.pdfPath, item.pagesDir], 240000);
  const payload = result.json || {};
  const pngPages = Array.isArray(payload.pngFiles) ? payload.pngFiles : pngFiles(item.pagesDir);
  const pdfPath = payload.pdfOk && fs.existsSync(item.pdfPath) ? item.pdfPath : "";
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  if (!result.ok && !errors.length) errors.push(`${result.error || ""} ${result.stderr || ""}`.trim() || "PowerPoint COM render command failed.");
  let renderStatus = "failed";
  if (pngPages.length > 0 && pdfPath) renderStatus = "pdf_and_png";
  else if (pngPages.length > 0) renderStatus = "png_only";
  else if (pdfPath) renderStatus = "pdf_only";
  return {
    renderStatus,
    rendererUsed: "powerpoint_com",
    pdfPath,
    pngPages,
    error: errors.join("; "),
    warnings,
    powerPointCom: {
      version: payload.version || "",
      slideCount: Number(payload.slideCount || 0),
      beforePids: payload.beforePids || [],
      createdPids: payload.createdPids || [],
      remainingCreatedPids: payload.remainingCreatedPids || []
    }
  };
}

function updateManifest(results) {
  const existingManifest = readJson(manifestPath, null);
  const byId = new Map(results.map((item) => [item.deckId, item]));
  const baseSamples = Array.isArray(existingManifest?.samples)
    ? existingManifest.samples
    : sampleIds.map((id) => ({
        id,
        pptType: id,
        pptx: path.join(pptxDir, `${id}.pptx`),
        metadata: path.join(metadataDir, `${id}.json`),
        generationReport: path.join(p1hRoot, "generation-reports", `${id}.json`)
      }));
  const manifest = {
    ...(existingManifest || {}),
    generatedAt: existingManifest?.generatedAt || new Date().toISOString(),
    samples: baseSamples
  };
  manifest.renderedAt = new Date().toISOString();
  manifest.visualReviewReady = results.length > 0 && results.every((item) => Boolean(item.pdfPath) || item.pageImageCount > 0);
  manifest.samples = baseSamples.map((sample) => {
    const rendered = byId.get(sample.id);
    if (!rendered) return sample;
    const renderedPdfAvailable = Boolean(rendered.pdfPath);
    const renderedPngAvailable = rendered.pageImageCount > 0;
    return {
      ...sample,
      renderedPdf: rendered.pdfPath || "",
      renderedPagesDir: rendered.pngDir || path.join(pagesRoot, sample.id),
      renderedPages: rendered.pngPages || [],
      renderStatus: rendered.renderStatus,
      rendererUsed: rendered.rendererUsed,
      renderedPdfAvailable,
      renderedPngAvailable,
      preferredReviewInput: renderedPngAvailable ? "png" : renderedPdfAvailable ? "pdf" : "pptx_static",
      visualReviewReady: renderedPngAvailable || renderedPdfAvailable
    };
  });
  writeJson(manifestPath, manifest);
}

function skippedRecords(pptxFiles, reason, rendererWarning = "") {
  return pptxFiles.map((item) => renderRecord({
    deckId: item.id,
    pptxPath: item.pptxPath,
    pngDir: item.pagesDir,
    expectedSlideCount: item.expectedSlideCount,
    renderStatus: reason,
    rendererUsed: "skipped",
    pdfPath: "",
    pngPages: [],
    error: reason,
    warnings: rendererWarning ? [rendererWarning] : []
  }));
}

async function main() {
  ensureDir(pdfDir);
  ensureDir(pagesRoot);
  sampleIds.forEach((id) => ensureDir(path.join(pagesRoot, id)));

  const pptxFiles = sampleIds.map((id) => ({
    id,
    pptxPath: path.join(pptxDir, `${id}.pptx`),
    pdfPath: path.join(pdfDir, `${id}.pdf`),
    pagesDir: path.join(pagesRoot, id),
    expectedSlideCount: deckExpectedSlideCount(id)
  }));

  const missing = pptxFiles.filter((item) => !fs.existsSync(item.pptxPath));
  const report = {
    status: "failed",
    checkedAt: new Date().toISOString(),
    rendererPriority: ["libreoffice", "powerpoint_com", "skipped"],
    rendererUsed: "skipped",
    libreOffice: { available: false, path: "", version: "", attempts: [] },
    pdfToPng: { available: false, path: "", version: "", attempts: [] },
    powerPointCom: { available: false, version: "", warnings: [], error: "" },
    samples: [],
    warnings: [],
    errors: []
  };

  if (missing.length) {
    report.errors.push(`Missing PPTX files: ${missing.map((item) => item.pptxPath).join(", ")}. Run npm run ${generateScriptName} first.`);
    report.samples = skippedRecords(pptxFiles, "skipped_missing_pptx");
    updateManifest(report.samples);
    writeJson(reportPath, report);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  const soffice = await findExecutable(candidateLibreOfficeBins(), ["--version"]);
  report.libreOffice = {
    available: Boolean(soffice.path),
    path: soffice.path,
    version: soffice.version,
    attempts: soffice.attempts
  };

  if (soffice.path) {
    report.rendererUsed = "libreoffice";
    const pdftoppm = await findExecutable(candidatePdfToPngBins(), ["-h"]);
    report.pdfToPng = {
      available: Boolean(pdftoppm.path),
      path: pdftoppm.path,
      version: pdftoppm.version,
      attempts: pdftoppm.attempts
    };
    if (!pdftoppm.path) {
      report.warnings.push("pdftoppm was not found. PDF rendering can proceed, but PNG page rendering will be skipped.");
    }

    const results = [];
    for (const item of pptxFiles) {
      const warnings = [];
      let pdfPath = "";
      let pngPages = [];
      let error = "";
      let renderStatus = "failed";
      cleanDir(item.pagesDir);
      const pdf = await convertPptxToPdf(soffice.path, item.pptxPath, item.pdfPath);
      if (pdf.ok) {
        pdfPath = item.pdfPath;
        renderStatus = "pdf_only";
        if (pdftoppm.path) {
          const png = await convertPdfToPng(pdftoppm.path, item.pdfPath, item.pagesDir, item.id);
          if (png.ok) {
            pngPages = png.pages;
            renderStatus = "pdf_and_png";
          } else {
            warnings.push(`PNG conversion skipped or failed: ${png.error || "unknown error"}`);
          }
        } else {
          warnings.push("PNG conversion skipped because pdftoppm is unavailable.");
        }
      } else {
        error = `PDF conversion failed: ${pdf.error || "unknown error"}`;
      }
      results.push(renderRecord({
        deckId: item.id,
        pptxPath: item.pptxPath,
        pngDir: item.pagesDir,
        expectedSlideCount: item.expectedSlideCount,
        renderStatus,
        rendererUsed: "libreoffice",
        pdfPath,
        pngPages,
        error,
        warnings
      }));
    }
    report.samples = results;
  } else {
    report.warnings.push("LibreOffice/soffice was not found; trying PowerPoint COM fallback.");
    const powerPoint = await detectPowerPointCom();
    report.powerPointCom = powerPoint;

    if (!powerPoint.available) {
      const reason = "skipped_powerpoint_unavailable";
      report.status = reason;
      report.rendererUsed = "skipped";
      report.warnings.push("PowerPoint COM was not available. No visual render was produced.");
      report.samples = skippedRecords(pptxFiles, reason, "Install LibreOffice or Microsoft PowerPoint, then rerun npm run p1h:render.");
      updateManifest(report.samples);
      writeJson(reportPath, report);
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    report.rendererUsed = "powerpoint_com";
    const results = [];
    for (const item of pptxFiles) {
      const rendered = await renderWithPowerPointCom(item);
      if (rendered.powerPointCom?.remainingCreatedPids?.length) {
        report.warnings.push(`${item.id}: POWERPNT.EXE cleanup left pids ${rendered.powerPointCom.remainingCreatedPids.join(", ")}`);
      }
      results.push(renderRecord({
        deckId: item.id,
        pptxPath: item.pptxPath,
        pngDir: item.pagesDir,
        expectedSlideCount: item.expectedSlideCount || rendered.powerPointCom?.slideCount || 0,
        renderStatus: rendered.renderStatus,
        rendererUsed: rendered.rendererUsed,
        pdfPath: rendered.pdfPath,
        pngPages: rendered.pngPages,
        error: rendered.error,
        warnings: rendered.warnings
      }));
    }
    report.samples = results;
  }

  const failed = report.samples.filter((item) => item.error);
  const pdfCount = report.samples.filter((item) => item.pdfPath).length;
  const pngCount = report.samples.filter((item) => item.pageImageCount > 0).length;
  report.status = failed.length
    ? "failed"
    : pngCount === report.samples.length
      ? "ok"
      : pdfCount === report.samples.length
        ? "pdf_only"
        : pdfCount > 0 || pngCount > 0
          ? "partial"
          : "skipped";
  if (failed.length) {
    report.errors.push(...failed.map((item) => `${item.deckId}: ${item.error}`));
  }
  updateManifest(report.samples);
  writeJson(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const report = {
    status: "failed",
    checkedAt: new Date().toISOString(),
    rendererUsed: "skipped",
    errors: [error instanceof Error ? error.message : String(error)]
  };
  writeJson(reportPath, report);
  console.error(error);
  process.exit(1);
});
