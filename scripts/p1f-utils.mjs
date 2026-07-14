import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const ROOT = process.cwd();
export const BASE_URL = process.env.APP_BASE_URL || process.env.GOLDEN_BASE_URL || "http://127.0.0.1:3002";
export const REPORT_ROOT = path.join(ROOT, "test-results", "p1-f");
export const EXPORT_ROOT = path.join(REPORT_ROOT, "exported-pptx");
export const LOG_ROOT = path.join(REPORT_ROOT, "logs");
export const FIXTURE_ROOT = path.join(ROOT, "tests", "fixtures", "uploads");
export const SAMPLE_FIXTURES = ["sample.txt", "sample.md", "sample.html", "sample.docx", "sample.pptx", "sample.pdf"];

export const BAD_TEXT_PATTERNS = {
  mojibake: /[\uFFFD]|[鑴欒剹鑺掗埀顑炴拋銇㈡巻鈧枂鐎匽]/,
  internal: /\b(day-route|hero-image|image-strip|tips-grid|stat-card|source-note|route-card|bar-chart|donut-chart|visualPrompt|pageIntent|evidenceBlockIds|sourceIds|layout|debug|mock|placeholder|generated visual)\b/i,
  placeholder: /鍗犱綅|寰呮浛鎹lorem|placeholder|generated visual|鐏板潡|瑙嗚妯″潡|鍥剧墖绱犳潗|绀轰緥妯″潡|璋冭瘯/i
};

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureP1FDirs() {
  [REPORT_ROOT, EXPORT_ROOT, LOG_ROOT].forEach(ensureDir);
  return { REPORT_ROOT, EXPORT_ROOT, LOG_ROOT };
}

export function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function ensureSampleFixtures() {
  ensureDir(FIXTURE_ROOT);
  if (SAMPLE_FIXTURES.every((name) => fileExists(fixturePath(name)))) {
    return true;
  }
  const script = path.join(ROOT, "scripts", "p1f-prepare-fixtures.mjs");
  execFileSync(process.execPath, [script], { stdio: "inherit", env: process.env });
  return SAMPLE_FIXTURES.every((name) => fileExists(fixturePath(name)));
}

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath, text) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, text, "utf8");
  return filePath;
}

export function writeJson(filePath, value) {
  return writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function stripAnsi(text) {
  return String(text || "").replace(/\u001b\[[0-9;]*m/g, "");
}

export function summarizeText(value, max = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return [...text].length > max ? `${[...text].slice(0, max - 1).join("")}…` : text;
}

export function assertNoBadText(label, text) {
  const value = String(text || "");
  if (BAD_TEXT_PATTERNS.mojibake.test(value)) throw new Error(`${label}: mojibake detected`);
  if (BAD_TEXT_PATTERNS.internal.test(value)) throw new Error(`${label}: internal field leaked`);
  if (BAD_TEXT_PATTERNS.placeholder.test(value)) throw new Error(`${label}: placeholder leaked`);
}

export async function fetchJson(url, options = {}) {
  const { method = "GET", headers = {}, body, timeoutMs = 120000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method, headers, body, signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, headers: response.headers, text, json: safeJsonParse(text, null) };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBinary(url, options = {}) {
  const { method = "GET", headers = {}, body, timeoutMs = 120000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method, headers, body, signal: controller.signal });
    const buffer = Buffer.from(await response.arrayBuffer());
    return { ok: response.ok, status: response.status, headers: response.headers, buffer };
  } finally {
    clearTimeout(timer);
  }
}

export async function postJson(pathname, payload, options = {}) {
  return fetchJson(`${BASE_URL}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", ...(options.headers || {}) },
    body: JSON.stringify(payload),
    timeoutMs: options.timeoutMs || 120000
  });
}

function mimeFromName(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".txt")) return "text/plain;charset=utf-8";
  if (lower.endsWith(".md")) return "text/markdown;charset=utf-8";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html;charset=utf-8";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}

export async function uploadFile(filePath, options = {}) {
  const fieldName = options.fieldName || "file";
  const fileName = options.fileName || path.basename(filePath);
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append(fieldName, new Blob([buffer], { type: options.mimeType || mimeFromName(fileName) }), fileName);
  return fetchJson(`${BASE_URL}${options.pathname || "/api/upload-ppt"}`, {
    method: "POST",
    body: form,
    timeoutMs: options.timeoutMs || 120000
  });
}

function pptxJsZipModule() {
  const pptxgenPath = require.resolve("pptxgenjs");
  const nodeModulesDir = pptxgenPath.slice(0, pptxgenPath.lastIndexOf(`${path.sep}pptxgenjs${path.sep}`));
  return path.join(nodeModulesDir, "jszip", "lib", "index.js");
}

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/")}`;
}

export async function loadJsZip() {
  return import(pathToFileUrl(pptxJsZipModule()));
}

export async function inspectPptxBuffer(buffer) {
  const jszip = await loadJsZip();
  const zip = await jszip.default.loadAsync(buffer);
  const xmlFiles = Object.keys(zip.files).filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"));
  const texts = [];
  for (const file of xmlFiles) {
    const xml = await zip.files[file].async("string");
    texts.push(xml.replace(/<[^>]+>/g, " "));
  }
  return { slideCount: xmlFiles.length, xmlFiles, text: texts.join("\n"), zip };
}

export function reportPath(name) {
  return path.join(REPORT_ROOT, name);
}

export function exportPath(name) {
  return path.join(EXPORT_ROOT, name);
}

export function logPath(name) {
  return path.join(LOG_ROOT, name);
}

export function fixturePath(name) {
  return path.join(FIXTURE_ROOT, name);
}

export function urlStatus(response) {
  return `${response.status}${response.ok ? " OK" : ""}`;
}

