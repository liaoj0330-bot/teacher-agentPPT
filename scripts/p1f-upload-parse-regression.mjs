import path from "node:path";
import { ensureP1FDirs, fixturePath, reportPath, writeJson, uploadFile, assert, assertNoBadText } from "./p1f-utils.mjs";

ensureP1FDirs();

const fixtures = [
  "sample.txt",
  "sample.md",
  "sample.html",
  "sample.docx",
  "sample.pptx",
  "sample.pdf"
];

const results = [];
for (const name of fixtures) {
  const filePath = fixturePath(name);
  const response = await uploadFile(filePath);
  assert(response.ok, `${name}: upload failed ${response.status} ${response.text}`);
  const json = response.json;
  assert(json?.status === "uploaded", `${name}: unexpected upload status`);
  assert(json?.analysis, `${name}: missing analysis`);
  assert(Array.isArray(json.analysis.blocks), `${name}: missing analysis blocks`);
  assert(Array.isArray(json.analysis.pages), `${name}: missing analysis pages`);
  assert(json.analysis.blockCount >= 1, `${name}: blockCount too low`);
  assert(json.analysis.summary && json.analysis.summary.length >= 4, `${name}: summary missing`);
  const joined = [
    json.fileName,
    json.analysis.summary,
    ...(json.analysis.outlineSuggestions || []),
    ...(json.analysis.blocks || []).map((block) => `${block.text} ${block.type}`)
  ].join("\n");
  assertNoBadText(name, joined);
  if (name === "sample.html") {
    assert(String(json.analysis.summary).includes("universal-ppt-agent"), `${name}: HTML text not extracted`);
  }
  if (name === "sample.txt" || name === "sample.md") {
    assert(String(json.analysis.summary).includes("source-document"), `${name}: visible text missing`);
  }
  if (name === "sample.pdf") {
    assert(String(json.analysis.summary).includes("editable-pptx") || String(json.analysis.summary).includes("universal-ppt-agent"), `${name}: PDF text missing`);
  }
  results.push({
    file: name,
    fileName: json.fileName,
    pageCount: json.analysis.pageCount,
    blockCount: json.analysis.blockCount,
    summary: json.analysis.summary,
    sourceKind: json.analysis.sourceKind,
    firstBlocks: (json.analysis.blocks || []).slice(0, 4)
  });
}

const output = {
  passed: true,
  checkedAt: new Date().toISOString(),
  results
};

writeJson(reportPath("upload-parse-regression.json"), output);
console.log(JSON.stringify(output, null, 2));
