import type { ResearchItem, UploadedAsset } from "@/lib/canvas-data";
import type { PPTType } from "@/lib/ppt-review-rulebase";
import type { ContentPlan, ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import { detectScenarioPlaybookType, getScenarioPlaybook, playbookTypeFromCoreType, type ScenarioPlaybook } from "@/lib/ppt-agent/scenario-playbooks";
import { validateContentPlan } from "@/lib/ppt-agent/content-plan-validator";
import { cleanText } from "@/lib/text-sanitize";

type PlannerMode = "quick" | "professional";

export type ContentPlannerInput = {
  prompt: string;
  pptType?: PPTType | ContentPlanPPTType | string;
  uploadedAssets?: UploadedAsset[];
  research?: ResearchItem[];
  typeDetection?: { type?: PPTType; audience?: string; goal?: string };
  mode?: PlannerMode;
  userPreferences?: Record<string, unknown>;
  expertStyle?: Record<string, unknown>;
};

const coreToPlanType: Partial<Record<string, ContentPlanPPTType>> = {
  project_report: "project_report",
  company_profile: "company_profile",
  product_proposal: "product_intro",
  business_bp: "business_plan",
  financial_analysis: "financial_report",
  courseware: "courseware",
  policy_report: "policy_interpretation",
  event_plan: "activity_plan",
  travel_guide: "travel_plan",
  general_report: "general"
};

function unique<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function choosePlanType(input: ContentPlannerInput): ContentPlanPPTType {
  const raw = cleanText(input.pptType);
  const promptType = detectScenarioPlaybookType(input.prompt, input.typeDetection?.type);
  if (promptType !== "general" || !raw) return promptType;
  if (raw && raw in coreToPlanType) return coreToPlanType[raw]!;
  if (raw && raw in getScenarioPlaybookMap()) return raw as ContentPlanPPTType;
  return input.typeDetection?.type ? playbookTypeFromCoreType(input.typeDetection.type) : "general";
}

function getScenarioPlaybookMap(): Record<string, boolean> {
  return {
    project_report: true,
    product_intro: true,
    business_plan: true,
    financial_report: true,
    courseware: true,
    travel_plan: true,
    company_profile: true,
    proposal: true,
    research_report: true,
    activity_plan: true,
    policy_interpretation: true,
    general: true
  };
}

function inferAudience(prompt: string, playbook: ScenarioPlaybook, explicit?: string) {
  const clean = cleanText(prompt);
  const fromPrompt = clean.match(/面向([^，。；;\n]+)/)?.[1]?.trim();
  return cleanText(explicit || fromPrompt || playbook.commonAudiences.find((item) => clean.includes(item)) || playbook.commonAudiences[0]);
}

function inferDecisionGoal(prompt: string, playbook: ScenarioPlaybook, explicit?: string) {
  const clean = cleanText(prompt);
  const matched = playbook.commonDecisionGoals.find((goal) => clean.includes(goal.replace(/^判断是否/, "").replace(/^确认/, "")));
  if (explicit && [...cleanText(explicit)].length >= 4) return cleanText(explicit);
  if (/验收/.test(clean)) return "完成验收并明确下一步动作";
  if (/采购|购买/.test(clean)) return "判断是否采购或启动试点";
  if (/投资|融资/.test(clean)) return "判断是否继续投资或推进融资";
  if (/学习|课程|课件|培训/.test(clean)) return "帮助受众理解知识并完成练习";
  if (/旅游|攻略|行程/.test(clean)) return "让受众能照着执行行程";
  return matched && [...matched].length >= 4 ? matched : playbook.commonDecisionGoals[0];
}

function inferUserIntent(prompt: string, playbook: ScenarioPlaybook) {
  const clean = cleanText(prompt);
  const goalPhrase = clean.match(/帮我做一份(.+?)(?:PPT|ppt|幻灯片|$)/)?.[1]?.trim();
  const target = goalPhrase ? `${goalPhrase} PPT` : `${playbook.scenarioName} PPT`;
  return `生成一份${target}，用于${playbook.commonDecisionGoals[0]}，并按「${playbook.scenarioName}」的专业逻辑组织内容。`;
}

function inferCoreMessage(prompt: string, playbook: ScenarioPlaybook, audience: string, decisionGoal: string) {
  const clean = cleanText(prompt);
  const topic = clean
    .replace(/^帮我做一份/, "")
    .replace(/PPT.*/i, "")
    .replace(/[，。；;].*$/, "")
    .trim();
  const subject = topic || playbook.scenarioName;
  return `这份${playbook.scenarioName}要让${audience}围绕「${subject}」形成${decisionGoal}的判断。`;
}

function contentScopeFor(playbook: ScenarioPlaybook) {
  return {
    include: unique([
      ...playbook.requiredQuestions,
      ...playbook.requiredSlideRoles.map((item) => item.mustProve),
      ...playbook.evidenceExpectations.slice(0, 4)
    ]).slice(0, 12),
    exclude: [
      "与受众决策无关的资料堆叠",
      "无法核验来源的夸张描述",
      "重复出现但没有新增判断的页面",
      ...playbook.forbiddenGenericPatterns.slice(0, 3)
    ],
    avoid: unique([...playbook.forbiddenGenericPatterns, "万能模板结构", "空泛宣传口号"]).slice(0, 8)
  };
}

function evidenceNeedsFor(playbook: ScenarioPlaybook, research: ResearchItem[] = [], assets: UploadedAsset[] = []) {
  return unique([
    ...playbook.evidenceExpectations,
    ...research.slice(0, 4).map((item) => item.sourceName || item.source || item.title),
    ...assets.slice(0, 3).map((asset) => `上传资料：${asset.name}`)
  ]).slice(0, 12);
}

function slidePlanFor(playbook: ScenarioPlaybook, evidenceNeeds: string[], mode: PlannerMode = "professional") {
  const roles = mode === "quick" ? playbook.requiredSlideRoles.slice(0, Math.max(6, Math.min(8, playbook.requiredSlideRoles.length))) : playbook.requiredSlideRoles;
  const optional = mode === "quick" ? [] : playbook.optionalSlideRoles.slice(0, 2);
  const plannedRoles = [...roles, ...optional];
  const supplementalRoles = [
    {
      role: "证据复核",
      titleIntent: "证据来源与可信度",
      pagePurpose: "集中说明关键判断需要哪些来源支撑，并标记正式交付前必须核验的材料。",
      mustProve: "核心判断有来源、有口径，不依赖空泛表述或编造数据。",
      suggestedEvidence: evidenceNeeds.length ? evidenceNeeds : playbook.evidenceExpectations,
      avoid: ["不要堆砌来源名称", "不要编造无法核验的数据", "不要把证据页写成附录垃圾桶"],
      layoutHint: "evidence" as const
    },
    {
      role: "复盘动作",
      titleIntent: "优先动作与复盘口径",
      pagePurpose: "把内容结论转成会后可执行动作、复盘指标或补充资料清单。",
      mustProve: "受众看完后知道下一步谁做什么、如何复核效果。",
      suggestedEvidence: ["行动清单", "责任口径", "复盘指标", ...evidenceNeeds.slice(0, 2)],
      avoid: ["不要只写感谢页", "不要没有责任和时间", "不要把下一步写成口号"],
      layoutHint: "closing" as const
    },
    {
      role: "附录口径",
      titleIntent: "口径说明与待补材料",
      pagePurpose: "说明正式交付前需要核验的口径、来源、假设和补充材料。",
      mustProve: "关键判断的来源、口径和假设边界清楚，后续可以继续补资料而不影响主线。",
      suggestedEvidence: ["来源口径", "假设边界", "待补材料", ...evidenceNeeds.slice(0, 2)],
      avoid: ["不要把附录写成杂乱堆料", "不要隐藏关键风险", "不要把待补材料伪装成已验证结论"],
      layoutHint: "source" as const
    }
  ];
  const targetCount = mode === "quick" ? Math.min(8, Math.max(6, plannedRoles.length)) : Math.max(9, plannedRoles.length);
  supplementalRoles.forEach((item) => {
    if (plannedRoles.length < targetCount && !plannedRoles.some((role) => role.role === item.role)) {
      plannedRoles.push(item);
    }
  });
  return plannedRoles.map((item, index) => ({
    id: `cp-slide-${index + 1}`,
    role: item.role,
    titleIntent: item.titleIntent,
    pagePurpose: item.pagePurpose,
    mustProve: item.mustProve,
    suggestedEvidence: unique([...item.suggestedEvidence, ...evidenceNeeds.slice(0, 2)]).slice(0, 5),
    avoid: item.avoid.slice(0, 5),
    priority: index < playbook.requiredSlideRoles.length ? "required" as const : "recommended" as const,
    layoutHint: item.layoutHint
  }));
}

function teacherCoursewareContext(input: ContentPlannerInput) {
  const preferences = input.userPreferences || {};
  const task = preferences.teacherTask as Record<string, unknown> | undefined;
  const style = preferences.teacherStyle as Record<string, unknown> | undefined;
  if (preferences.scenario !== "teacher_courseware" || !task) return undefined;
  return {
    subject: cleanText(task.subject),
    topic: cleanText(task.topic, "数学概念与图像"),
    schoolStage: cleanText(task.schoolStage),
    grade: cleanText(task.grade),
    duration: cleanText(task.duration),
    visualMode: cleanText(style?.visualMode),
    theme: cleanText(style?.theme),
    sourceMaterial: cleanText(task.pastedMaterials),
    teachingRequirements: cleanText(task.teachingRequirements) || undefined,
    textbook: cleanText(task.textbook) || undefined,
    chapter: cleanText(task.chapter) || undefined,
    generationMode: cleanText(task.generationMode) as "chapter_prep" | "lesson_plan" | "optimize_existing" | undefined,
    deckPlan: task.deckPlan
  };
}

function teacherGeneralSlidePlan(topic: string, subject: string): ContentPlan["slidePlan"] {
  const seeds = [
    ["课程封面", topic, "明确课题、对象和课堂核心问题。", "学生知道本课主题与学习方向。", "cover", "说出自己对课题最想解决的问题。", "能用一句话描述本课主题。"],
    ["学习目标", "学习目标", "把知识、方法和课堂表现转成可检查目标。", "目标与课题、活动和评价方式一致。", "cards", "选择一个最需要突破的目标。", "能说明达成目标的证据。"],
    ["情境导入", `从真实情境进入${topic}`, "连接已有经验、教材情境与本课问题。", "学生已有经验与新知识之间的联系清楚。", "split", "观察情境并提出与课题有关的问题。", "能说出已有认识和待解决问题。"],
    ["核心概念与知识", `${topic}的核心知识`, "讲清本课关键概念、事实、规则或方法。", "核心知识有边界、有层次并可复述。", "matrix", "圈出关键词并用自己的话解释。", "能准确复述核心知识。"],
    ["示例讲解", `${topic}的理解示例`, "用教材示例展示从信息到结论的思考过程。", "示例、步骤、依据和结论完整。", "process", "补充关键一步并说明依据。", "能复述示例的思考路径。"],
    ["课堂探究", "课堂探究与合作任务", "通过观察、讨论或操作深化理解。", "活动任务、分工、产出和检查方式明确。", "process", "完成小组任务并展示一项可观察成果。", "能用证据说明小组结论。"],
    ["分层练习", `${topic}的课堂练习`, "用基础、理解和迁移任务检查掌握情况。", "练习由易到难并与学习目标对应。", "checklist", "独立完成后标记最不确定的一题。", "能完成基础任务并解释关键依据。"],
    ["反馈纠错", "反馈、纠错与再练习", "根据典型错误提供反馈和二次练习。", "错误表现、原因、纠正方法和复查标准清楚。", "comparison", "对照标准修正答案并说明改动原因。", "能识别错误并完成修正。"],
    ["总结作业", "总结与作业", "回扣目标、整理知识结构并安排课后任务。", "总结覆盖核心知识、方法和应用，作业可执行。", "closing", "完成一分钟总结和自评。", "能对照学习目标完成自评。"],
  ] as const;
  return seeds.map((seed, index) => ({
    id: `teacher-general-${String(index + 1).padStart(2, "0")}`,
    role: seed[0],
    titleIntent: seed[1],
    pagePurpose: seed[2],
    mustProve: seed[3],
    suggestedEvidence: [topic, `${subject}教材`, "学生课堂产出"],
    avoid: ["商务汇报语义", "内部规划字段上屏", "泛化套话"],
    priority: "required" as const,
    layoutHint: seed[4],
    audienceQuestion: `学生学完「${seed[1]}」后应该能做出什么可观察的表现？`,
    studentAction: seed[5],
    masteryCheck: seed[6],
    childOutputRequired: index > 0,
    visualNeed: index === 0 ? "concept_relation" : index === 4 || index === 5 ? "worked_example_steps" : "concept_relation",
    contentLimit: "每页一个教学任务；要点不超过5项",
  }));
}

function teacherMathSlidePlan(topic: string): ContentPlan["slidePlan"] {
  const seeds = [
    ["课程封面", topic, "建立课题、学段和本课核心问题。", "学生知道本课研究对象与学习方向。", "cover", "说出本课要研究的对象。", "学生能用一句话描述本课主题。", false, "concept_relation", "标题不超过18字；副标题不超过32字"],
    ["学习目标", "学习目标", "把知识、方法与课堂输出转成可检查目标。", "目标包含理解、表示、判断与应用。", "cards", "选择最需要突破的一个目标。", "能复述目标并说明检查方式。", true, "concept_relation", "最多4项目标；每项不超过24字"],
    ["前置知识与情境导入", "从变量关系进入新知", "从已有变量、坐标与正比例知识建立知识框架，再进入新概念。", "新知与学生已有知识之间存在可说明的连接。", "split", "根据情境列出两个变量并判断关系。", "能从情境写出变量关系。", true, "coordinate_graph", "1个情境；3个前置知识点"],
    ["概念定义", "定义与关键变量", "完成核心概念讲解并辨认关键变量。", "定义条件、符号含义和反例边界清楚。", "matrix", "判断给定表达式是否符合定义并说明理由。", "能指出参数条件与变量。", true, "concept_relation", "1条定义；3个关键条件；1个反例"],
    ["表示方式映射", "表格、解析式与图像的对应", "建立数值、符号和图像三种表示之间的映射。", "同一关系可在表格、解析式和坐标图像之间互相转换。", "comparison", "补全数值表并描点连线。", "能解释三种表示为何对应同一关系。", true, "table_formula_graph_mapping", "1个数值表；1个解析式；1个坐标图"],
    ["参数比较", "参数变化如何改变图像", "比较关键参数变化与图像特征的对应关系。", "参数的正负、大小和截距变化都有真实图像对比。", "comparison", "观察多条图像并归纳参数作用。", "能根据图像判断参数符号与变化。", true, "parameter_compare", "最多4条直线；2组对比结论"],
    ["例题分步讲解", "例题：从条件到解析式", "通过案例演示示范如何把条件转化为方程并得到结论。", "题目、已知、步骤、判断和结论完整。", "process", "补充关键一步并解释依据。", "能独立复述解题链条。", true, "worked_example_steps", "1道例题；4个步骤；1个结论"],
    ["课堂互动与练习反馈", "课堂练习：表示、判断与反馈", "用真实题目检查学生能否迁移应用。", "题目主体、作答动作、提示和反馈标准齐全。", "checklist", "独立作答后与同伴核对图像和理由。", "能完成计算、作图并解释。", true, "practice_feedback", "2道小题；1个作答区；1个反馈区"],
    ["总结与作业延伸", "总结与作业", "完成总结复盘，回扣目标并安排与本课直接相关的巩固任务。", "总结覆盖概念、表示、参数与应用，作业可执行。", "closing", "用概念关系图完成一分钟总结。", "能对照目标完成自评。", true, "concept_relation", "4条总结；2项作业" ]
  ] as const;
  return seeds.map((seed, index) => ({
    id: `teacher-math-${String(index + 1).padStart(2, "0")}`,
    role: seed[0], titleIntent: seed[1], pagePurpose: seed[2], mustProve: seed[3],
    suggestedEvidence: [topic, "课堂教材", "学生作答"], avoid: ["商务汇报语义", "内部规划字段上屏", "泛化套话"],
    priority: "required" as const, layoutHint: seed[4], audienceQuestion: `学生学完「${seed[1]}」后应该能做出什么可观察的表现？`,
    studentAction: seed[5], masteryCheck: seed[6], childOutputRequired: seed[7], visualNeed: seed[8], contentLimit: seed[9]
  }));
}

function teacherModeSlidePlan(
  topic: string,
  mode: "chapter_prep" | "lesson_plan" | "optimize_existing" | undefined,
): ContentPlan["slidePlan"] {
  if (!mode) return teacherMathSlidePlan(topic);
  const common = {
    suggestedEvidence: [topic, "教材章节", "学生课堂产出"],
    avoid: ["商务汇报语义", "内部规划字段上屏", "连续重复卡片", "只有文字没有教学视觉"],
    priority: "required" as const,
    childOutputRequired: true,
    contentLimit: "每页一个教学任务；正文不超过5项；必须有对应视觉表达",
  };
  const chapterSeeds = [
    ["章节定位", `${topic}在本章中的位置`, "说明本节承接什么、为后续什么做准备。", "呈现前后知识依赖关系。", "cover", "concept_relation"],
    ["教材分析", "教材内容与编排意图", "提炼教材版本、章节、例题与编排意图。", "老师能看见教材依据和内容边界。", "split", "textbook_map"],
    ["教学目标", "本节课的可检查目标", "形成知识、方法与素养目标。", "每项目标都有课堂证据。", "cards", "objective_map"],
    ["重点难点", "重点、难点与突破路径", "区分必须掌握内容与认知障碍。", "给出突破活动和检查方式。", "comparison", "difficulty_path"],
    ["知识结构图", `${topic}的知识结构`, "把概念、条件、方法与应用连成结构。", "知识节点和关系清楚。", "matrix", "knowledge_map"],
    ["核心概念讲解", `${topic}的核心概念`, "讲清定义、条件、表征与边界。", "概念可以被辨认、解释和迁移。", "split", "concept_relation"],
    ["典型例题", "典型例题：从条件到结论", "展示已知、思考、步骤、关键判断与易错点。", "学生能复述并尝试变式。", "process", "worked_example_steps"],
    ["课堂活动设计", "课堂探究与学习产出", "规定任务、时间、互动方式和教师观察点。", "学生有可展示的课堂产出。", "checklist", "practice_feedback"],
    ["作业与评价", "分层作业与达成评价", "布置基础、提高与挑战任务并回扣目标。", "评价标准和反馈方式明确。", "closing", "objective_map"],
  ] as const;
  const lessonSeeds = [
    ["课程信息", `${topic} · 课堂实施方案`, "明确对象、课时、教材和本课主问题。", "教师可据此直接进入课堂。", "cover", "classroom_scene"],
    ["教学目标", "本课教学目标与达成证据", "把目标转换为可观察的学习表现。", "目标、活动和评价一致。", "cards", "objective_map"],
    ["导入设计", `从真实情境进入${topic}`, "用生活或学科情境制造认知需求。", "学生提出本课要解决的问题。", "split", "classroom_scene"],
    ["新知讲授", `${topic}的新知建构`, "按问题链讲清概念、关系与方法。", "关键知识有示意图和板书线索。", "matrix", "concept_relation"],
    ["师生活动", "教师引导与学生学习活动", "明确教师提问、学生回应和即时评价。", "课堂互动不是单向讲解。", "comparison", "teacher_student_flow"],
    ["探究任务", "小组探究：观察、比较、归纳", "给出任务、分工、时间和成果要求。", "学生用证据形成结论。", "process", "inquiry_process"],
    ["课堂练习", "分层练习与即时反馈", "设置基础、提高、挑战题和反馈提示。", "教师能据作答判断掌握情况。", "checklist", "practice_feedback"],
    ["总结评价", "知识结构与课堂评价", "让学生结构化复盘并完成自评互评。", "总结呈现关系而不是重复句子。", "matrix", "knowledge_map"],
    ["板书设计", "板书设计与课后任务", "呈现课堂板书骨架、作业和延伸问题。", "教师可以照此落板和收课。", "closing", "board_design"],
  ] as const;
  const optimizeSeeds = [
    ["原课件分析", "原课件逐页诊断总览", "说明原页数量、保留项与主要问题。", "诊断能追溯到原页。", "cover", "before_after"],
    ["逐页优化", "原页与优化页对照", "逐页保留教学意图并修正问题。", "每页都有原内容、问题、建议和优化后版本。", "comparison", "before_after"],
  ] as const;
  const seeds = mode === "chapter_prep" ? chapterSeeds : mode === "lesson_plan" ? lessonSeeds : optimizeSeeds;
  return seeds.map((seed, index) => ({
    id: `teacher-${mode}-${String(index + 1).padStart(2, "0")}`,
    role: seed[0],
    titleIntent: seed[1],
    pagePurpose: seed[2],
    mustProve: seed[3],
    layoutHint: seed[4],
    visualNeed: seed[5],
    audienceQuestion: `完成“${seed[1]}”后，教师和学生分别要看到什么证据？`,
    studentAction: mode === "optimize_existing" ? "对照原页检查信息是否保留、问题是否修复。" : "完成本页指定的观察、表达或练习任务。",
    masteryCheck: seed[3],
    ...common,
  }));
}

function variableTeacherPlan(base: ContentPlan["slidePlan"], context: ReturnType<typeof teacherCoursewareContext>): ContentPlan["slidePlan"] {
  const confirmed = context?.deckPlan as { status?: string; pages?: Array<Record<string, unknown>> } | undefined;
  if (confirmed?.status === "confirmed" && Array.isArray(confirmed.pages) && confirmed.pages.length >= 1) {
    return confirmed.pages.map((page, index) => {
      const fallback = base[index % base.length];
      return { ...fallback, id: String(page.id || "teacher-confirmed-" + (index + 1)), role: cleanText(page.role, fallback.role), titleIntent: cleanText(page.titleIntent, fallback.titleIntent), pagePurpose: cleanText(page.pagePurpose, fallback.pagePurpose), mustProve: cleanText(page.mustProve, fallback.mustProve), layoutHint: cleanText(page.layoutHint, fallback.layoutHint) as ContentPlan["slidePlan"][number]["layoutHint"], priority: page.priority === "recommended" ? "recommended" as const : fallback.priority };
    });
  }
  if (context?.generationMode === "optimize_existing") return base;
  const minutes = Number(String(context?.duration || "").match(/\d{1,3}/)?.[0] || 45);
  const desired = minutes <= 30 ? 7 : minutes <= 50 ? 9 : minutes <= 70 ? 10 : minutes <= 95 ? 12 : 14;
  const compact = [0, 1, 2, 3, 5, 7, 8].map((index) => base[index]).filter(Boolean);
  const planned = desired < base.length ? compact : [...base];
  const extras = [["????", "????", "???????????", "???????????", "process"], ["?????", "????", "????????????", "????????????", "checklist"], ["????", "????", "???????????", "???????????", "closing"]] as const;
  for (let index = 0; planned.length < desired; index += 1) { const item = extras[index % extras.length]; planned.splice(Math.max(1, planned.length - 1), 0, { ...base[Math.min(index + 1, base.length - 1)], id: "teacher-variable-" + (index + 1), role: item[0], titleIntent: item[1], pagePurpose: item[2], mustProve: item[3], layoutHint: item[4], priority: "recommended" }); }
  return planned;
}

function buildPlan(input: ContentPlannerInput, playbookType: ContentPlanPPTType): ContentPlan {
  const playbook = getScenarioPlaybook(playbookType);
  const teacherContext = teacherCoursewareContext(input);
  const audience = inferAudience(input.prompt, playbook, input.typeDetection?.audience);
  const decisionGoal = inferDecisionGoal(input.prompt, playbook, input.typeDetection?.goal);
  const evidenceNeeds = evidenceNeedsFor(playbook, input.research, input.uploadedAssets);
  if (teacherContext && teacherContext.subject === "数学" && teacherContext.visualMode === "teaching_grid") {
    const topic = teacherContext.topic;
    return {
      planId: `content-plan-teacher-math-${Date.now()}`,
      pptType: "courseware",
      userIntent: `生成一份面向${teacherContext.schoolStage || "高中"}${teacherContext.grade || "学生"}的数学课件，课题为「${topic}」。${teacherContext.teachingRequirements ? `教学要求：${teacherContext.teachingRequirements}` : ""}`,
      audience: `${teacherContext.schoolStage || "高中"}${teacherContext.grade || "学生"}`,
      decisionGoal: "让学生理解概念、建立多种表示联系并完成可检查练习",
      coreMessage: `围绕「${topic}」完成从已有知识、概念建构、图像解释到练习反馈的教学闭环。${teacherContext.teachingRequirements ? `教学要求：${teacherContext.teachingRequirements}` : ""}`,
      narrativeStrategy: "前置知识激活 -> 概念定义 -> 多表征映射 -> 参数比较 -> 例题示范 -> 练习反馈 -> 总结迁移",
      contentScope: {
        include: ["学习目标", "前置知识", "概念定义", "数值表", "解析式", "坐标图像", "参数比较", "例题", "练习反馈", "总结作业"],
        exclude: ["项目汇报", "市场分析", "研究报告", "证据链汇报", "与课题无关的通用补页"],
        avoid: ["内部规划字段上屏", "泛化套话", "重复句", "截断标题", "只写结论不画数学图形"]
      },
      evidenceNeeds: [teacherContext.sourceMaterial || "教师提供的课程材料", "课堂教材", "学生作答"],
      keyQuestions: ["学生已有知识是什么？", "概念如何定义？", "多种表示如何对应？", "参数如何改变图像？", "学生如何练习并获得反馈？"],
      slidePlan: variableTeacherPlan(teacherModeSlidePlan(topic, teacherContext.generationMode), teacherContext),
      qualityChecklist: ["9个内容页角色完整", "每页一个核心任务", "数学图形可编辑", "有学生输出", "有真实练习和反馈", "无商务语义"],
      styleDirection: "teacher_math_science_v1 / teaching_grid / rational_teal",
      layoutDirection: "严格按TM01-TM09锁定教学版式，先角色、再视觉形式、再版式。",
      riskWarnings: ["坐标图、表格和参数对比不得退化为普通卡片", "内部字段不得进入可见正文", "练习必须有真实题目"],
      generationWarnings: ["数学核心表达必须使用可编辑形状、文本和表格。", "未命中锁定版式时标记LAYOUT_GAP。"],
      playbookId: "teacher_math_science_v1",
      teachingObjectives: ["理解核心概念与条件", "建立表格、解析式和图像的联系", "解释参数变化", "完成基础应用"],
      teachingChain: ["前置知识", "概念", "多表征", "参数", "例题", "练习", "总结"],
      teacherContext,
      createdAt: new Date().toISOString()
    };
  }
  if (teacherContext) {
    const topic = teacherContext.topic;
    const subject = teacherContext.subject || "课程";
    const requirements = teacherContext.teachingRequirements;
    return {
      planId: `content-plan-teacher-general-${Date.now()}`,
      pptType: "courseware",
      userIntent: `生成一份面向${teacherContext.schoolStage || "本学段"}${teacherContext.grade || "学生"}的${subject}课件，课题为「${topic}」。${requirements ? `教学要求：${requirements}` : ""}`,
      audience: `${teacherContext.schoolStage || "本学段"}${teacherContext.grade || "学生"}`,
      decisionGoal: `让学生理解「${topic}」的核心知识，并通过课堂活动、练习和反馈形成可检查的学习成果`,
      coreMessage: `围绕「${topic}」完成情境导入、核心讲解、示例、探究、练习、反馈和总结的教学闭环。${requirements ? `教学要求：${requirements}` : ""}`,
      narrativeStrategy: "情境导入 -> 明确目标 -> 核心讲解 -> 示例示范 -> 课堂探究 -> 分层练习 -> 反馈纠错 -> 总结迁移",
      contentScope: {
        include: ["学习目标", "已有经验", "核心知识", "示例", "课堂活动", "分层练习", "反馈纠错", "总结作业"],
        exclude: ["项目汇报", "市场分析", "研究报告", "与课题无关的通用补页"],
        avoid: ["内部规划字段上屏", "泛化套话", "重复句", "没有学生行动的纯讲解"],
      },
      evidenceNeeds: [teacherContext.sourceMaterial || teacherContext.textbook || `${subject}教材`, "课堂教材", "学生课堂产出"],
      keyQuestions: ["学生已有经验是什么？", "本课核心知识是什么？", "怎样通过示例和活动形成理解？", "如何练习并获得反馈？", "怎样检查学习目标是否达成？"],
      slidePlan: variableTeacherPlan(teacherGeneralSlidePlan(topic, subject), teacherContext),
      qualityChecklist: ["9个教学页角色完整", "每页一个教学任务", "有学生行动", "有练习和反馈", "无商务语义"],
      styleDirection: `teacher_general_v1 / ${teacherContext.visualMode || "teaching_grid"} / ${teacherContext.theme || "book_blue"}`,
      layoutDirection: "按教学角色变化版式，保证讲解、活动、练习和反馈的节奏清楚。",
      riskWarnings: ["不得把课件写成商业汇报", "课堂活动必须有明确产出", "练习与反馈必须对应学习目标"],
      generationWarnings: ["事实性内容以教师教材和输入为准。", "证据不足时不得虚构来源。"],
      playbookId: "teacher_general_v1",
      teachingObjectives: ["理解核心知识", "掌握基本方法", "完成课堂任务", "根据反馈修正理解"],
      teachingChain: ["情境", "目标", "讲解", "示例", "探究", "练习", "反馈", "总结"],
      teacherContext,
      createdAt: new Date().toISOString(),
    };
  }
  return {
    planId: `content-plan-${playbookType}-${Date.now()}`,
    pptType: playbookType,
    userIntent: inferUserIntent(input.prompt, playbook),
    audience,
    decisionGoal,
    coreMessage: inferCoreMessage(input.prompt, playbook, audience, decisionGoal),
    narrativeStrategy: playbook.narrativePatterns[0],
    contentScope: contentScopeFor(playbook),
    evidenceNeeds,
    keyQuestions: playbook.requiredQuestions,
    slidePlan: slidePlanFor(playbook, evidenceNeeds, input.mode || "professional"),
    qualityChecklist: playbook.qualityChecklistSeeds,
    styleDirection: playbook.styleDefaults,
    layoutDirection: `优先使用 ${playbook.layoutBias.join(" / ")}，根据页面角色变化版式，不固定同一模板。`,
    riskWarnings: playbook.commonRisks,
    generationWarnings: [
      "必须先按 ContentPlan 生成 DeckSpec / SlideSpec，再生成页面。",
      "证据不足时要标记待补资料，不能编造来源。",
      "禁止退回万能模板结构。"
    ],
    playbookId: playbook.pptType,
    createdAt: new Date().toISOString()
  };
}

export function repairContentPlan(plan: ContentPlan): ContentPlan {
  const playbook = getScenarioPlaybook(plan.pptType);
  const evidenceNeeds = plan.evidenceNeeds?.length ? plan.evidenceNeeds : playbook.evidenceExpectations;
  const repaired: ContentPlan = {
    ...plan,
    userIntent: cleanText(plan.userIntent, `生成一份${playbook.scenarioName} PPT，并按专业场景逻辑组织内容。`),
    audience: cleanText(plan.audience, playbook.commonAudiences[0]),
    decisionGoal: cleanText(plan.decisionGoal, playbook.commonDecisionGoals[0]),
    coreMessage: cleanText(plan.coreMessage, `这份${playbook.scenarioName}要帮助${plan.audience || playbook.commonAudiences[0]}形成${plan.decisionGoal || playbook.commonDecisionGoals[0]}的判断。`),
    narrativeStrategy: cleanText(plan.narrativeStrategy, playbook.narrativePatterns[0]),
    contentScope: {
      include: plan.contentScope?.include?.length ? plan.contentScope.include : contentScopeFor(playbook).include,
      exclude: plan.contentScope?.exclude?.length ? plan.contentScope.exclude : contentScopeFor(playbook).exclude,
      avoid: unique([...(plan.contentScope?.avoid || []), ...playbook.forbiddenGenericPatterns]).slice(0, 8)
    },
    evidenceNeeds,
    keyQuestions: plan.keyQuestions?.length ? plan.keyQuestions : playbook.requiredQuestions,
    slidePlan: plan.slidePlan?.length ? plan.slidePlan : slidePlanFor(playbook, evidenceNeeds),
    qualityChecklist: plan.qualityChecklist?.length ? plan.qualityChecklist : playbook.qualityChecklistSeeds,
    riskWarnings: plan.riskWarnings?.length ? plan.riskWarnings : playbook.commonRisks,
    generationWarnings: plan.generationWarnings?.length ? plan.generationWarnings : ["证据不足时标记待补资料，不编造来源。"]
  };
  const existingText = repaired.slidePlan.map((slide) => `${slide.role} ${slide.titleIntent}`).join("\n");
  const missing = playbook.requiredSlideRoles.filter((roleSeed) => !existingText.includes(roleSeed.role) && !existingText.includes(roleSeed.titleIntent));
  if (missing.length) {
    repaired.slidePlan = [
      ...repaired.slidePlan,
      ...missing.map((item, index) => ({
        id: `cp-slide-repair-${index + 1}`,
        role: item.role,
        titleIntent: item.titleIntent,
        pagePurpose: item.pagePurpose,
        mustProve: item.mustProve,
        suggestedEvidence: unique([...item.suggestedEvidence, ...evidenceNeeds.slice(0, 2)]).slice(0, 5),
        avoid: item.avoid.slice(0, 5),
        priority: "required" as const,
        layoutHint: item.layoutHint
      }))
    ];
  }
  return repaired;
}

export function createContentPlan(input: ContentPlannerInput): { contentPlan: ContentPlan; validation: ReturnType<typeof validateContentPlan> } {
  const playbookType = choosePlanType(input);
  let contentPlan = buildPlan(input, playbookType);
  let validation = validateContentPlan(contentPlan);
  if (!validation.valid) {
    contentPlan = repairContentPlan(contentPlan);
    validation = validateContentPlan(contentPlan);
  }
  return { contentPlan, validation };
}
