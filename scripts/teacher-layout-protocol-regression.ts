import assert from "node:assert/strict";
import type { DeckSpec, DesignSlide } from "../lib/canvas-data.ts";
import { buildRenderScenesV2 } from "../lib/visual-compiler/scene-builder-v2.ts";
import { teacherLayoutProtocol } from "../lib/visual-compiler/teacher-layout-protocol.ts";

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
console.log(JSON.stringify({ pass: true, protocolLayouts: teacherLayoutProtocol.length, pages: scenes.map((scene) => ({ page: scene.page, layoutId: scene.layoutId, elements: scene.elements.length, slots: scene.elements.map((element) => element.slotId) })) }, null, 2));
