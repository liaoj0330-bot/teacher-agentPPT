import assert from "node:assert/strict";
import { deriveLessonPresentationStrategy } from "../lib/ppt-agent/lesson-presentation-strategy.ts";

const physicsRequirements = "包含实验观察、方向判断、纠错和迁移练习。";
const chineseRequirements = "围绕关键段落细读，完成朗读、批注、证据回扣和表达迁移。";

const plain45 = deriveLessonPresentationStrategy({ duration: "45分钟", subject: "历史", teachingRequirements: "讲清核心知识。", generationMode: "chapter_prep" });
const physics45 = deriveLessonPresentationStrategy({ duration: "45分钟", subject: "物理", teachingRequirements: physicsRequirements, generationMode: "chapter_prep" });
const chinese45 = deriveLessonPresentationStrategy({ duration: "45分钟", subject: "语文", teachingRequirements: chineseRequirements, generationMode: "chapter_prep" });
const physics25 = deriveLessonPresentationStrategy({ duration: "25分钟", subject: "物理", teachingRequirements: physicsRequirements, generationMode: "chapter_prep" });
const physics60 = deriveLessonPresentationStrategy({ duration: "60分钟", subject: "物理", teachingRequirements: physicsRequirements, generationMode: "chapter_prep" });
const physics90 = deriveLessonPresentationStrategy({ duration: "90分钟", subject: "物理", teachingRequirements: physicsRequirements, generationMode: "chapter_prep" });

assert.equal(plain45.recommendedPageCount, 14, "plain 45-minute lessons should not inherit a fixed nine-page deck");
assert.equal(physics45.recommendedPageCount, 16, "experiment, correction and transfer should expand the 45-minute physics deck");
assert.equal(chinese45.recommendedPageCount, 16, "close reading and expression transfer should expand the 45-minute Chinese deck");
assert.equal(physics25.recommendedPageCount, 7);
assert.equal(physics60.recommendedPageCount, 18);
assert.equal(physics90.recommendedPageCount, 22);
assert.ok(physics45.minimumPageCount > 9, "a nine-page 45-minute deck must fail the delivery planning gate");
assert.ok(physics45.drivers.length >= 3, "the strategy must explain why pages were added");
assert.notEqual(plain45.recommendedPageCount, physics45.recommendedPageCount, "page count must respond to lesson complexity, not duration alone");

console.log(JSON.stringify({
  pass: true,
  cases: { plain45, physics45, chinese45, physics25, physics60, physics90 },
}, null, 2));
