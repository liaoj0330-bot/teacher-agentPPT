import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL || "http://127.0.0.1:3002";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-lesson-orchestration");
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
    learnerProfile: { baseline: "已经学习磁通量，但右手螺旋定则不熟练。", commonDifficulties: "容易把阻碍变化理解为方向永远相反。", classSize: 46 },
    classroomConstraints: { equipment: "仅投影，无实验设备", assessmentFocus: "conceptual_understanding" },
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
    learnerProfile: { baseline: "已经通读课文，能够概括车站送别情节。", commonDifficulties: "容易复述故事，不能把词句证据与情感判断连接起来。", classSize: 42 },
    classroomConstraints: { equipment: "投影和黑板", assessmentFocus: "balanced" },
  },
];

async function requestJson(url, init = {}) {
  const response = await fetch(`${base}${url}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(`${url} HTTP ${response.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

fs.mkdirSync(outputDir, { recursive: true });
const report = { startedAt: new Date().toISOString(), base, pass: false, cases: [] };

try {
  for (const testCase of cases) {
    const result = await requestJson("/api/teacher-courseware-plan", {
      method: "POST",
      body: JSON.stringify({
        teacherTask: {
          scenario: "teacher_courseware",
          planningMode: "professional",
          generationMode: "chapter_prep",
          duration: "45分钟",
          uploadedFiles: [],
          pastedMaterials: "",
          teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" },
          ...testCase,
        },
      }),
    });
    const pages = result.deckPlan?.pages || [];
    const lessonBlueprint = result.contentPlan?.lessonBlueprint;
    const lessonPlan = result.contentPlan?.lessonPlan;
    const deliveryPack = result.contentPlan?.deliveryPack;
    if (!lessonBlueprint) throw new Error(`${testCase.id}: missing lesson blueprint`);
    const expectedArchitecture = testCase.subject === "物理" ? "experiment_inquiry" : "close_reading";
    if (lessonBlueprint.architecture !== expectedArchitecture) throw new Error(`${testCase.id}: expected ${expectedArchitecture}, got ${lessonBlueprint.architecture}`);
    if (lessonBlueprint.planId !== result.contentPlan?.planId) throw new Error(`${testCase.id}: lesson blueprint plan id mismatch`);
    if (!lessonBlueprint.drivingQuestion || !lessonBlueprint.lessonPromise || !lessonBlueprint.objectives?.length || !lessonBlueprint.keyDifficulties?.length) throw new Error(`${testCase.id}: incomplete lesson blueprint`);
    if (lessonBlueprint.teacherDecisions?.length < 3) throw new Error(`${testCase.id}: blueprint must expose teacher decisions`);
    if (!lessonBlueprint.learnerAssumptions?.some((item) => item.includes(String(testCase.learnerProfile.classSize)))) throw new Error(`${testCase.id}: class size did not reach blueprint`);
    if (!lessonBlueprint.learnerAssumptions?.some((item) => item.includes(testCase.learnerProfile.baseline.slice(0, 6)))) throw new Error(`${testCase.id}: learner baseline did not reach blueprint`);
    if (!lessonPlan || lessonPlan.totalMinutes !== 45) throw new Error(`${testCase.id}: lessonPlan totalMinutes is not 45`);
    if (!Array.isArray(lessonPlan.events) || lessonPlan.events.length < 5) throw new Error(`${testCase.id}: lesson event plan is too thin`);
    if (lessonPlan.events.length === pages.length) throw new Error(`${testCase.id}: lesson events are still conflated with presentation pages`);
    if (lessonPlan.events.reduce((sum, event) => sum + event.durationMinutes, 0) !== 45) throw new Error(`${testCase.id}: lesson event duration mismatch`);
    if (new Set(lessonPlan.events.map((event) => event.id)).size !== lessonPlan.events.length) throw new Error(`${testCase.id}: duplicate lesson event ids`);
    for (const event of lessonPlan.events) {
      if (!["teacherAction", "studentAction", "expectedResponse", "evidenceOfLearning", "fallbackAction"].every((field) => typeof event[field] === "string" && event[field].trim())) {
        throw new Error(`${testCase.id}: incomplete event ${event.id}`);
      }
    }
    if (testCase.subject === "物理" && !lessonPlan.events.some((event) => event.teacherAction.includes("无实验设备") || event.teacherAction.includes("等价动态演示"))) throw new Error(`${testCase.id}: classroom equipment constraint did not alter lesson route`);
    if (pages.some((page) => !page.lessonEventId)) throw new Error(`${testCase.id}: page missing lessonEventId`);
    const linkedSlideIds = lessonPlan.events.flatMap((event) => event.slideIds || []);
    if (new Set(linkedSlideIds).size !== pages.length || linkedSlideIds.length !== pages.length) throw new Error(`${testCase.id}: pages must link to exactly one lesson event`);
    if (!deliveryPack) throw new Error(`${testCase.id}: missing teacher delivery pack`);
    if (deliveryPack.planId !== result.contentPlan?.planId) throw new Error(`${testCase.id}: delivery pack plan id mismatch`);
    if (deliveryPack.teacherNotes?.length !== pages.length) throw new Error(`${testCase.id}: teacher notes/page count mismatch`);
    if (new Set(deliveryPack.teacherNotes.map((note) => note.pageId)).size !== pages.length) throw new Error(`${testCase.id}: teacher notes must cover every page once`);
    if (!deliveryPack.answerKey?.length) throw new Error(`${testCase.id}: missing answer key`);
    if (deliveryPack.boardPlan?.columns?.length !== 3) throw new Error(`${testCase.id}: board plan must have three columns`);
    if (!["基础", "提高", "迁移"].every((level) => deliveryPack.homework?.some((item) => item.level === level))) throw new Error(`${testCase.id}: incomplete differentiated homework`);
    const packText = JSON.stringify(deliveryPack);
    if (/\?{3,}|教师补充|待补充|TODO|placeholder/i.test(packText)) throw new Error(`${testCase.id}: delivery pack contains a placeholder`);
    report.cases.push({
      id: testCase.id,
      subject: testCase.subject,
      pageCount: pages.length,
      architecture: lessonBlueprint.architecture,
      drivingQuestion: lessonBlueprint.drivingQuestion,
      lessonPromise: lessonBlueprint.lessonPromise,
      objectiveCount: lessonBlueprint.objectives.length,
      teacherDecisionCount: lessonBlueprint.teacherDecisions.length,
      lessonEventCount: lessonPlan.events.length,
      totalMinutes: lessonPlan.totalMinutes,
      durations: lessonPlan.events.map((event) => event.durationMinutes),
      eventTypes: lessonPlan.events.map((event) => event.type),
      roles: pages.map((page) => page.role),
      deliveryPack: {
        planId: deliveryPack.planId,
        teacherNotes: deliveryPack.teacherNotes.length,
        answerKey: deliveryPack.answerKey.length,
        boardColumns: deliveryPack.boardPlan.columns.length,
        homeworkLevels: deliveryPack.homework.map((item) => item.level),
      },
    });
  }
  if (JSON.stringify(report.cases[0].eventTypes) === JSON.stringify(report.cases[1].eventTypes)) throw new Error("physics and Chinese event sequences must differ");
  report.pass = true;
} catch (error) {
  report.error = String(error?.stack || error);
} finally {
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}
