import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const baseUrl = process.env.P1H_BASE_URL || process.env.APP_BASE_URL || "http://127.0.0.1:3002";
const stageArg = process.argv.find((arg) => arg.startsWith("--stage="));
const stage = (stageArg?.split("=")[1] || "p1h").toLowerCase();
const stageDirName = stage === "p1i" || stage === "p1-i" ? "p1-i" : "p1-h";
const stageLabel = stageDirName === "p1-i" ? "P1-I" : "P1-H";
const summaryFileName = stageDirName === "p1-i" ? "p1i-summary.md" : "p1h-summary.md";
const p1hRoot = path.join(repoRoot, "test-results", stageDirName);
const dirs = {
  generationReports: path.join(p1hRoot, "generation-reports"),
  exportedPptx: path.join(p1hRoot, "exported-pptx"),
  renderedPdf: path.join(p1hRoot, "rendered-pdf"),
  renderedPages: path.join(p1hRoot, "rendered-pages"),
  deckMetadata: path.join(p1hRoot, "deck-metadata"),
  sourceMaterials: path.join(p1hRoot, "source-materials")
};

const samples = [
  {
    id: "product_intro",
    expectedPlanType: "product_intro",
    prompt: "帮我做一份智能客服 SaaS 产品介绍 PPT，面向企业客户和技术负责人。要求讲清楚产品定位、目标用户、客户痛点、核心能力、使用路径、部署方式、价值证明、试用建议和下一步行动。不要只罗列功能，要让客户能判断是否值得试用或采购。",
    sourceMaterial: [
      "智能客服 SaaS 产品资料",
      "产品定位：面向中大型企业的客户服务团队，提供多渠道接入、知识库问答、人工协同、工单流转和运营分析能力。",
      "目标用户：客服负责人、技术负责人、数字化运营团队和采购评估小组。",
      "客户痛点：咨询入口分散，知识库维护成本高，人工坐席重复回答比例高，服务质量难追踪，系统接入周期不确定。",
      "核心能力：统一接入网页、App、企业微信和电话转写渠道；基于企业知识库回答常见问题；低置信度问题转人工；会话自动生成工单；质检看板追踪响应时长、解决率和满意度。",
      "使用路径：先接入一个高频咨询场景，导入 FAQ 和流程文档，配置转人工规则，试运行两周后根据低命中问题补充知识库。",
      "部署方式：支持公有云试用、私有化部署和混合部署；通过 API 对接 CRM、工单系统和统一身份认证。",
      "价值证明：试点阶段建议观察首响时间、人工转接率、知识命中率、工单闭环率和客户满意度；不要在未试点前承诺固定降本比例。",
      "试用建议：选择售后咨询或内部 IT 支持作为低风险试点，周期 4 到 6 周，验收标准包括场景覆盖、权限边界、数据留痕和运营报表。",
      "下一步行动：确认试点业务线、准备知识库资料、安排技术对接、定义验收指标和采购评估口径。"
    ].join("\n")
  },
  {
    id: "project_report",
    expectedPlanType: "project_report",
    prompt: "帮我做一份企业内部数字化项目阶段汇报 PPT，面向管理层。要求讲清楚项目背景、建设目标、当前进展、关键成果、问题风险、下一阶段计划、资源需求和验收标准。不要做成空泛宣传稿，要像真实管理层汇报材料。",
    sourceMaterial: [
      "企业内部数字化项目阶段资料",
      "项目背景：公司正在把销售、交付、财务和客户服务流程从分散表格迁移到统一流程平台，目标是减少手工录入和跨部门信息断点。",
      "建设目标：统一客户主数据，打通合同、交付、开票和回款状态，形成管理层可追踪的项目经营看板。",
      "当前进展：需求调研已覆盖销售、交付、财务三个部门；客户主数据字段已经完成第一轮梳理；流程平台完成合同台账和交付里程碑模块试运行。",
      "关键成果：重复录入字段从 42 项压缩到 18 项；合同状态和交付状态已经可以按项目编号关联；试点团队每周例会开始使用统一看板。",
      "问题风险：历史数据质量不一致，部门口径存在差异，部分审批节点仍依赖线下确认，财务系统接口排期存在不确定性。",
      "下一阶段计划：完成历史数据清洗，扩大试点到两个业务单元，补齐财务接口，建立问题闭环机制和月度复盘节奏。",
      "资源需求：需要业务负责人确认字段口径，需要 IT 支持接口联调，需要财务提供回款状态字段和验收规则。",
      "验收标准：项目主数据完整率、合同状态同步准确率、交付里程碑更新及时率、跨部门问题关闭周期和管理看板使用频率。",
      "管理层决策事项：确认试点扩大范围、批准接口联调资源、明确跨部门口径仲裁人。"
    ].join("\n")
  },
  {
    id: "sales_proposal",
    expectedPlanType: "proposal",
    prompt: "帮我做一份企业 AI 培训服务合作方案 PPT，面向客户决策人和人力资源负责人。要求讲清楚客户问题、培训目标、服务内容、实施周期、交付成果、价值证明、风险控制、报价逻辑和下一步合作动作。不要只做公司介绍。",
    sourceMaterial: [
      "企业 AI 培训服务合作方案资料",
      "客户问题：员工对 AI 工具兴趣高但使用不稳定，部门之间经验分散，缺少可复用任务模板，管理层难判断培训是否转化为业务效率。",
      "培训目标：让零散试用变成可复制的岗位实践，帮助管理者建立工具使用边界、成果验收口径和内部推广路径。",
      "服务内容：前期访谈与岗位场景梳理，基础认知课程，岗位任务工作坊，提示词模板共创，内部案例复盘，管理员手册和持续答疑。",
      "实施周期：建议 6 周完成一期项目；第 1 周调研，第 2 周通识培训，第 3 到 4 周分岗位工作坊，第 5 周案例沉淀，第 6 周复盘与推广建议。",
      "交付成果：课程课件、岗位任务清单、提示词模板库、优秀案例样张、学员练习记录、复盘报告和下一阶段推广建议。",
      "价值证明：通过课前课后任务完成质量、模板复用次数、部门试点案例数量和学员满意度观察效果；不承诺未经验证的固定效率提升。",
      "风险控制：避免上传敏感数据，明确 AI 输出复核责任，区分可自动化任务和必须人工判断任务，建立内部合规提示。",
      "报价逻辑：报价由调研深度、课程场次、工作坊数量、模板共创范围、答疑周期和复盘报告复杂度决定。",
      "下一步合作动作：确认试点部门、确定学员规模、收集典型任务、确定培训时间表和验收指标。"
    ].join("\n")
  },
  {
    id: "courseware",
    expectedPlanType: "courseware",
    prompt: "帮我做一份 AI 办公效率入门课程课件，面向零基础职场人员。要求讲清楚学习目标、知识框架、典型场景、操作步骤、案例演示、课堂练习、课后任务和总结复盘。不要只堆概念，要让学员能照着练。",
    sourceMaterial: [
      "AI 办公效率入门课程资料",
      "学习目标：理解 AI 工具适合处理哪些办公任务，掌握清晰提问、资料整理、初稿生成和结果复核的基本方法。",
      "知识框架：任务定义、上下文资料、输出格式、约束条件、检查标准和迭代追问六个环节构成一次完整的 AI 协作。",
      "典型场景：会议纪要整理、邮件初稿、报告大纲、表格说明、竞品资料摘要、活动方案初稿和个人学习计划。",
      "操作步骤：先说明角色和目标，再提供背景资料，然后指定输出格式，补充限制条件，最后检查事实、语气、结构和可执行性。",
      "案例演示：把一段会议记录整理成待办清单；把零散需求改成项目周报；把产品说明改写成客户邮件。",
      "课堂练习：每位学员选择一个真实办公任务，写出初版提示词，交换检查是否包含目标、资料、格式、限制和验收标准。",
      "课后任务：用同一个任务连续迭代三次，记录每次补充了什么信息，以及输出质量有什么变化。",
      "复盘方法：检查 AI 是否编造事实，是否遗漏关键限制，是否能被同事直接使用，是否需要人工审批或专业判断。",
      "边界提醒：不要上传敏感数据，不要把 AI 输出直接当最终结论，不要用含糊口令替代明确任务。"
    ].join("\n")
  }
];

const bannedVisiblePatterns = [
  /高校\s*AIGC/i,
  /产教融合/,
  /北京五日游/,
  /Dify/i,
  /generated visual/i,
  /\bmock\b/i,
  /\bdebug\b/i,
  /\bpagePlanId\b/i,
  /\blayoutPlanId\b/i,
  /\bevidenceBlockId\b/i,
  /\bsourceId\b/i,
  /[\uFFFD]/,
  /鑴|欒|剹|鑺|顑|鈧|枂|鐎|閼|懞|妵|閳|楂樻牎|浜ф暀|鍖椾含/
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(800);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function startServer() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["run", "start"], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, PORT: "3002" }
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(String(chunk)));
  child.stderr.on("data", (chunk) => logs.push(String(chunk)));
  return { child, logs };
}

async function stopServer(server) {
  if (!server?.child || server.child.killed) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(server.child.pid), "/t", "/f"], { windowsHide: true });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    return;
  }
  server.child.kill("SIGTERM");
}

async function waitForHome(timeoutMs = 60000) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/`, { cache: "no-store" });
      const html = await response.text();
      if (response.status === 200 && /__next|PPT|AI/i.test(html)) {
        return { ok: true, status: response.status };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return { ok: false, status: 0, error: lastError || "timeout" };
}

async function ensureServer() {
  const port = Number(new URL(baseUrl).port || 80);
  const alreadyOpen = await isPortOpen(port);
  const server = alreadyOpen ? null : startServer();
  const home = await waitForHome();
  if (!home.ok) {
    if (server) await stopServer(server);
    throw new Error(`P1-H could not reach app server at ${baseUrl}: ${home.error || "unknown error"}`);
  }
  return { server, startedByScript: Boolean(server), portAlreadyInUse: alreadyOpen };
}

async function postJson(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: response.ok, status: response.status, text, json };
}

async function uploadTextFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "text/plain;charset=utf-8" }), path.basename(filePath));
  const response = await fetch(`${baseUrl}/api/upload-ppt`, {
    method: "POST",
    body: form
  });
  const text = await response.text();
  const json = JSON.parse(text);
  if (!response.ok) throw new Error(`upload failed ${response.status}: ${text}`);
  return json;
}

async function exportPptx(project, id) {
  const response = await fetch(`${baseUrl}/api/export-pptx`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ project })
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    let gate = null;
    try {
      gate = JSON.parse(buffer.toString("utf8"));
    } catch {
      gate = { message: buffer.toString("utf8") };
    }
    return { ok: false, status: response.status, buffer, gate, output: "" };
  }
  const output = path.join(dirs.exportedPptx, `${id}.pptx`);
  fs.writeFileSync(output, buffer);
  return { ok: true, status: response.status, buffer, gate: { ok: true, status: "passed" }, output };
}

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/")}`;
}

async function inspectPptx(filePath) {
  const pptxgenPath = require.resolve("pptxgenjs");
  const nodeModulesDir = pptxgenPath.slice(0, pptxgenPath.lastIndexOf(`${path.sep}pptxgenjs${path.sep}`));
  const jszip = await import(pathToFileUrl(path.join(nodeModulesDir, "jszip", "lib", "index.js")));
  const zip = await jszip.default.loadAsync(fs.readFileSync(filePath));
  const slideXmlFiles = Object.keys(zip.files)
    .filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const textParts = [];
  for (const xmlFile of slideXmlFiles) {
    const xml = await zip.files[xmlFile].async("string");
    textParts.push(xml.replace(/<[^>]+>/g, " "));
  }
  const visibleText = textParts.join("\n");
  const violations = bannedVisiblePatterns
    .map((pattern) => pattern.exec(visibleText)?.[0] || "")
    .filter(Boolean);
  return {
    slideCount: slideXmlFiles.length,
    slideXmlFiles,
    visibleTextLength: visibleText.length,
    bannedVisibleMatches: [...new Set(violations)]
  };
}

function summarizeGenerated(sample, generated, project, exported, inspection) {
  const contentPlan = project.contentPlan || generated.contentPlan || {};
  const pagePlans = project.slidePagePlans || generated.pagePlans || [];
  const layoutPlans = project.layoutPlans || generated.layoutPlans || [];
  const evidenceReport = project.evidenceReport || generated.evidenceReport || {};
  const contentDrafts = project.contentDrafts || generated.contentDrafts || [];
  const deckContentQualityReport = project.deckContentQualityReport || generated.deckContentQualityReport || null;
  const review = project.reviewCenter?.postReview || {};
  const selectedLayouts = [...new Set(layoutPlans.map((plan) => plan.selectedLayout).filter(Boolean))];
  const layoutFamilies = [...new Set(layoutPlans.map((plan) => plan.layoutFamily).filter(Boolean))];
  const unsupportedClaims = [
    ...(Array.isArray(evidenceReport.unsupportedClaims) ? evidenceReport.unsupportedClaims.flatMap((item) => item.claims || item) : []),
    ...(project.slideEvidenceMaps || []).flatMap((item) => item.unsupportedClaims || [])
  ].filter(Boolean);
  const lowConfidenceWarnings = [
    ...(Array.isArray(evidenceReport.warnings) ? evidenceReport.warnings : []),
    ...(project.slideEvidenceMaps || []).flatMap((item) => item.lowConfidenceWarnings || [])
  ].filter(Boolean);

  return {
    id: sample.id,
    prompt: sample.prompt,
    pptType: contentPlan.pptType || sample.expectedPlanType,
    reviewType: project.reviewCenter?.pptType || "",
    slideCount: inspection.slideCount,
    projectSlideCount: project.slides?.length || 0,
    contentPlan: {
      present: Boolean(contentPlan.planId || contentPlan.pptType),
      pptType: contentPlan.pptType || "",
      audience: contentPlan.audience || "",
      decisionGoal: contentPlan.decisionGoal || "",
      coreMessage: contentPlan.coreMessage || "",
      slidePlanCount: contentPlan.slidePlan?.length || 0
    },
    slidePagePlans: {
      present: pagePlans.length > 0,
      count: pagePlans.length,
      roles: pagePlans.map((plan) => plan.role).filter(Boolean),
      recommendedVisualForms: [...new Set(pagePlans.map((plan) => plan.recommendedVisualForm).filter(Boolean))]
    },
    layoutPlans: {
      present: layoutPlans.length > 0,
      count: layoutPlans.length,
      selectedLayouts,
      layoutFamilies,
      diverseSelectedLayouts: selectedLayouts.length >= Math.min(3, layoutPlans.length || 3),
      diverseLayoutFamilies: layoutFamilies.length >= Math.min(3, layoutPlans.length || 3)
    },
    evidenceReport: {
      present: Boolean(evidenceReport.totalSlides),
      totalSlides: evidenceReport.totalSlides || 0,
      slidesWithEvidence: evidenceReport.slidesWithEvidence || 0,
      averageCoverage: evidenceReport.averageCoverage ?? null,
      sourceSummary: evidenceReport.sourceSummary || null,
      blockingIssues: evidenceReport.blockingIssues || [],
      warnings: evidenceReport.warnings || []
    },
    contentDrafts: {
      present: contentDrafts.length > 0,
      count: contentDrafts.length,
      finalTitles: contentDrafts.map((draft) => draft.finalTitle).filter(Boolean),
      evidenceSnippetSlides: contentDrafts.filter((draft) => draft.evidenceSnippets?.length).length,
      blockedScaffoldTerms: [...new Set(contentDrafts.flatMap((draft) => draft.blockedScaffoldTerms || []))]
    },
    deckContentQualityReport: deckContentQualityReport
      ? {
          present: true,
          valid: deckContentQualityReport.valid,
          averageScore: deckContentQualityReport.averageScore,
          scaffoldMatches: deckContentQualityReport.scaffoldMatches || [],
          titleIssueCount: deckContentQualityReport.titleIssueCount,
          evidenceRealizedSlides: deckContentQualityReport.evidenceRealizedSlides,
          autoFixedSlides: deckContentQualityReport.autoFixedSlides,
          blockingSlides: deckContentQualityReport.blockingSlides || [],
          warnings: deckContentQualityReport.warnings || []
        }
      : { present: false },
    reviewScore: review.totalScore ?? project.quality?.score ?? null,
    exportGate: exported.ok
      ? { ok: true, status: "passed", httpStatus: exported.status }
      : { ok: false, status: "blocked", httpStatus: exported.status, reason: exported.gate },
    selectedLayouts,
    layoutFamilies,
    unsupportedClaims,
    lowConfidenceWarnings,
    acquisitionReport: project.acquisitionReport || generated.acquisitionReport || null,
    sourceDocuments: (project.sourceDocuments || []).map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      sourceType: source.sourceType,
      provider: source.provider,
      providerTier: source.providerTier,
      parseStatus: source.parseStatus,
      confidence: source.confidence,
      url: source.url
    })),
    files: {
      pptx: exported.output,
      generationReport: path.join(dirs.generationReports, `${sample.id}.json`),
      metadata: path.join(dirs.deckMetadata, `${sample.id}.json`)
    },
    pptxInspection: inspection
  };
}

function summaryMarkdown(metadataItems, serverInfo) {
  return [
    `# ${stageLabel} Delivery Quality Review Preparation`,
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "## Scope",
    "",
    "- Prepared four generic sample decks for product delivery quality review.",
    "- Generation used the existing `/api/generate-ppt` and `/api/export-pptx` chain.",
    "- Source support used parsed local text uploads created for this review package; no fake public search results were created.",
    "",
    "## Server",
    "",
    `- baseUrl: ${baseUrl}`,
    `- startedByScript: ${String(serverInfo.startedByScript)}`,
    `- portAlreadyInUse: ${String(serverInfo.portAlreadyInUse)}`,
    "",
    "## Samples",
    "",
    ...metadataItems.flatMap((item) => [
      `### ${item.id}`,
      "",
      `- pptType: ${item.pptType}`,
      `- reviewType: ${item.reviewType}`,
      `- slideCount: ${item.slideCount}`,
      `- pptx: ${item.files.pptx}`,
      `- contentPlan: ${item.contentPlan.present ? "present" : "missing"}`,
      `- slidePagePlans: ${item.slidePagePlans.count}`,
      `- layoutPlans: ${item.layoutPlans.count}`,
      `- evidenceReport: ${item.evidenceReport.present ? "present" : "missing"}`,
      `- reviewScore: ${item.reviewScore}`,
      `- exportGate: ${item.exportGate.status}`,
      `- selectedLayouts: ${item.selectedLayouts.join(", ")}`,
      `- layoutFamilies: ${item.layoutFamilies.join(", ")}`,
      `- bannedVisibleMatches: ${item.pptxInspection.bannedVisibleMatches.length ? item.pptxInspection.bannedVisibleMatches.join(", ") : "none"}`,
      ""
    ]),
    "## Render",
    "",
    `- Render status is written by \`npm run ${stageDirName === "p1-i" ? "p1i:render" : "p1h:render"}\` into \`render-report.json\`.`,
    ""
  ].join("\n");
}

async function runSample(sample) {
  const sourcePath = path.join(dirs.sourceMaterials, `${sample.id}.txt`);
  writeText(sourcePath, sample.sourceMaterial);
  const upload = await uploadTextFile(sourcePath);
  if (upload.analysis?.parseStatus !== "parsed" || upload.analysis?.blockCount < 1) {
    throw new Error(`${sample.id}: uploaded source material did not parse into usable blocks`);
  }

  const generatedResponse = await postJson("/api/generate-ppt", {
    prompt: sample.prompt,
    mode: "agent",
    forceLocal: true,
    disablePublicSearch: true,
    uploadedFile: {
      name: upload.fileName,
      size: upload.size,
      type: upload.type,
      analysis: upload.analysis
    }
  });
  if (!generatedResponse.ok) {
    throw new Error(`${sample.id}: generate failed ${generatedResponse.status}: ${generatedResponse.text}`);
  }
  const generated = generatedResponse.json;
  const project = generated.project;
  if (!project) throw new Error(`${sample.id}: generate response did not include project`);

  const exported = await exportPptx(project, sample.id);
  if (!exported.ok) {
    const reportPath = path.join(dirs.generationReports, `${sample.id}.json`);
    writeJson(reportPath, {
      id: sample.id,
      prompt: sample.prompt,
      status: "export_blocked",
      gate: exported.gate,
      generated
    });
    throw new Error(`${sample.id}: export blocked by quality gate`);
  }

  const inspection = await inspectPptx(exported.output);
  const metadata = summarizeGenerated(sample, generated, project, exported, inspection);
  if (metadata.pptType !== sample.expectedPlanType) {
    throw new Error(`${sample.id}: expected pptType ${sample.expectedPlanType}, got ${metadata.pptType}`);
  }
  if (metadata.slideCount < 8 || metadata.slideCount > 12) {
    throw new Error(`${sample.id}: expected 8-12 rendered PPTX slides, got ${metadata.slideCount}`);
  }
  if (!metadata.contentPlan.present || !metadata.slidePagePlans.present || !metadata.layoutPlans.present || !metadata.evidenceReport.present) {
    throw new Error(`${sample.id}: missing required planning/evidence records`);
  }
  if (stageDirName === "p1-i" && (!metadata.contentDrafts.present || !metadata.deckContentQualityReport.present)) {
    throw new Error(`${sample.id}: missing SlideContentDraft or deckContentQualityReport records`);
  }
  if (stageDirName === "p1-i" && metadata.deckContentQualityReport.valid === false) {
    throw new Error(`${sample.id}: deckContentQualityReport is invalid`);
  }
  if (!metadata.layoutPlans.diverseSelectedLayouts || !metadata.layoutPlans.diverseLayoutFamilies) {
    throw new Error(`${sample.id}: selectedLayout/layoutFamily diversity is too low`);
  }
  if (inspection.bannedVisibleMatches.length) {
    throw new Error(`${sample.id}: banned visible text detected: ${inspection.bannedVisibleMatches.join(", ")}`);
  }

  writeJson(path.join(dirs.generationReports, `${sample.id}.json`), {
    id: sample.id,
    status: "generated",
    prompt: sample.prompt,
    upload: {
      fileName: upload.fileName,
      parseStatus: upload.analysis?.parseStatus,
      blockCount: upload.analysis?.blockCount,
      sourcePath
    },
    generation: {
      status: generated.status,
      provider: generated.provider,
      contentPlanValidation: generated.contentPlanValidation,
      slidePagePlanValidation: generated.slidePagePlanValidation,
      layoutPlanValidation: generated.layoutPlanValidation
    },
    exportGate: metadata.exportGate,
    pptxInspection: inspection
  });
  writeJson(path.join(dirs.deckMetadata, `${sample.id}.json`), metadata);
  return metadata;
}

async function main() {
  Object.values(dirs).forEach(ensureDir);
  samples.forEach((sample) => ensureDir(path.join(dirs.renderedPages, sample.id)));
  writeJson(path.join(p1hRoot, "sample-prompts.json"), samples.map(({ id, expectedPlanType, prompt }) => ({ id, expectedPlanType, prompt })));

  const serverInfo = await ensureServer();
  const metadataItems = [];
  try {
    for (const sample of samples) {
      metadataItems.push(await runSample(sample));
    }
  } finally {
    await stopServer(serverInfo.server);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    samples: metadataItems.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      pptType: item.pptType,
      pptx: item.files.pptx,
      metadata: item.files.metadata,
      generationReport: item.files.generationReport,
      renderedPdf: "",
      renderedPagesDir: path.join(dirs.renderedPages, item.id),
      renderStatus: "pending_render"
    }))
  };
  writeJson(path.join(p1hRoot, "review-input-manifest.json"), manifest);
  writeJson(path.join(p1hRoot, "render-report.json"), {
    status: "pending_render",
    checkedAt: new Date().toISOString(),
    message: `Run npm run ${stageDirName === "p1-i" ? "p1i:render" : "p1h:render"} to convert PPTX files to PDF/PNG.`
  });
  writeText(path.join(p1hRoot, summaryFileName), summaryMarkdown(metadataItems, serverInfo));

  console.log(JSON.stringify({
    status: "ok",
    outputRoot: p1hRoot,
    samples: metadataItems.map((item) => ({
      id: item.id,
      pptType: item.pptType,
      slideCount: item.slideCount,
      pptx: item.files.pptx,
      exportGate: item.exportGate.status
    }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
