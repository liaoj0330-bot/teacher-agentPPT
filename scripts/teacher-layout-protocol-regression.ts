import assert from "node:assert/strict";
import type { DeckSpec, DesignSlide } from "../lib/canvas-data.ts";
import { buildRenderScenesV2 } from "../lib/visual-compiler/scene-builder-v2.ts";
import { teacherLayoutProtocol } from "../lib/visual-compiler/teacher-layout-protocol.ts";
import { validateRenderScenesV2 } from "../lib/visual-compiler/qa-v2.ts";

const slides: DesignSlide[] = [
  { id: "concept", title: "函数的定义", subtitle: "从唯一对应关系理解概念", tone: "讲解", bullets: ["定义：每个 x 都有唯一 y", "关键条件：唯一对应", "判断：下面关系是否为函数"] },
  { id: "example", title: "例题：求一次函数解析式", subtitle: "从已知点建立方程", tone: "例题", bullets: ["题目：直线经过两个点", "设 y=kx+b", "代入坐标", "求解并回代"] },
  { id: "practice", title: "课堂练习", subtitle: "独立完成并说明理由", tone: "练习", bullets: ["完成题目", "写出关键步骤", "同伴互查", "根据反馈订正"] }
];
const layoutIds = ["tm04_concept_definition", "tm07_worked_example", "tm08_interaction_practice"];
const deckSpec: DeckSpec = { id: "teacher-protocol", version: "1", pptType: "courseware", pptTypeLabel: "教师课件", audience: "学生", goal: "课堂教学", coreMessage: "函数", expectedDecision: "掌握", recommendedSlideCount: 3, requiredPages: [], forbiddenContent: [], evidenceNeeds: [], styleProfile: "teaching_grid", qualityBar: 82, createdAt: new Date(0).toISOString(), slideSpecs: slides.map((slide, index) => ({ id: `spec-${index}`, page: index + 1, slideId: slide.id, title: slide.title, role: ["概念定义", "例题分步讲解", "课堂练习"][index], claim: slide.subtitle, mustProve: slide.subtitle, evidenceNeeds: [], evidenceSourceIds: [], selectedLayout: layoutIds[index], layoutIntent: slide.layout || "evidence", layoutReason: "教师页面角色", visualIntent: "教师课件", density: "balanced", mustHave: [], avoid: [], scoreRules: [] })) };
const scenes = buildRenderScenesV2({ deckSpec, slides, layouts: teacherLayoutProtocol });
assert.equal(teacherLayoutProtocol.length, 13);
assert.equal(scenes.length, 3);
assert.deepEqual(scenes.map((scene) => scene.layoutId), layoutIds);
assert.ok(scenes.every((scene) => scene.elements.length >= 4));
assert.notDeepEqual(scenes[0].elements.map((item) => item.slotId), scenes[1].elements.map((item) => item.slotId));

const noImageSlides: DesignSlide[] = [
  { id: "cover-native", title: "10以内的加减法", subtitle: "从真实数量关系理解加与减", tone: "课堂", bullets: ["观察、操作、表达"] },
  { id: "context-native", title: "生活中的数量变化", subtitle: "先观察两组物品发生了什么", tone: "课堂", bullets: ["说出原来有多少", "观察增加或拿走", "用自己的话解释结果"] }
];
const noImageDeck: DeckSpec = {
  ...deckSpec,
  id: "teacher-native-visual",
  recommendedSlideCount: noImageSlides.length,
  slideSpecs: noImageSlides.map((slide, index) => ({
    ...deckSpec.slideSpecs[0],
    id: `native-spec-${index}`,
    page: index + 1,
    slideId: slide.id,
    title: slide.title,
    role: index === 0 ? "课程封面" : "情境导入",
    pagePurpose: index === 0 ? "课程封面" : "情境导入",
    selectedLayout: index === 0 ? "tm01_teacher_math_cover" : "tm03_prior_knowledge_context",
    visibleBlocks: slide.bullets?.map((body, blockIndex) => ({ type: "point", title: `观察 ${blockIndex + 1}`, body, priority: "must" as const })) || []
  }))
};
const noImageScenes = buildRenderScenesV2({ deckSpec: noImageDeck, slides: noImageSlides, layouts: teacherLayoutProtocol });
assert.equal(noImageScenes.some((scene) => scene.elements.some((element) => element.kind === "image")), false);
assert.ok(noImageScenes.every((scene) => scene.elements.some((element) => element.elementId.includes("native-visual"))), "image slots need editable native visual fallbacks");
assert.ok(noImageScenes.every((scene) => scene.elements.some((element) => element.elementId.includes("content-band"))), "text regions need visible composition containers");
const noImageQA = validateRenderScenesV2(noImageScenes, teacherLayoutProtocol);
assert.equal(noImageQA.errorCount, 0, JSON.stringify(noImageQA.issues));

console.log(JSON.stringify({ pass: true, protocolLayouts: teacherLayoutProtocol.length, pages: scenes.map((scene) => ({ page: scene.page, layoutId: scene.layoutId, elements: scene.elements.length, slots: scene.elements.map((element) => element.slotId) })), noImage: { scenes: noImageScenes.map((scene) => ({ page: scene.page, family: scene.composition?.family, nativeVisualObjects: scene.elements.filter((element) => element.elementId.includes("native-visual")).length })), qa: noImageQA } }, null, 2));
