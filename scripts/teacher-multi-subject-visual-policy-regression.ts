import assert from "node:assert/strict";
import type { DeckSpec, DesignSlide, SlideSpec } from "../lib/canvas-data.ts";
import { buildRenderScenesV2 } from "../lib/visual-compiler/scene-builder-v2.ts";
import { inferTeacherSubjectVisualProfile } from "../lib/visual-compiler/layout-recipes.ts";
import { teacherLayoutProtocol } from "../lib/visual-compiler/teacher-layout-protocol.ts";
import { validateRenderScenesV2 } from "../lib/visual-compiler/qa-v2.ts";

type SubjectCase = {
  subject: string;
  profile: "math" | "chemistry" | "biology" | "history" | "geography" | "english";
  prefix: string;
  titles: string[];
};

const cases: SubjectCase[] = [
  { subject: "数学", profile: "math", prefix: "math-", titles: ["一次函数", "今天怎样证明学会了", "从生活变化量提出问题", "用等式表示变量关系", "例题：从条件到解析式", "在坐标系中画出函数图像", "比较两组图像的变化趋势", "变式练习：斜率改变", "纠错：漏写自变量范围", "小组解释图像与实际意义", "30秒检测与分层练习", "总结与课后迁移"] },
  { subject: "化学", profile: "chemistry", prefix: "chemistry-", titles: ["质量守恒定律", "今天怎样证明学会了", "实验安全与器材规范", "观察反应物和实验现象", "从分子原子解释微观变化", "写出并配平化学方程式", "反应前后粒子怎样守恒", "变式实验：条件改变", "纠错：现象不能代替结论", "小组设计证据记录表", "30秒检测与实验评价", "总结与课后迁移"] },
  { subject: "生物", profile: "biology", prefix: "biology-", titles: ["细胞的结构和功能", "今天怎样证明学会了", "显微镜观察实验", "识别细胞结构并标注", "结构与功能怎样对应", "细胞生命活动的过程", "物质进入细胞的循环", "比较植物与动物细胞", "纠错：图像位置与实际结构", "小组解释观察证据", "30秒检测与结构迁移", "总结与课后迁移"] },
  { subject: "历史", profile: "history", prefix: "history-", titles: ["商鞅变法", "今天怎样证明学会了", "把事件放回历史年代", "从史料识别变法背景", "多重原因怎样推动改革", "措施与影响形成因果地图", "比较两则史料的观点", "课堂辩论：改革是否成功", "用证据反驳单一结论", "回到时间线定位转折", "30秒检测与史料论证", "总结与课后迁移"] },
  { subject: "地理", profile: "geography", prefix: "geography-", titles: ["中国的气候", "今天怎样证明学会了", "在地图中定位气候区", "读气温降水统计图表", "季风过程怎样形成", "地形与海陆位置的影响", "比较两地气候数据", "人地关系与农业选择", "地图考察：判断区域", "小组解释地理系统链", "30秒检测与数据结论", "总结与课后迁移"] },
  { subject: "英语", profile: "english", prefix: "english-", titles: ["Greetings and Introductions", "How do we show our learning", "Listen and notice useful expressions", "Vocabulary and sentence drill", "Dialogue: greet a new classmate", "Role play with different identities", "Read and locate personal information", "Use text evidence to answer", "Grammar drill: be verbs", "Pair speaking and feedback", "Exit check and short presentation", "Summary and assignment"] }
];

function makeDeck(testCase: SubjectCase) {
  const slides: DesignSlide[] = testCase.titles.map((title, index) => ({
    id: `${testCase.profile}-${index + 1}`,
    title,
    subtitle: index === 0 ? `${testCase.subject}课堂` : "课堂任务、证据与学生输出",
    tone: "课堂",
    bullets: ["任务：观察、判断或表达", "证据：记录依据与过程", "输出：解释结论并接受反馈"]
  }));
  const slideSpecs: SlideSpec[] = slides.map((slide, index) => ({
    id: `spec-${slide.id}`,
    page: index + 1,
    slideId: slide.id,
    title: slide.title,
    finalTitle: slide.title,
    role: index === 0 ? "课程封面" : index === 1 ? "学习目标" : index === slides.length - 1 ? "作业布置" : "课堂学习",
    pagePurpose: slide.title,
    claim: slide.subtitle || "",
    mustProve: slide.subtitle || "",
    evidenceNeeds: [],
    evidenceSourceIds: [],
    selectedLayout: index === 0 ? "tm01_teacher_math_cover" : index === 1 ? "tm02_learning_objectives" : index === slides.length - 1 ? "tm13_assignment_extension" : "tm04_concept_definition",
    layoutIntent: "evidence",
    layoutReason: `${testCase.subject}课堂场景`,
    visualIntent: `${testCase.subject}专属可编辑视觉`,
    density: "balanced",
    mustHave: [], avoid: [], scoreRules: [],
    visibleBlocks: (slide.bullets || []).map((body, blockIndex) => ({ type: "point", title: ["任务", "证据", "输出"][blockIndex], body, priority: "must" as const }))
  }));
  const deckSpec: DeckSpec = {
    id: `deck-${testCase.profile}`, version: "1", pptType: "courseware", pptTypeLabel: `${testCase.subject}教师课件`, audience: "中学生",
    goal: `${testCase.subject}课堂学习`, coreMessage: `${testCase.subject}学科任务与证据`, expectedDecision: "完成课堂任务",
    recommendedSlideCount: slides.length, requiredPages: [], forbiddenContent: [], evidenceNeeds: [], styleProfile: "teaching_grid", qualityBar: 82,
    slideSpecs, createdAt: new Date(0).toISOString()
  };
  return { deckSpec, slides };
}

function longestRun(values: string[]) {
  let longest = 0;
  let current = 0;
  let previous = "";
  values.forEach((value) => {
    current = value === previous ? current + 1 : 1;
    previous = value;
    longest = Math.max(longest, current);
  });
  return longest;
}

const reports = cases.map((testCase) => {
  assert.equal(inferTeacherSubjectVisualProfile(`${testCase.subject}教师课件 ${testCase.titles.join(" ")}`), testCase.profile);
  const scenes = buildRenderScenesV2({ ...makeDeck(testCase), layouts: teacherLayoutProtocol });
  const families = scenes.map((scene) => scene.composition?.family || scene.layoutId);
  const uniqueFamilies = new Set(families);
  const subjectSpecificFamilies = new Set(families.filter((family) => family.startsWith(testCase.prefix)));
  const subjectSpecificPages = families.filter((family) => family.startsWith(testCase.prefix)).length;
  const qa = validateRenderScenesV2(scenes, teacherLayoutProtocol);
  assert.ok(uniqueFamilies.size >= 6, `${testCase.subject} must use at least six composition families`);
  assert.ok(subjectSpecificFamilies.size >= 3, `${testCase.subject} must use three subject-specific families`);
  assert.ok(subjectSpecificPages >= 9, `${testCase.subject} must route at least nine teaching pages to subject-specific families`);
  assert.ok(longestRun(families) <= 2, `${testCase.subject} must reject three-page repetitive compositions`);
  assert.ok(!qa.issues.some((issue) => /COMPOSITION/.test(issue.code)), `${testCase.subject} composition QA failed: ${JSON.stringify(qa.issues)}`);
  assert.equal(qa.errorCount, 0, `${testCase.subject} visual QA failed: ${JSON.stringify(qa.issues)}`);
  return { subject: testCase.subject, profile: testCase.profile, pages: scenes.length, uniqueFamilies: uniqueFamilies.size, subjectSpecificFamilies: subjectSpecificFamilies.size, subjectSpecificPages, longestCompositionRun: longestRun(families), qaStatus: qa.status };
});

assert.equal(new Set(reports.map((report) => report.profile)).size, cases.length);
assert.equal(new Set(reports.flatMap((report, index) => {
  const prefix = cases[index].prefix;
  return buildRenderScenesV2({ ...makeDeck(cases[index]), layouts: teacherLayoutProtocol }).map((scene) => scene.composition?.family || "").filter((family) => family.startsWith(prefix));
})).size, 18, "six subjects must expose eighteen distinct subject-specific composition families");

console.log(JSON.stringify({ pass: true, subjectCount: reports.length, totalPages: reports.reduce((sum, report) => sum + report.pages, 0), distinctSubjectSpecificFamilies: 18, reports }, null, 2));
