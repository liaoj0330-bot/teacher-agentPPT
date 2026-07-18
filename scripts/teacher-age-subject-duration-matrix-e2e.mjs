import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const base = process.env.BASE_URL || "http://127.0.0.1:3026";
const outputDir = path.resolve(process.env.OUTPUT_DIR || "artifacts/teacher-age-subject-duration-matrix");
const requestedIds = new Set(String(process.env.CASE_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));

const allCases = [
  {
    id: "kindergarten-math-30",
    schoolStage: "幼儿园", grade: "小班", subject: "数学", durationMinutes: 30,
    topic: "数字1-10与数量对应", textbook: "幼儿园小班数学活动材料", publisher: "园本课程", volume: "小班上",
    chapter: "数与量", unit: "主题活动一", lesson: "数字1-10", pageStart: 1, pageEnd: 8,
    sourceText: "通过点数积木、数字卡片配对和生活物品分类，让幼儿建立数字1-10与实际数量的一一对应。活动包含教师示范、同伴操作、个别检查和口头表达。",
    requirements: "使用实物操作和口头表达，包含示范、配对游戏、个别检查与即时反馈。",
  },
  {
    id: "primary-chinese-40",
    schoolStage: "小学", grade: "三年级", subject: "语文", durationMinutes: 40,
    topic: "富饶的西沙群岛", textbook: "人教版三年级语文上册", publisher: "人民教育出版社", volume: "上册",
    chapter: "第六单元", unit: "第六单元", lesson: "富饶的西沙群岛", pageStart: 75, pageEnd: 79,
    sourceText: "课文围绕西沙群岛风景优美、物产丰富展开，按照海水、海底、海岛等空间顺序描写。学习重点是找出关键语句，理解段落如何围绕一个意思写清楚。",
    requirements: "完成朗读、关键词圈画、段落结构梳理、证据回扣和仿写迁移。",
  },
  {
    id: "primary-english-25",
    schoolStage: "小学", grade: "四年级", subject: "英语", durationMinutes: 25,
    topic: "My school day", textbook: "人教PEP版四年级英语下册", publisher: "人民教育出版社", volume: "下册",
    chapter: "Unit 2 What time is it?", unit: "Unit 2", lesson: "Part A Let's talk", pageStart: 14, pageEnd: 17,
    sourceText: "Students listen for clock times and school activities, practise What time is it? and It is time for..., then complete a short pair dialogue with a timetable.",
    requirements: "以听说为主，包含听力抓取、句型操练、同伴对话和出口任务。",
  },
  {
    id: "junior-history-45",
    schoolStage: "初中", grade: "八年级", subject: "历史", durationMinutes: 45,
    topic: "鸦片战争", textbook: "人教版八年级历史上册", publisher: "人民教育出版社", volume: "上册",
    chapter: "第一单元 中国开始沦为半殖民地半封建社会", unit: "第一单元", lesson: "第1课 鸦片战争", pageStart: 2, pageEnd: 8,
    sourceText: "学习鸦片战争需要结合贸易、禁烟、战争和条约材料组织时间线，区分史料事实与解释性结论，并从原因、过程、结果和影响建立因果链。",
    requirements: "使用时间线与史料证据，完成原因分析、条约解读、影响判断和课堂论证。",
  },
  {
    id: "junior-geography-60",
    schoolStage: "初中", grade: "八年级", subject: "地理", durationMinutes: 60,
    topic: "中国的气候", textbook: "人教版八年级地理上册", publisher: "人民教育出版社", volume: "上册",
    chapter: "第二章 中国的自然环境", unit: "第二章", lesson: "第二节 气候", pageStart: 30, pageEnd: 41,
    sourceText: "中国气候具有季风气候显著、气候类型复杂多样和大陆性特征明显等特点。需要读等温线、等降水量线和季风示意图，解释空间分布及对生产生活的影响。",
    requirements: "包含地图判读、数据比较、规律归纳、成因解释、生活案例和迁移练习。",
  },
  {
    id: "senior-physics-45",
    schoolStage: "高中", grade: "高二", subject: "物理", durationMinutes: 45,
    topic: "楞次定律", textbook: "人教版高中物理选择性必修第二册", publisher: "人民教育出版社", volume: "选择性必修第二册",
    chapter: "第二章 电磁感应", unit: "第二章", lesson: "楞次定律", pageStart: 20, pageEnd: 29,
    sourceText: "楞次定律用于判断感应电流的方向：感应电流的磁场总要阻碍引起感应电流的磁通量变化。教学需从实验现象出发，区分原磁场方向、磁通量变化和感应磁场方向，再用右手螺旋定则确定电流方向。",
    requirements: "包含实验观察、变量辨析、方向判断、典型纠错、独立练习和迁移任务。",
  },
  {
    id: "senior-chemistry-90",
    schoolStage: "高中", grade: "高一", subject: "化学", durationMinutes: 90,
    topic: "离子反应与离子方程式", textbook: "人教版高中化学必修第一册", publisher: "人民教育出版社", volume: "必修第一册",
    chapter: "第一章 物质及其变化", unit: "第一章", lesson: "第二节 离子反应", pageStart: 14, pageEnd: 20,
    sourceText: "电解质在水溶液中发生电离。离子反应可以用离子方程式表示，书写时需遵循写、拆、删、查步骤，并检查原子守恒和电荷守恒。实验现象与微观离子变化需要相互验证。",
    requirements: "按两课时组织，包含实验证据、电离概念、方程式步骤、易错辨析、分层训练和综合迁移。",
  },
  {
    id: "senior-biology-60",
    schoolStage: "高中", grade: "高一", subject: "生物", durationMinutes: 60,
    topic: "细胞膜的结构和功能", textbook: "人教版高中生物学必修1", publisher: "人民教育出版社", volume: "必修1",
    chapter: "第4章 细胞的物质输入和输出", unit: "第4章", lesson: "第1节 被动运输", pageStart: 62, pageEnd: 67,
    sourceText: "细胞膜主要由脂质和蛋白质组成，具有流动镶嵌结构。被动运输包括自由扩散和协助扩散，物质顺浓度梯度运输且不消耗细胞能量。模型、曲线和生活实例可用于比较运输方式。",
    requirements: "包含结构模型观察、概念比较、曲线判读、证据解释、生活实例和分层检测。",
  },
];

const cases = requestedIds.size ? allCases.filter((item) => requestedIds.has(item.id)) : allCases;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function pageBand(pageCount) {
  if (pageCount <= 9) return "short";
  if (pageCount <= 17) return "medium";
  return "long";
}

function sourceAsset(testCase) {
  const assetId = `matrix-textbook-${testCase.id}`;
  return {
    id: assetId,
    assetId,
    sha256: sha256(testCase.sourceText),
    name: `${testCase.textbook}-textbook.txt`,
    mimeType: "text/plain",
    storageStatus: "persisted",
    text: testCase.sourceText,
    analysis: {
      parseStatus: "parsed",
      blockCount: 4,
      pageCount: Math.max(1, testCase.pageEnd - testCase.pageStart + 1),
      summary: `${testCase.textbook} ${testCase.publisher} ${testCase.volume} ${testCase.chapter} ${testCase.sourceText}`,
      metadata: {
        title: testCase.textbook,
        publisher: testCase.publisher,
        volume: testCase.volume,
      },
      blocks: [{ page: testCase.pageStart, type: "paragraph", text: testCase.sourceText }],
      warnings: ["matrix_fixture_only_not_external_textbook_truth"],
    },
  };
}

function taskFor(testCase) {
  const asset = sourceAsset(testCase);
  return {
    task: {
      scenario: "teacher_courseware",
      planningMode: "professional",
      generationMode: "chapter_prep",
      schoolStage: testCase.schoolStage,
      grade: testCase.grade,
      subject: testCase.subject,
      topic: testCase.topic,
      duration: `${testCase.durationMinutes}分钟`,
      textbook: testCase.textbook,
      chapter: testCase.chapter,
      teachingRequirements: testCase.requirements,
      textbookIdentity: {
        displayName: testCase.textbook,
        publisher: testCase.publisher,
        volume: testCase.volume,
        sourceAssetId: asset.assetId,
        verificationStatus: "asset_verified",
      },
      chapterIdentity: {
        unit: testCase.unit,
        chapter: testCase.chapter,
        lesson: testCase.lesson,
        pageStart: testCase.pageStart,
        pageEnd: testCase.pageEnd,
        verificationStatus: "asset_verified",
      },
      learnerProfile: {
        baseline: `${testCase.grade}常态班，按本学段基础设计`,
        commonDifficulties: testCase.requirements,
        classSize: testCase.schoolStage === "幼儿园" ? 24 : 42,
        differentiationNeeds: "提供基础任务和迁移任务",
      },
      classroomConstraints: {
        equipment: "普通多媒体教室",
        grouping: "同桌或四人小组",
        assessmentFocus: "balanced",
      },
      sourcePolicy: "uploaded_only",
      uploadedFiles: [asset],
      pastedMaterials: testCase.sourceText,
      teacherStyle: {
        visualMode: ["语文", "历史"].includes(testCase.subject) ? "teaching_editorial" : "teaching_grid",
        theme: "book_blue",
      },
    },
    asset,
  };
}

async function runCase(testCase) {
  const startedAt = Date.now();
  const trace = [];
  const evidence = {};
  let stage = "register";
  const { task, asset } = taskFor(testCase);
  let cookie = "";

  async function call(method, url, body, options = {}) {
    const callStarted = Date.now();
    const response = await fetch(`${base}${url}`, {
      method,
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const contentType = response.headers.get("content-type") || "";
    const entry = { stage, method, url, status: response.status, durationMs: Date.now() - callStarted, contentType };
    trace.push(entry);
    if (options.binary) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) throw new Error(`${stage}: ${method} ${url} HTTP ${response.status}: ${bytes.toString("utf8").slice(0, 2000)}`);
      return { response, bytes };
    }
    const raw = await response.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); }
      catch (error) { throw new Error(`${stage}: ${method} ${url} returned invalid JSON (${response.status}): ${raw.slice(0, 2000)}; ${error}`); }
    }
    if (!response.ok || !data) throw new Error(`${stage}: ${method} ${url} HTTP ${response.status}: ${raw.slice(0, 12000) || "<empty body>"}`);
    return { response, data };
  }

  async function patchPlan(plan, action) {
    return (await call("PATCH", "/api/teacher-courseware-plan/state", {
      projectId: plan.projectId,
      requestId: plan.requestId,
      expectedRevision: plan.revision,
      action,
    })).data.plan;
  }

  try {
    const registered = await call("POST", "/api/auth/register", {
      name: `矩阵验收-${testCase.id}`,
      email: `matrix-${testCase.id}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}@example.com`,
      password: "Teacher123!",
    });
    cookie = registered.response.headers.get("set-cookie")?.split(";")[0] || "";
    assert.ok(cookie, "register did not return a session cookie");

    stage = "plan";
    const planned = await call("POST", "/api/teacher-courseware-plan", { teacherTask: task });
    const deckPlan = planned.data.deckPlan;
    const materialPackage = planned.data.materialPackage;
    assert.ok(deckPlan?.pages?.length, "plan returned no pages");
    assert.equal(deckPlan.pageCount, deckPlan.pages.length, "plan pageCount/pages mismatch");
    assert.equal(materialPackage?.textbookMatch?.status, "asset_verified", `unexpected textbook match: ${JSON.stringify(materialPackage?.textbookMatch)}`);
    assert.equal(materialPackage?.readiness?.canPlan, true, "material package cannot plan");
    assert.equal(materialPackage?.readiness?.blockingIssues?.length || 0, 0, "material package has blockers");
    evidence.plannedPages = deckPlan.pages.length;
    evidence.pageBand = pageBand(deckPlan.pages.length);
    evidence.textbookMatch = materialPackage.textbookMatch;
    evidence.materialReadiness = materialPackage.readiness;

    stage = "persist-plan";
    let state = (await call("POST", "/api/teacher-courseware-plan/state", {
      teacherTask: { ...task, materialPackage },
      planId: deckPlan.planId,
      pages: deckPlan.pages,
      lessonBlueprint: deckPlan.lessonBlueprint,
    })).data.plan;
    if (state.status === "reviewing") state = await patchPlan(state, { type: "confirm" });
    if (state.status === "confirmed") state = await patchPlan(state, { type: "start_compile" });
    assert.equal(state.status, "compiling", `expected compiling, received ${state.status}`);

    stage = "generate";
    const confirmedTask = {
      ...task,
      materialPackage,
      deckPlan: { ...state, status: "confirmed", confirmedAt: new Date().toISOString(), pageCount: state.pages.length },
    };
    const generated = (await call("POST", "/api/generate-ppt", {
      scenario: "teacher_courseware",
      planningMode: "professional",
      mode: "agent",
      forceLocal: true,
      disablePublicSearch: true,
      projectId: state.projectId,
      teacherTask: confirmedTask,
      teacherStyle: task.teacherStyle,
      prompt: `请为${testCase.schoolStage}${testCase.grade}${testCase.subject}课题“${testCase.topic}”生成${testCase.durationMinutes}分钟课堂课件。只使用上传资料，不调用图片生成。`,
      uploadedAssets: [asset],
    })).data;
    const slides = generated.project?.slides || [];
    assert.equal(slides.length, deckPlan.pages.length, "plan/generated slides mismatch");
    assert.equal(generated.project?.contentDrafts?.length, slides.length, "content draft/page mismatch");
    assert.equal(generated.project?.contentPlan?.deliveryPack?.teacherNotes?.length, slides.length, "teacher notes/page mismatch");
    assert.ok(generated.projectId && generated.versionId, "generation did not persist project/version identity");
    evidence.projectId = generated.projectId;
    evidence.generatedVersionId = generated.versionId;
    evidence.generatedPages = slides.length;
    evidence.lessonEventCount = generated.project?.contentPlan?.lessonBlueprint?.lessonPlan?.events?.length || 0;

    stage = "submit-review";
    const reviewed = (await call("POST", "/api/courseware-version", {
      projectId: generated.projectId,
      baseVersionId: generated.versionId,
      operation: "teacher_submit_for_review",
      idempotencyKey: `matrix-review-${testCase.id}-${generated.versionId}`,
      payload: {},
    })).data;
    evidence.versionId = reviewed.versionId;
    evidence.teacherReadiness = reviewed.teacherReadiness;
    evidence.engineeringStatus = reviewed.engineeringStatus;

    stage = "reopen";
    const reopened = (await call("GET", `/api/courseware-version?projectId=${encodeURIComponent(generated.projectId)}&versionId=${encodeURIComponent(reviewed.versionId)}`)).data;
    assert.equal(reopened.slides?.length, slides.length, "reopened page count mismatch");
    assert.equal(reopened.task?.textbookIdentity?.displayName, testCase.textbook, "reopened textbook identity mismatch");
    assert.equal(reopened.task?.chapterIdentity?.chapter, testCase.chapter, "reopened chapter identity mismatch");
    assert.equal(reopened.task?.materialPackage?.textbookMatch?.status, "asset_verified", "reopened textbook match was not retained");
    evidence.teacherScoreV3 = {
      decision: reopened.teacherScoreV3?.contract?.decision || null,
      total: reopened.teacherScoreV3?.scores?.total ?? null,
      p0: reopened.teacherScoreV3?.p0 || [],
      p1: reopened.teacherScoreV3?.p1 || [],
    };

    stage = "export";
    const exported = await call("POST", "/api/export-pptx", {
      projectId: generated.projectId,
      versionId: reviewed.versionId,
    }, { binary: true });
    const artifactId = exported.response.headers.get("x-artifact-id") || "";
    assert.ok(artifactId, "export did not return x-artifact-id");

    stage = "download";
    const downloaded = await call("GET", `/api/courseware-artifacts/${artifactId}/download`, undefined, { binary: true });
    assert.equal(sha256(downloaded.bytes), sha256(exported.bytes), "durable download hash mismatch");

    stage = "artifact-history";
    const artifacts = (await call("GET", `/api/courseware-artifacts?projectId=${encodeURIComponent(generated.projectId)}&versionId=${encodeURIComponent(reviewed.versionId)}`)).data.artifacts;
    assert.ok(artifacts.some((item) => item.artifactId === artifactId && item.status === "ready"), "ready artifact missing from history");

    const zip = await JSZip.loadAsync(downloaded.bytes);
    const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    assert.equal(slideFiles.length, slides.length, "pptx file page count mismatch");

    const outputPath = path.join(outputDir, `${testCase.id}.pptx`);
    fs.writeFileSync(outputPath, downloaded.bytes);
    return {
      id: testCase.id,
      pass: true,
      input: {
        schoolStage: testCase.schoolStage,
        grade: testCase.grade,
        subject: testCase.subject,
        durationMinutes: testCase.durationMinutes,
        topic: testCase.topic,
        textbook: testCase.textbook,
        chapter: testCase.chapter,
        sourcePolicy: task.sourcePolicy,
      },
      ...evidence,
      artifactId,
      outputPath,
      byteSize: downloaded.bytes.length,
      sha256: sha256(downloaded.bytes),
      totalDurationMs: Date.now() - startedAt,
      trace,
    };
  } catch (error) {
    return {
      id: testCase.id,
      pass: false,
      failedStage: stage,
      ...evidence,
      input: {
        schoolStage: testCase.schoolStage,
        grade: testCase.grade,
        subject: testCase.subject,
        durationMinutes: testCase.durationMinutes,
        topic: testCase.topic,
        textbook: testCase.textbook,
        chapter: testCase.chapter,
        sourcePolicy: task.sourcePolicy,
      },
      totalDurationMs: Date.now() - startedAt,
      trace,
      error: String(error?.stack || error),
    };
  }
}

fs.mkdirSync(outputDir, { recursive: true });
const report = {
  schema: "teacher-age-subject-duration-matrix-e2e/v1",
  startedAt: new Date().toISOString(),
  base,
  purpose: "Real registered teacher path across age, subject, duration, persisted version, export, durable download and reopen.",
  sourceDisclaimer: "Uploaded textbook excerpts are deterministic local fixtures. They validate matching, persistence and delivery wiring, not external textbook catalog truth.",
  imagePolicy: {
    imageApiAllowed: false,
    controls: ["forceLocal=true", "disablePublicSearch=true", "sourcePolicy=uploaded_only", "no image endpoint invoked by this test"],
    observedImageEndpointCalls: 0,
  },
  cases: [],
};

for (const testCase of cases) {
  const result = await runCase(testCase);
  report.cases.push(result);
  console.log(JSON.stringify({ id: result.id, pass: result.pass, failedStage: result.failedStage, pages: result.plannedPages, durationMs: result.totalDurationMs }));
}

const passed = report.cases.filter((item) => item.pass).length;
const failed = report.cases.length - passed;
const pageBands = [...new Set(report.cases.filter((item) => item.generatedPages).map((item) => item.pageBand))];
report.summary = {
  total: report.cases.length,
  passed,
  failed,
  ageStages: [...new Set(report.cases.map((item) => item.input.schoolStage))],
  subjects: [...new Set(report.cases.map((item) => item.input.subject))],
  durationsMinutes: [...new Set(report.cases.map((item) => item.input.durationMinutes))].sort((a, b) => a - b),
  pageBands,
  totalPages: report.cases.reduce((sum, item) => sum + (item.generatedPages || 0), 0),
  textbookMatchStatuses: Object.fromEntries(report.cases.map((item) => [item.id, item.textbookMatch?.status || "failed_before_match"])),
  failedStages: Object.fromEntries(report.cases.filter((item) => !item.pass).map((item) => [item.id, item.failedStage])),
};
report.pass = failed === 0 && report.cases.length === cases.length && new Set(report.summary.subjects).size >= Math.min(8, cases.length);
report.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary, null, 2));
if (!report.pass) process.exitCode = 1;
