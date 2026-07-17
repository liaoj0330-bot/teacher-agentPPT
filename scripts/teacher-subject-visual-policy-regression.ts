import assert from "node:assert/strict";
import type { DeckSpec, DesignSlide, SlideSpec } from "../lib/canvas-data.ts";
import { buildRenderScenesV2 } from "../lib/visual-compiler/scene-builder-v2.ts";
import { teacherLayoutProtocol } from "../lib/visual-compiler/teacher-layout-protocol.ts";
import { validateRenderScenesV2 } from "../lib/visual-compiler/qa-v2.ts";

const physicsPages = [
  "楞次定律",
  "今天我们怎样证明学会了",
  "磁铁靠近线圈时的实验观察",
  "先预测四种运动怎样偏转",
  "四种状态的实验记录",
  "从证据归纳楞次定律",
  "判断方向前先看磁通量变化",
  "示范：N极靠近时怎样判断方向",
  "变式：N极离开时哪里变了",
  "小组探究：解释四种状态",
  "30秒检测：先写变化再判方向",
  "基础、理解与迁移三层练习",
  "为什么总是相反是错的",
  "纠错后用右手螺旋定则校验",
  "楞次定律还能解释什么",
  "离堂任务与课后巩固"
];

const chinesePages = [
  "背影",
  "今天我们怎样读懂背影",
  "车站送别：故事发生了什么",
  "读准动作：哪些词让画面出现",
  "攀、缩、倾：动作词写出了什么",
  "月台、年龄与衣着让背影更具体",
  "为什么文章反复写背影",
  "精读示范：买橘子的背影",
  "把一句话读深：词句、画面、情感",
  "不同朗读为什么带来不同理解",
  "用一处动作细节证明父爱",
  "把具体细节写进自己的片段",
  "只说父爱伟大为什么不够",
  "让解释站得住：补词句也补画面",
  "背影为何难忘",
  "带着细节观察生活"
];

function makeDeck(subject: "物理" | "语文", titles: string[]) {
  const slides: DesignSlide[] = titles.map((title, index) => ({
    id: `${subject}-${index + 1}`,
    title,
    subtitle: index === 0 ? `${subject}45分钟课堂` : "课堂证据与学生任务",
    tone: "课堂",
    bullets: subject === "物理"
      ? ["条件：读取运动和磁场", "证据：记录磁通量变化", "结论：写出方向判断依据"]
      : ["词句：回到原文", "画面：还原动作与情境", "解释：用证据说明人物情感"]
  }));
  const slideSpecs: SlideSpec[] = slides.map((slide, index) => ({
    id: `spec-${slide.id}`,
    page: index + 1,
    slideId: slide.id,
    title: slide.title,
    finalTitle: slide.title,
    role: index === 0 ? "课程封面" : index === 1 ? "学习目标" : index === titles.length - 1 ? "作业布置" : "课堂学习",
    pagePurpose: slide.title,
    claim: slide.subtitle || "",
    mustProve: slide.subtitle || "",
    evidenceNeeds: [],
    evidenceSourceIds: [],
    selectedLayout: index === 0 ? "tm01_teacher_math_cover" : index === 1 ? "tm02_learning_objectives" : index === titles.length - 1 ? "tm13_assignment_extension" : "tm04_concept_definition",
    layoutIntent: "evidence",
    layoutReason: "学科课堂场景",
    visualIntent: `${subject}专属场景`,
    density: "balanced",
    mustHave: [],
    avoid: [],
    scoreRules: [],
    visibleBlocks: (slide.bullets || []).map((body, blockIndex) => ({ type: "point", title: ["任务", "证据", "解释"][blockIndex], body, priority: "must" as const }))
  }));
  const deckSpec: DeckSpec = {
    id: `deck-${subject}`,
    version: "1",
    pptType: "courseware",
    pptTypeLabel: `${subject}教师课件`,
    audience: "中学生",
    goal: `${subject}课堂学习`,
    coreMessage: subject === "物理" ? "用实验与判断链理解楞次定律" : "用文本证据细读背影",
    expectedDecision: "完成课堂任务",
    recommendedSlideCount: slides.length,
    requiredPages: [],
    forbiddenContent: [],
    evidenceNeeds: [],
    styleProfile: subject === "物理" ? "teaching_grid" : "teaching_editorial",
    qualityBar: 82,
    slideSpecs,
    createdAt: new Date(0).toISOString()
  };
  return { deckSpec, slides };
}

function assertSubjectDeck(subject: "物理" | "语文", titles: string[], familyPrefix: string) {
  const input = makeDeck(subject, titles);
  const scenes = buildRenderScenesV2({ ...input, layouts: teacherLayoutProtocol });
  const families = scenes.map((scene) => scene.composition?.family || scene.layoutId);
  const qa = validateRenderScenesV2(scenes, teacherLayoutProtocol);
  assert.equal(scenes.length, 16);
  assert.ok(families.some((family) => family.startsWith(familyPrefix)), `${subject} must use subject-specific compositions`);
  assert.ok(new Set(families).size >= 6, `${subject} must use at least six composition families`);
  assert.ok(!qa.issues.some((issue) => issue.code === "REPETITIVE_COMPOSITION"), `${subject} must avoid three-page composition repeats`);
  assert.ok(!qa.issues.some((issue) => issue.code === "INSUFFICIENT_COMPOSITION_VARIETY"), `${subject} must pass deck variety gate`);
  assert.equal(qa.errorCount, 0, JSON.stringify(qa.issues));
  return { subject, families, qaStatus: qa.status };
}

const reports = [
  assertSubjectDeck("物理", physicsPages, "physics-"),
  assertSubjectDeck("语文", chinesePages, "chinese-")
];

const base = makeDeck("物理", physicsPages);
const repetitive = buildRenderScenesV2({ ...base, layouts: teacherLayoutProtocol }).slice(0, 8).map((scene) => ({
  ...scene,
  composition: scene.composition ? { ...scene.composition, family: "concept-editorial", recipeId: "forced-repeat" } : scene.composition
}));
const repetitiveQA = validateRenderScenesV2(repetitive, teacherLayoutProtocol);
assert.ok(repetitiveQA.issues.some((issue) => issue.code === "REPETITIVE_COMPOSITION" && issue.severity === "error"));
assert.ok(repetitiveQA.issues.some((issue) => issue.code === "INSUFFICIENT_COMPOSITION_VARIETY"));

console.log(JSON.stringify({ pass: true, reports, repetitiveGate: repetitiveQA.issues.filter((issue) => /COMPOSITION/.test(issue.code)).map((issue) => ({ code: issue.code, severity: issue.severity })) }, null, 2));
