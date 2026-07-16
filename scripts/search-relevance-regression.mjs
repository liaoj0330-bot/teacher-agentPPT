import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { pathToFileURL } from "node:url";

const temp = path.join(os.tmpdir(), `search-relevance-${process.pid}.mjs`);
let source = fs.readFileSync(path.join(process.cwd(), "lib", "ppt-agent", "search-relevance.ts"), "utf8");
source = source.replace(/^import type .*$/gm, "");
fs.writeFileSync(temp, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText);
const { enforceSearchRelevance } = await import(`${pathToFileURL(temp).href}?v=${Date.now()}`);
const result = (title, url, snippet) => ({ resultId: title, title, url, snippet, provider: "test", providerTier: "official_provider", retrievedAt: new Date().toISOString(), confidence: 80, warnings: [] });
const query = "小学一年级数学 10以内加减法 课程标准 教材";
const response = enforceSearchRelevance({ status: "ok", provider: "bing", providerTier: "experimental_fallback", query, warnings: [], results: [
  result("下载 Windows 10", "https://microsoft.com/windows10", "操作系统下载"),
  result("10以内的加减法教学设计", "https://example.com/math", "一年级数学教材与课程标准"),
  result("义务教育数学课程标准", "https://www.moe.gov.cn/example", "课程标准中的数与运算"),
] });
assert.equal(response.status, "ok");
assert.equal(response.results.length, 2);
assert.equal(response.results.some((item) => item.title.includes("Windows")), false);
const empty = enforceSearchRelevance({ status: "ok", provider: "bing", providerTier: "experimental_fallback", query, warnings: [], results: [result("下载 Windows 10", "https://microsoft.com/windows10", "操作系统下载")] });
assert.equal(empty.status, "empty");
assert.ok(empty.warnings.includes("search_results_rejected_as_irrelevant"));
console.log(JSON.stringify({ ok: true, accepted: response.results.map((item) => item.title), rejectedStatus: empty.status }, null, 2));
fs.rmSync(temp, { force: true });
