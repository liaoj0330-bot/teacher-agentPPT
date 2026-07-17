import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-duration-encoding");
const cases = [
  { duration: "25分钟", expectedPages: 7 },
  { duration: "45分钟", expectedPages: 16 },
  { duration: "60分钟", expectedPages: 18 },
  { duration: "90分钟", expectedPages: 22 },
];
const badTextPattern = /\?{3,}|\uFFFD|锟斤拷|脙|脗|鈧|掆€/;

async function requestJson(url, init = {}) {
  const response = await fetch(`${base}${url}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(`${url} HTTP ${response.status}: ${JSON.stringify(data).slice(0, 600)}`);
  }
  return data;
}

fs.mkdirSync(outputDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), base, pass: false, cases: [] };

try {
  for (const testCase of cases) {
    const teacherTask = {
      scenario: "teacher_courseware",
      planningMode: "professional",
      generationMode: "chapter_prep",
      schoolStage: "高中",
      grade: "高二",
      subject: "物理",
      topic: "楞次定律",
      duration: testCase.duration,
      textbook: "人教版高中物理选择性必修第二册",
      chapter: "第二章 电磁感应",
      teachingRequirements: "从磁通量变化、感应电流磁场和阻碍关系建立判断方法，包含实验观察、方向判断、纠错和迁移练习。",
      uploadedFiles: [],
      pastedMaterials: "",
      teacherStyle: { visualMode: "teaching_grid", theme: "rational_teal" },
    };
    const result = await requestJson("/api/teacher-courseware-plan", {
      method: "POST",
      body: JSON.stringify({ teacherTask }),
    });
    const pages = result.deckPlan?.pages || [];
    const visibleText = JSON.stringify({ contentPlan: result.contentPlan, pages });
    if (pages.length !== testCase.expectedPages) {
      throw new Error(`${testCase.duration}: expected ${testCase.expectedPages} pages, received ${pages.length}`);
    }
    if (badTextPattern.test(visibleText)) {
      throw new Error(`${testCase.duration}: invalid or placeholder characters detected`);
    }
    if (new Set(pages.map((page) => page.id)).size !== pages.length) {
      throw new Error(`${testCase.duration}: duplicate page ids detected`);
    }
    report.cases.push({
      duration: testCase.duration,
      expectedPages: testCase.expectedPages,
      actualPages: pages.length,
      roles: pages.map((page) => page.role),
      titles: pages.map((page) => page.titleIntent),
    });
  }
  report.pass = true;
} catch (error) {
  report.error = String(error?.stack || error);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}
