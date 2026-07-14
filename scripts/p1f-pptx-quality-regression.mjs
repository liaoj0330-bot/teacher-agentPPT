import fs from "node:fs";
import { ensureP1FDirs, ensureSampleFixtures, fixturePath, exportPath, reportPath, postJson, uploadFile, assert, assertNoBadText, inspectPptxBuffer, writeJson, fetchBinary } from "./p1f-utils.mjs";

ensureP1FDirs();
ensureSampleFixtures();

const cases = [
  {
    name: "research-report",
    prompt: "帮我做一份行业趋势研究报告 PPT，面向管理层。要说明研究问题、数据来源、关键发现、趋势判断、机会风险和管理建议。",
    uploadFixture: "sample.txt"
  },
  {
    name: "activity-plan",
    prompt: "帮我做一份新品发布会活动策划 PPT，面向主办方和执行团队。要说明活动目标、主题创意、流程安排、分工、预算、传播和风险预案。",
    uploadFixture: "sample.md"
  },
  {
    name: "courseware",
    prompt: "帮我做一份 AI 入门课程课件 PPT，面向零基础学员。要讲清楚学习目标、知识框架、案例演示、练习任务、课后总结和延伸阅读。",
    uploadFixture: "sample.docx"
  }
];

const results = [];
for (const item of cases) {
  const upload = await uploadFile(fixturePath(item.uploadFixture));
  assert(upload.ok, `${item.name}: upload failed ${upload.status} ${upload.text}`);

  const generated = await postJson("/api/generate-ppt", {
    prompt: item.prompt,
    mode: "agent",
    forceLocal: true,
    uploadedFile: {
      name: upload.json.fileName,
      size: upload.json.size,
      type: upload.json.type,
      analysis: upload.json.analysis
    }
  });
  assert(generated.ok, `${item.name}: generation failed ${generated.status} ${generated.text}`);
  const project = generated.json.project;

  const exportResponse = await postJson("/api/export-pptx", { project });
  assert(exportResponse.ok, `${item.name}: export failed ${exportResponse.status} ${exportResponse.text}`);

  const exportBinary = await fetchBinary(`${process.env.APP_BASE_URL || "http://localhost:3002"}/api/export-pptx`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ project })
  });
  assert(exportBinary.ok, `${item.name}: binary export failed ${exportBinary.status}`);

  const outFile = exportPath(`${item.name}.pptx`);
  fs.writeFileSync(outFile, exportBinary.buffer);
  const pptx = await inspectPptxBuffer(fs.readFileSync(outFile));
  assert(pptx.slideCount >= 6, `${item.name}: too few slides`);
  assertNoBadText(`${item.name}: pptx`, pptx.text);

  results.push({
    name: item.name,
    slides: project.slides.length,
    exportSize: fs.statSync(outFile).size,
    slideCount: pptx.slideCount,
    title: project.title,
    pptType: project.reviewCenter?.pptType
  });
}

const report = {
  passed: true,
  checkedAt: new Date().toISOString(),
  results
};

writeJson(reportPath("pptx-quality-regression.json"), report);
console.log(JSON.stringify(report, null, 2));
