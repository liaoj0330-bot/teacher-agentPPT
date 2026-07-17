import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const pptxPath = path.resolve(
  process.env.PPTX_PATH ||
    "D:/tmp/sandun-replica/teacher-final-acceptance-20260716/10以内的加减法.pptx",
);
const outputDir = path.resolve(
  process.env.OUTPUT_DIR ||
    "D:/tmp/sandun-replica/teacher-final-acceptance-20260716",
);
const pngDir = path.join(outputDir, "rendered");
const pdfPath = path.join(outputDir, "10以内的加减法.pdf");
const reportPath = path.join(outputDir, "final-acceptance-report.json");
const expectedSlideCount = Number(process.env.EXPECTED_SLIDE_COUNT || 0) || null;
const banned = [
  "audienceQuestion",
  "mustProve",
  "masteryCheck",
  "childOutputRequired",
  "TODO",
  "工程路径",
  "系统提示词",
];

if (!fs.existsSync(pptxPath)) throw new Error(`PPTX not found: ${pptxPath}`);
fs.mkdirSync(pngDir, { recursive: true });

const buffer = fs.readFileSync(pptxPath);
const zip = await JSZip.loadAsync(buffer);
const slideNames = Object.keys(zip.files)
  .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
const xmlText = (
  await Promise.all(slideNames.map((name) => zip.files[name].async("string")))
).join(" ");
const visibleText = xmlText
  .replace(/<a:br\s*\/>/g, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ");

const ps = String.raw`param([string]$PptxPath,[string]$PdfPath,[string]$PngDir)
$ErrorActionPreference='Stop'
$before=@(Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object Id)
$app=$null; $presentation=$null; $created=@(); $warnings=@(); $errors=@()
try {
  New-Item -ItemType Directory -Force -Path $PngDir | Out-Null
  Get-ChildItem -LiteralPath $PngDir -Filter '*.png' -ErrorAction SilentlyContinue | Remove-Item -Force
  $app=New-Object -ComObject PowerPoint.Application
  Start-Sleep -Milliseconds 500
  $created=@((Get-Process POWERPNT -ErrorAction SilentlyContinue | ForEach-Object Id) | Where-Object { $before -notcontains $_ })
  $presentation=$app.Presentations.Open($PptxPath,-1,0,0)
  $slideCount=[int]$presentation.Slides.Count
  1..$slideCount | ForEach-Object {
    $target=Join-Path $PngDir ('slide-{0:D2}.png' -f $_)
    $presentation.Slides.Item($_).Export($target,'PNG',1920,1080)
  }
  $presentation.SaveAs($PdfPath,32)
} catch { $errors += $_.Exception.Message }
finally {
  if($presentation){try{$presentation.Close()}catch{};try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)}catch{}}
  if($app){if($created.Count -gt 0){try{$app.Quit()}catch{}};try{[void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)}catch{}}
  [GC]::Collect(); [GC]::WaitForPendingFinalizers()
}
$pngFiles=@(Get-ChildItem -LiteralPath $PngDir -Filter '*.png' -ErrorAction SilentlyContinue | Sort-Object Name | ForEach-Object FullName)
[pscustomobject]@{ok=($errors.Count -eq 0 -and (Test-Path -LiteralPath $PdfPath) -and $pngFiles.Count -eq $slideCount);slideCount=$slideCount;pngFiles=$pngFiles;pdfPath=$PdfPath;warnings=$warnings;errors=$errors}|ConvertTo-Json -Depth 5 -Compress`;
const psPath = path.join(outputDir, "render-final-pptx.ps1");
fs.writeFileSync(psPath, ps, "utf8");
let render;
try {
  const raw = execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psPath, pptxPath, pdfPath, pngDir],
    { encoding: "utf8", timeout: 300_000, windowsHide: true },
  );
  render = JSON.parse(raw.trim());
} finally {
  fs.rmSync(psPath, { force: true });
}

const bannedMatches = banned.filter((term) => visibleText.includes(term));
const mojibakeDetected = /\uFFFD|(?:Ã.|Â.|â€)|(?:锟斤拷)/.test(visibleText);
const questionMarkPlaceholderDetected = /\?{3,}/.test(visibleText);
const renderedFiles = fs
  .readdirSync(pngDir)
  .filter((name) => name.endsWith(".png"))
  .sort();
const report = {
  structurePass:
    buffer.subarray(0, 4).toString("hex") === "504b0304" &&
    (expectedSlideCount === null || slideNames.length === expectedSlideCount) &&
    bannedMatches.length === 0 &&
    !mojibakeDetected &&
    !questionMarkPlaceholderDetected,
  renderPass: render.ok === true && renderedFiles.length === slideNames.length,
  checkedAt: new Date().toISOString(),
  pptxPath,
  pptxBytes: buffer.length,
  officeZip: Boolean(zip.file("[Content_Types].xml") && zip.file("ppt/presentation.xml")),
  slideCount: slideNames.length,
  expectedSlideCount,
  renderedCount: renderedFiles.length,
  pdfPath,
  bannedMatches,
  mojibakeDetected,
  questionMarkPlaceholderDetected,
  render,
};
report.pass = report.structurePass && report.renderPass;
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
