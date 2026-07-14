import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const resultDir = path.join(repoRoot, "test-results", "p1-g");
const reportPath = path.join(resultDir, "parser-runtime-check.json");
const scriptPath = path.join(repoRoot, "scripts", "parse_document.py");
const requirementsPath = path.join(repoRoot, "requirements-parser.txt");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pythonCandidates() {
  return [
    process.env.PYTHON_BIN,
    path.join(repoRoot, ".venv-parser", "Scripts", "python.exe"),
    path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe"),
    "python",
    "python3"
  ].filter(Boolean);
}

async function tryExec(file, args, options = {}) {
  try {
    const result = await execFileAsync(file, args, {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: options.timeout || 20000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
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

async function findPython() {
  const attempts = [];
  for (const candidate of pythonCandidates()) {
    const result = await tryExec(candidate, ["--version"], { timeout: 8000 });
    attempts.push({ candidate, ...result });
    if (result.ok) {
      return { python: candidate, version: `${result.stdout || result.stderr}`.trim(), attempts };
    }
  }
  return { python: "", version: "", attempts };
}

async function checkImport(python, moduleName) {
  const result = await tryExec(python, ["-c", `import ${moduleName}; print("ok")`], { timeout: 10000 });
  return {
    module: moduleName,
    ok: result.ok && result.stdout.trim() === "ok",
    error: result.ok ? "" : `${result.error || ""} ${result.stderr || ""}`.trim()
  };
}

async function checkParse(python) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sandun-parser-check-"));
  const samplePath = path.join(tmpDir, "sample.txt");
  fs.writeFileSync(samplePath, "parser-runtime-check sample\nsource-document text extraction\n", "utf8");
  try {
    const result = await tryExec(python, [scriptPath, samplePath, "sample.txt"], { timeout: 20000 });
    if (!result.ok) {
      return { ok: false, error: `${result.error || ""} ${result.stderr || ""}`.trim() };
    }
    const parsed = JSON.parse(result.stdout);
    return {
      ok: parsed?.blockCount >= 1 && String(parsed?.summary || "").includes("source-document"),
      blockCount: parsed?.blockCount || 0,
      sourceKind: parsed?.sourceKind || "",
      summary: parsed?.summary || ""
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

const report = {
  status: "failed",
  checkedAt: new Date().toISOString(),
  repoRoot,
  checks: {
    pythonExists: false,
    parseScriptExists: fs.existsSync(scriptPath),
    requirementsExists: fs.existsSync(requirementsPath),
    imports: [],
    tinyParse: { ok: false }
  },
  python: "",
  pythonVersion: "",
  guidance: "Run scripts/setup-parser-python.ps1, then run npm run p1g:parser-check again.",
  errors: []
};

const found = await findPython();
report.python = found.python;
report.pythonVersion = found.version;
report.pythonAttempts = found.attempts.map((attempt) => ({
  candidate: attempt.candidate,
  ok: attempt.ok,
  error: attempt.ok ? "" : `${attempt.error || ""} ${attempt.stderr || ""}`.trim()
}));
report.checks.pythonExists = Boolean(found.python);

if (!report.checks.parseScriptExists) report.errors.push(`Missing parser script: ${scriptPath}`);
if (!report.checks.requirementsExists) report.errors.push(`Missing requirements file: ${requirementsPath}`);
if (!found.python) report.errors.push("Python runtime was not found.");

if (found.python && report.checks.parseScriptExists && report.checks.requirementsExists) {
  report.checks.imports = await Promise.all(["pdfplumber", "docx", "pptx"].map((moduleName) => checkImport(found.python, moduleName)));
  report.checks.tinyParse = await checkParse(found.python);
  for (const item of report.checks.imports) {
    if (!item.ok) report.errors.push(`Missing Python dependency import: ${item.module}`);
  }
  if (!report.checks.tinyParse.ok) report.errors.push(`Parser script failed tiny parse: ${report.checks.tinyParse.error || "unknown error"}`);
}

report.status = report.errors.length ? "failed" : "ok";
writeJson(reportPath, report);
console.log(JSON.stringify(report, null, 2));

if (report.status !== "ok") {
  process.exitCode = 1;
}
