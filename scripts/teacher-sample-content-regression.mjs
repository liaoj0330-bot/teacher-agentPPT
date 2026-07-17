import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-sample-content");
const cases = [
  {
    id: "physics-h2-lenz",
    subject: "物理",
    schoolStage: "高中",
    grade: "高二",
    topic: "楞次定律",
    textbook: "人教版高中物理选择性必修第二册",
    chapter: "第二章 电磁感应",
    teachingRequirements: "包含实验观察、方向判断、纠错和迁移练习。",
    required: ["楞次定律", "磁通量", "右手螺旋定则", "练习"],
  },
  {
    id: "chinese-j8-beiying",
    subject: "语文",
    schoolStage: "初中",
    grade: "初二",
    topic: "背影",
    textbook: "人教版八年级上册",
    chapter: "第五单元",
    teachingRequirements: "围绕关键段落进行细读，完成朗读、批注、证据回扣和表达迁移。",
    required: ["背影", "攀", "缩", "倾", "动作细节"],
  },
];

async function requestJson(url, init = {}) {
  const response = await fetch(`${base}${url}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(`${url} HTTP ${response.status}: ${JSON.stringify(data).slice(0, 800)}`);
  return data;
}

fs.mkdirSync(outputDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), base, pass: false, cases: [] };
try {
  for (const testCase of cases) {
    const { required, ...teacherTask } = testCase;
    const result = await requestJson("/api/generate-ppt", {
      method: "POST",
      body: JSON.stringify({
        scenario: "teacher_courseware",
        planningMode: "professional",
        mode: "agent",
        forceLocal: true,
        teacherTask: {
          scenario: "teacher_courseware",
          planningMode: "professional",
          generationMode: "chapter_prep",
          duration: "45分钟",
          uploadedFiles: [],
          pastedMaterials: "",
          teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" },
          ...teacherTask,
        },
      }),
    });
    const project = result.project;
    const drafts = project?.contentDrafts || [];
    if (!project?.slides?.length || drafts.length !== project.slides.length) throw new Error(`${testCase.id}: slide/draft count mismatch`);
    const visible = JSON.stringify(drafts);
    const missing = required.filter((term) => !visible.includes(term));
    if (missing.length) throw new Error(`${testCase.id}: missing subject-specific terms ${missing.join(", ")}`);
    if (/教师补充|待补充|请补充|\?{3,}|placeholder|TODO/i.test(visible)) throw new Error(`${testCase.id}: generated drafts contain placeholders`);
    report.cases.push({
      id: testCase.id,
      slideCount: project.slides.length,
      draftCount: drafts.length,
      titles: project.slides.map((slide) => slide.title),
      requiredTerms: required,
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
