import assert from "node:assert/strict";

const base = process.env.BASE_URL || "http://127.0.0.1:3026";

async function requestPlan(testCase) {
  const response = await fetch(`${base}/api/teacher-courseware-plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ teacherTask: {
      scenario: "teacher_courseware",
      planningMode: "professional",
      generationMode: "lesson_plan",
      duration: testCase.duration,
      uploadedFiles: [],
      pastedMaterials: "",
      teacherStyle: { visualMode: "teaching_grid", theme: "book_blue" },
      ...testCase,
    } }),
  });
  const data = await response.json();
  assert.equal(response.status, 200, `${testCase.id}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

const cases = [
  { id: "kindergarten-math", schoolStage: "幼儿园", grade: "小班", subject: "数学", topic: "数字1-10", duration: "30分钟", textbook: "", chapter: "", pastedMaterials: "活动材料由教师现场提供。" },
  { id: "primary-chinese", schoolStage: "小学", grade: "三年级", subject: "语文", topic: "秋天的雨", duration: "40分钟", textbook: "统编版三年级语文上册", chapter: "第三单元", pastedMaterials: "教师提供的课文节选和课堂要求。" },
  { id: "high-physics", schoolStage: "高中", grade: "高二", subject: "物理", topic: "楞次定律", duration: "45分钟", textbook: "人教版高中物理选择性必修第二册", chapter: "第二章", pastedMaterials: "教师提供的教材节选和课堂要求。" },
];

const results = [];
for (const testCase of cases) {
  const data = await requestPlan(testCase);
  const blueprint = data.contentPlan?.lessonBlueprint;
  const pages = data.deckPlan?.pages || [];
  assert.ok(blueprint, `${testCase.id}: missing blueprint`);
  assert.ok(pages.length >= 7, `${testCase.id}: page plan too thin`);
  const text = JSON.stringify({ blueprint, pages });
  if (testCase.schoolStage === "幼儿园") {
    assert.equal(blueprint.architecture, "play_based_discovery");
    assert.match(text, /摆一摆|找一找|游戏|幼儿/);
    assert.doesNotMatch(text, /适用条件|迁移任务|解析式|数式图表/);
  }
  if (testCase.schoolStage === "高中") assert.equal(blueprint.architecture, "experiment_inquiry");
  results.push({ id: testCase.id, architecture: blueprint.architecture, pageCount: pages.length, lessonEvents: blueprint.lessonPlan?.events.length });
}

console.log(JSON.stringify({ pass: true, base, cases: results }, null, 2));
