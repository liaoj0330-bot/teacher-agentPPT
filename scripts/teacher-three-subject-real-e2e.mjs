import fs from "node:fs";

const base = "http://127.0.0.1:3002";
const output = "artifacts/teacher-three-subject-real/report.json";
const cases = [
  {
    id: "math-grade2",
    task: { schoolStage: "小学", grade: "二年级", subject: "数学", topic: "100以内加减法", duration: "40分钟", textbook: "人教版二年级数学上册", chapter: "第二单元 100以内的加法和减法", teachingRequirements: "理解进位加法和退位减法，用摆小棒、竖式和生活问题完成练习。", teacherStyle: { visualMode: "teaching_grid", theme: "rational_teal" } },
    forbidden: /英语对话|单词发音|课文朗读|修辞手法|解析式|坐标|自变量|因变量|参数|函数/,
  },
  {
    id: "chinese-grade3",
    task: { schoolStage: "小学", grade: "三年级", subject: "语文", topic: "秋天的雨", duration: "40分钟", textbook: "统编版语文三年级上册", chapter: "第二单元 第6课 秋天的雨", teachingRequirements: "朗读课文，理解五彩缤纷等词语，梳理段落结构并体会比喻和拟人的表达效果。", teacherStyle: { visualMode: "teaching_editorial", theme: "book_blue" } },
    forbidden: /解析式|坐标|自变量|因变量|参数|描点|函数/,
  },
  {
    id: "english-grade7",
    task: { schoolStage: "初中", grade: "七年级", subject: "英语", topic: "Greetings and Introductions", duration: "45分钟", textbook: "人教版七年级英语上册", chapter: "Starter Unit 1", teachingRequirements: "能够使用Hello、Good morning和My name is进行真实问候与自我介绍，完成两人对话练习。", teacherStyle: { visualMode: "teaching_editorial", theme: "warm_orange" } },
    forbidden: /解析式|坐标|自变量|因变量|参数|描点|函数|修辞手法/,
  },
];

async function json(path, init = {}, cookie = "") {
  const response = await fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers || {}) } });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(`${path} HTTP ${response.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return { response, data };
}

async function patchPlan(plan, action, cookie) {
  return (await json("/api/teacher-courseware-plan/state", { method: "PATCH", body: JSON.stringify({ projectId: plan.projectId, requestId: plan.requestId, expectedRevision: plan.revision, action }) }, cookie)).data.plan;
}

async function runCase(testCase) {
  const teacherTask = { scenario: "teacher_courseware", planningMode: "professional", generationMode: "chapter_prep", uploadedFiles: [], pastedMaterials: "", ...testCase.task };
  const registered = await json("/api/auth/register", { method: "POST", body: JSON.stringify({ name: `三学科验收-${testCase.id}`, email: `three-subject-${testCase.id}-${Date.now()}@example.com`, password: "Teacher123!" }) });
  const cookie = registered.response.headers.get("set-cookie")?.split(";")[0] || "";
  if (!cookie) throw new Error(`${testCase.id}: registration did not return a session cookie`);

  const deckPlan = (await json("/api/teacher-courseware-plan", { method: "POST", body: JSON.stringify({ teacherTask }) }, cookie)).data.deckPlan;
  let state = (await json("/api/teacher-courseware-plan/state", { method: "POST", body: JSON.stringify({ teacherTask, planId: deckPlan.planId, pages: deckPlan.pages }) }, cookie)).data.plan;
  if (state.status === "reviewing") state = await patchPlan(state, { type: "confirm" }, cookie);
  if (state.status === "confirmed") state = await patchPlan(state, { type: "start_compile" }, cookie);
  if (state.status !== "compiling") throw new Error(`${testCase.id}: plan state is ${state.status}`);

  const confirmedTask = { ...teacherTask, deckPlan: { ...state, status: "confirmed", confirmedAt: new Date().toISOString(), pageCount: state.pages.length } };
  const prompt = `请为${teacherTask.schoolStage}${teacherTask.grade}${teacherTask.subject}课题“${teacherTask.topic}”生成一份${teacherTask.duration}的课堂课件。教材：${teacherTask.textbook}；章节：${teacherTask.chapter}；教学要求：${teacherTask.teachingRequirements}。`;
  const generated = (await json("/api/generate-ppt", { method: "POST", body: JSON.stringify({ scenario: "teacher_courseware", teacherTask: confirmedTask, prompt, mode: "agent", planningMode: "professional", teacherStyle: teacherTask.teacherStyle, projectId: state.projectId }) }, cookie)).data;
  const slides = generated.project?.slides || [];
  const visibleText = slides.map((slide) => [slide.title, slide.subtitle, ...(slide.bullets || []), JSON.stringify(slide.sections || [])].join(" ")).join("\n");
  if (slides.length !== deckPlan.pages.length) throw new Error(`${testCase.id}: planned ${deckPlan.pages.length}, generated ${slides.length}`);
  if (new Set(slides.map((slide) => slide.id)).size !== slides.length) throw new Error(`${testCase.id}: duplicate slide ids`);
  if (!visibleText.includes(teacherTask.topic)) throw new Error(`${testCase.id}: topic not realized in visible content`);
  if (testCase.forbidden.test(visibleText)) throw new Error(`${testCase.id}: cross-subject leakage matched ${testCase.forbidden}`);

  return {
    id: testCase.id,
    subject: teacherTask.subject,
    topic: teacherTask.topic,
    planPageCount: deckPlan.pages.length,
    generatedPageCount: slides.length,
    projectId: generated.projectId,
    versionId: generated.versionId,
    roles: deckPlan.pages.map((page) => page.role),
    titles: slides.map((slide) => slide.title),
    sampleBullets: slides.slice(0, 3).map((slide) => slide.bullets?.slice(0, 2) || []),
    fingerprint: visibleText.replace(/\s+/g, " ").slice(0, 800),
  };
}

const report = { startedAt: new Date().toISOString(), pass: false, cases: [], comparisons: {} };
try {
  for (const testCase of cases) report.cases.push(await runCase(testCase));
  const fingerprints = report.cases.map((item) => item.fingerprint);
  report.comparisons.uniqueFingerprints = new Set(fingerprints).size;
  report.comparisons.uniqueRoleSequences = new Set(report.cases.map((item) => item.roles.join("|"))).size;
  report.comparisons.uniqueTitleSequences = new Set(report.cases.map((item) => item.titles.join("|"))).size;
  if (report.comparisons.uniqueFingerprints !== cases.length) throw new Error("three subjects produced duplicate visible-content fingerprints");
  if (report.comparisons.uniqueRoleSequences !== cases.length) throw new Error("three subjects produced duplicate teaching-role sequences");
  if (report.comparisons.uniqueTitleSequences !== cases.length) throw new Error("three subjects produced duplicate title sequences");
  report.pass = true;
} catch (error) {
  report.error = String(error?.stack || error);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync("artifacts/teacher-three-subject-real", { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}
