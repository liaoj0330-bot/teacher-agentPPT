import type { ResearchItem, UploadedAsset } from "@/lib/canvas-data";
import type { PPTType } from "@/lib/ppt-review-rulebase";
import type { ContentPlan, ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";
import { detectScenarioPlaybookType, getScenarioPlaybook, playbookTypeFromCoreType, type ScenarioPlaybook } from "@/lib/ppt-agent/scenario-playbooks";
import { validateContentPlan } from "@/lib/ppt-agent/content-plan-validator";
import { deriveLessonPresentationStrategy } from "@/lib/ppt-agent/lesson-presentation-strategy";
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
    learnerProfile: task.learnerProfile as Record<string, unknown> | undefined,
    classroomConstraints: task.classroomConstraints as Record<string, unknown> | undefined,
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
  const subjectRoles = subject === "数学" && /加减|乘除|口算|竖式/.test(topic)
    ? ["课程封面", "学习目标", "生活情境", "算理建构", "例题示范", "操作探究", "计算练习", "错因诊断", "总结作业"]
    : /语文/.test(subject)
      ? ["课程封面", "学习目标", "初读感知", "词句品读", "重点段落", "朗读表达", "迁移仿写", "反馈修改", "总结作业"]
      : /英语|English/i.test(subject)
        ? ["Course cover", "Learning goals", "Listening warm-up", "Key expressions", "Model dialogue", "Pair work", "Speaking practice", "Feedback and retry", "Summary task"]
        : undefined;
  const subjectTitles = subject === "数学" && /加减|乘除|口算|竖式/.test(topic)
    ? [topic, "本课学习目标", `用生活问题认识${topic}`, `${topic}的计算方法`, "例题：从算式到算理", "摆一摆、说一说、算一算", `${topic}课堂练习`, "常见错误与订正", "总结与作业"]
    : /语文/.test(subject)
      ? [topic, "本课学习目标", `初读《${topic}》`, "词语、段落与表达线索", "重点段落品读", "朗读、批注与分享", "表达迁移与仿写", "反馈修改与再读", "总结与作业"]
      : /英语|English/i.test(subject)
        ? [topic, "Learning goals", "Listen and greet", "Key expressions", "Model dialogue", "Meet a new classmate", "Speaking practice", "Feedback and retry", "I can do it"]
        : undefined;  return seeds.map((seed, index) => ({
    id: `teacher-general-${String(index + 1).padStart(2, "0")}`,
    role: subjectRoles?.[index] || seed[0],
    titleIntent: subjectTitles?.[index] || seed[1],
    pagePurpose: seed[2],
    mustProve: seed[3],
    suggestedEvidence: [topic, `${subject}教材`, "学生课堂产出"],
    avoid: ["商务汇报语义", "内部规划字段上屏", "泛化套话"],
    priority: "required" as const,
    layoutHint: seed[4],
    audienceQuestion: `学生学完「${subjectTitles?.[index] || seed[1]}」后应该能做出什么可观察的表现？`,
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

function fullLessonSamplePlan(
  base: ContentPlan["slidePlan"],
  context: ReturnType<typeof teacherCoursewareContext>,
): ContentPlan["slidePlan"] | null {
  const minutes = Number(String(context?.duration || "").match(/\d{1,3}/)?.[0] || 45);
  const subject = cleanText(context?.subject);
  const topic = cleanText(context?.topic);
  if (minutes < 40 || minutes > 55) return null;

  const physics = subject === "物理" && /楞次定律/.test(topic);
  const chinese = subject === "语文" && topic === "背影";
  if (!physics && !chinese) return null;

  const seeds = physics
    ? [
      ["课程封面", "楞次定律", "明确本课问题和实验对象。", "学生知道本课要从实验现象建构规律。", "cover", "说出本课最想解释的实验现象。", "能区分观察现象与规律结论。"],
      ["学习目标", "今天我们怎样证明学会了", "把规律、判断链和迁移任务转成可检查目标。", "目标对应课堂产出和离堂评价。", "cards", "选择自己最需要突破的目标。", "能说明用什么证据证明掌握。"],
      ["实验情境", "磁铁靠近线圈时发生了什么", "展示检流计偏转与回零的可观察现象。", "学生能准确描述磁铁运动和指针变化。", "split", "只记录事实，不先解释原因。", "形成一条完整实验观察记录。"],
      ["预测任务", "先预测：四种运动会怎样偏转", "让学生在观察前提出可检验预测。", "预测必须包含磁极、运动和偏转方向。", "checklist", "独立填写四种状态预测表。", "保留一处不确定项进入实验验证。"],
      ["证据记录", "四种状态的实验记录", "比较 N/S 极靠近和离开时的共同关系。", "记录表含条件、磁通量变化和偏转。", "matrix", "小组补全四行记录表。", "能用记录证明不是随机偏转。"],
      ["规律建构", "从证据归纳楞次定律", "从多组记录归纳阻碍变化而非相反方向。", "规律表述含变化、作用和对象。", "process", "用一句话概括共同关系。", "能说明阻碍的是磁通量变化。"],
      ["核心概念", "判断方向前先看磁通量变化", "建立磁通量、感应磁场和近端磁极的关系。", "学生知道判断顺序不可跳步。", "comparison", "为两种变化标注增加或减少。", "能说出完整判断链。"],
      ["示范讲解", "示范：N 极靠近时怎样判断", "用一个典型情境示范从已知到电流方向。", "题目、步骤、依据和结论完整。", "process", "补全示范中的关键一步。", "能复述每一步依据。"],
      ["变式比较", "变式：N 极离开时哪里变了", "比较靠近与离开，定位不变的方法和变化的结论。", "学生能解释近端磁极为何改变。", "comparison", "在对照表中圈出变化项。", "能用阻碍变化解释结果。"],
      ["探究任务", "小组探究：用判断链解释四种状态", "以小组任务把实验记录转成解释。", "每组交付一行完整判断链。", "checklist", "分工完成一行并交换核对。", "能用学科语言解释判断。"],
      ["即时检测", "30 秒检测：先写变化，再判方向", "用短题检查学生是否跳过磁通量判断。", "答案必须写出变化和依据。", "checklist", "独立完成一题并亮出答案。", "教师能据此决定是否再讲。"],
      ["分层练习", "基础、理解与迁移三层练习", "让不同基础的学生在同一规则下完成任务。", "每题都有作答要求和反馈标准。", "matrix", "选择对应层级完成并标记困难。", "能在新条件下使用判断链。"],
      ["典型错误", "为什么“总是相反”是错的", "呈现常见误解并定位错误发生的位置。", "学生能区分原磁场与磁通量变化。", "comparison", "给错误答案划出第一处错误。", "能说明错误原因。"],
      ["纠错再练", "纠错后再判一次：观察方向不能弄反", "在新观察方向下重新完成判断。", "学生能用右手螺旋定则完成校验。", "process", "修改原答案并写出修改理由。", "能完成同类再练。"],
      ["迁移应用", "楞次定律还能解释什么", "把阻碍变化迁移到电磁阻尼等新情境。", "学生能指出变化、响应和阻碍关系。", "split", "选择一个新情境完成三句解释。", "能把规律迁移到未见情境。"],
      ["离堂评价", "离堂任务与课后巩固", "收集独立判断证据并安排分层作业。", "离堂答案、理由和自评完整。", "closing", "独立完成离堂题并自评。", "教师可据此安排后续巩固。"],
    ]
    : [
      ["课程封面", "背影", "明确文本、阅读问题和本课任务。", "学生知道本课不止复述故事。", "cover", "写下第一次读到背影时的一个疑问。", "能说出本课阅读任务。"],
      ["学习目标", "今天我们怎样读懂背影", "把文本证据、细读解释和表达迁移转成目标。", "目标与课堂产出一一对应。", "cards", "选择自己最需要突破的阅读能力。", "能说明怎样证明自己读懂文本。"],
      ["初读感知", "车站送别：故事发生了什么", "梳理人物、地点、事件与反复出现的背影。", "学生能用一句话概括送别经过。", "split", "默读并圈画人物、地点和关键事件。", "形成准确事件概括。"],
      ["朗读任务", "读准动作：哪些词让画面出现", "让学生在朗读中圈画动作词和停顿处。", "学生能读出动作的节奏和艰难。", "process", "朗读并标出攀、缩、倾。", "能用声音表现动作变化。"],
      ["词句品读", "攀、缩、倾：动作词写出了什么", "把词语、画面与人物处境建立联系。", "每个判断都有原文词句支撑。", "comparison", "给动作词写下画面批注。", "能从动作词解释父亲形象。"],
      ["情境还原", "月台、年龄与衣着让背影更具体", "补足环境、身体和服饰信息，避免孤立解词。", "学生能说明细节如何共同作用。", "split", "把文本信息补进人物画面。", "能还原有依据的画面。"],
      ["结构理解", "为什么文章反复写背影", "理解背影在线索、叙事和情感上的作用。", "学生能区分第一次、重点和回忆中的背影。", "timeline", "标出三处背影并写作用。", "能说明反复出现的结构意义。"],
      ["示范讲解", "精读示范：买橘子的背影", "示范引用、画面还原和情感判断的完整回答。", "题目、步骤、证据和结论完整。", "process", "补全示范回答中缺失的一步。", "能按证据链组织解释。"],
      ["个人批注", "把一句话读深：词句、画面、情感", "让学生独立完成一条证据批注。", "批注必须包含原文和自己的解释。", "checklist", "选择一句完成三栏批注。", "形成可分享的文本证据。"],
      ["同伴交流", "不同朗读为什么会带来不同理解", "用朗读和同伴追问检验解释是否有依据。", "观点必须回扣原文。", "comparison", "两人互读并追问证据。", "能修正空泛感受。"],
      ["即时练习", "用一处动作细节证明父爱", "用短答检查学生能否从细节走向解释。", "作答含引用、画面和情感。", "checklist", "独立完成 80 字短答。", "教师能判断证据链是否完整。"],
      ["表达迁移", "把具体细节写进自己的片段", "迁移克制而具体的细节表达方法。", "作品至少包含动作、情境和不直说的情感。", "split", "写一个 80 字生活片段。", "能用细节而非口号表达情感。"],
      ["典型问题", "只说“父爱伟大”为什么不够", "呈现空泛复述与无证据判断的典型问题。", "学生能找到缺失的文本证据。", "comparison", "给一段空泛回答补上原文依据。", "能说明修改理由。"],
      ["修改反馈", "让解释站得住：补词句，也补画面", "按引用、画面、情感三个标准修订短答。", "学生留下修改痕迹和理由。", "process", "根据标准修改自己的短答。", "能完成一次有依据的修订。"],
      ["离堂评价", "用一句话回答：背影为何难忘", "收集本课阅读方法是否形成的证据。", "离堂回答包含词句与解释。", "closing", "完成离堂题并自评。", "教师可据此安排后续阅读。"],
      ["作业延伸", "带着细节观察生活", "安排朗读巩固和亲情细节写作。", "作业可完成且与本课方法直接相关。", "closing", "选择一项基础和一项拓展任务。", "能把细读方法带回生活。"],
    ];

  return seeds.map((seed, index) => ({
    ...base[Math.min(index, base.length - 1)],
    id: `teacher-full-${physics ? "physics" : "chinese"}-${String(index + 1).padStart(2, "0")}`,
    role: seed[0],
    titleIntent: seed[1],
    pagePurpose: seed[2],
    mustProve: seed[3],
    layoutHint: seed[4] as ContentPlan["slidePlan"][number]["layoutHint"],
    studentAction: seed[5],
    masteryCheck: seed[6],
    priority: index === 0 || index === 1 || index === seeds.length - 1 ? "required" as const : "recommended" as const,
  }));
}

function variableTeacherPlan(base: ContentPlan["slidePlan"], context: ReturnType<typeof teacherCoursewareContext>): ContentPlan["slidePlan"] {
  const confirmed = context?.deckPlan as { status?: string; pages?: Array<Record<string, unknown>> } | undefined;
  if (confirmed?.status === "confirmed" && Array.isArray(confirmed.pages) && confirmed.pages.length >= 1) {
    return confirmed.pages.map((page, index) => {
      const fallback = base[index % base.length];
      return { ...fallback, id: String(page.id || "teacher-confirmed-" + (index + 1)), role: cleanText(page.role, fallback.role), titleIntent: cleanText(page.titleIntent, fallback.titleIntent), pagePurpose: cleanText(page.pagePurpose, fallback.pagePurpose), mustProve: cleanText(page.mustProve, fallback.mustProve), layoutHint: cleanText(page.layoutHint, fallback.layoutHint) as ContentPlan["slidePlan"][number]["layoutHint"], priority: page.priority === "recommended" ? "recommended" as const : fallback.priority, lessonEventId: cleanText(page.lessonEventId) || fallback.lessonEventId };
    });
  }
  if (context?.generationMode === "optimize_existing") return base;
  const fullLesson = fullLessonSamplePlan(base, context);
  if (fullLesson) return fullLesson;
  const strategy = deriveLessonPresentationStrategy({
    duration: context?.duration,
    subject: context?.subject,
    teachingRequirements: context?.teachingRequirements,
    generationMode: context?.generationMode,
  });
  const desired = strategy.recommendedPageCount;
  const compact = [0, 1, 2, 3, 5, 7, 8].map((index) => base[index]).filter(Boolean);
  const planned = desired < base.length ? compact : [...base];
  const extras = [
    ["前置诊断", "先测：哪些前置知识还不稳", "用一个短任务暴露本课所需的前置知识差异，并决定是否需要补讲。", "诊断题、预期表现、补讲条件和进入新知的标准明确。", "cards", "独立完成诊断并标记不确定处。", "教师能依据作答决定补讲哪一个前置点。"],
    ["证据整理", "把观察结果整理成可解释的证据", "把零散观察、文本批注或题目条件整理成可比较的证据单元。", "证据包含条件、现象或原文、初步解释和待验证问题。", "matrix", "小组把材料整理成一张证据表。", "能区分事实、证据和解释。"],
    ["概念边界", "这个方法什么时候不能直接用", "用正例、反例或边界条件检查概念和方法的适用范围。", "边界条件、反例表现和修正策略清楚。", "comparison", "判断两个相近情境的适用性并说明理由。", "能指出方法成立所需的关键条件。"],
    ["示范拆解", "把完整示范拆成可复用的步骤", "将教师示范拆成观察、判断、表达和复查四个可迁移动作。", "每一步都有依据、学生提示和独立尝试入口。", "process", "隐藏一步后补全示范流程。", "能复述步骤并说明每一步的依据。"],
    ["同伴互评", "用标准互相检查学习产出", "提供简短评价量规，让学生根据证据、步骤和表达质量互评。", "评价标准、反馈句式和修改动作完整。", "comparison", "用两条标准给同伴作品反馈。", "能根据标准指出优点和一处可改进点。"],
    ["达标检测", "用最小任务判断是否达到目标", "设计一个不依赖提示的最小达标任务，收集本课核心目标证据。", "题目、作答要求、答案要点和达标阈值明确。", "checklist", "独立完成达标任务并提交理由。", "教师能按阈值判断补救或进入迁移。"],
    ["方法复盘", "回看方法：哪一步最容易出错", "让学生把本课方法压缩成可复述的流程，并标出自己的风险点。", "流程、易错点、复查动作和自我提醒完整。", "timeline", "完成方法流程卡并圈出风险点。", "能用流程卡完成一次自检。"],
    ["情境迁移", "换一个情境，核心方法是否仍然成立", "更换材料、条件或表达场景，检查学生能否迁移而不是记忆原题。", "变化条件、保持不变的方法和迁移结论清楚。", "split", "独立完成新情境任务并写出迁移依据。", "能说明新旧情境之间的对应关系。"],
    ["课后连接", "把课堂方法带到下一次学习", "把本课结论连接到下一章节、下一技能或课后观察任务。", "连接点、课后任务、提交形式和检查标准明确。", "timeline", "选择一个课后任务并写下完成计划。", "能说明课后任务如何继续本课学习。"],
    ["即时检测", "用关键问题检查本阶段理解", "设置短时检测并根据学生回答决定继续讲解还是进入练习。", "检测题、预期回答、判断标准和反馈动作完整。", "checklist", "独立作答后说明判断依据。", "教师能根据作答区分已掌握与需要再教的内容。"],
    ["变式迁移", "改变条件后方法是否仍然成立", "通过变式任务帮助学生辨认方法的适用条件并完成迁移。", "原任务、变化条件、解题方法和迁移结论清楚。", "process", "比较原题与变式，指出不变的方法和改变的条件。", "能在新条件下选择方法并解释原因。"],
    ["纠错再教", "从典型错误回到正确思路", "利用典型错误定位认知障碍，完成解释、修正和二次练习。", "错误表现、错误原因、纠正步骤和再练习答案完整。", "comparison", "修改错误答案并说明自己改变了哪一步。", "能识别错误原因并完成同类任务。"],
    ["拓展应用", "把本课方法用于新的真实情境", "将核心知识迁移到新的学科或生活情境，形成可展示的学习成果。", "新情境、任务要求、学生成果和评价标准明确。", "split", "独立或合作完成一个新情境任务并展示成果。", "能用本课知识解释或解决新问题。"],
    ["离堂评价", "用一项成果证明本课目标已经达成", "通过离堂任务收集学习证据，并明确课后巩固方向。", "离堂题、标准答案、自评标准和后续任务完整。", "closing", "完成离堂题并对照目标进行自评。", "教师能依据离堂结果安排巩固或拓展。"],
  ] as const;
  for (let index = 0; planned.length < desired; index += 1) {
    const item = extras[index % extras.length];
    planned.splice(Math.max(1, planned.length - 1), 0, {
      ...base[Math.min(index + 1, base.length - 1)],
      id: `teacher-variable-${index + 1}`,
      role: item[0],
      titleIntent: item[1],
      pagePurpose: item[2],
      mustProve: item[3],
      layoutHint: item[4],
      studentAction: item[5],
      masteryCheck: item[6],
      priority: "recommended",
    });
  }
  return planned;
}

function lessonEventType(role: string): NonNullable<ContentPlan["lessonPlan"]>["events"][number]["type"] {
  if (/封面|cover/i.test(role)) return "opening";
  if (/目标|goal/i.test(role)) return "objective";
  if (/导入|初读|warm-up|listen/i.test(role)) return "activate";
  if (/示例|例题|model/i.test(role)) return "model";
  if (/探究|合作|pair work|朗读/i.test(role)) return "inquire";
  if (/练习|practice|speaking/i.test(role)) return "practice";
  if (/反馈|纠错|retry|修改/i.test(role)) return "feedback";
  if (/迁移|拓展|应用/i.test(role)) return "transfer";
  if (/检测|评价|assessment/i.test(role)) return "assess";
  if (/总结|作业|closing/i.test(role)) return "closing";
  return "explain";
}

function lessonEventWeight(type: NonNullable<ContentPlan["lessonPlan"]>["events"][number]["type"]) {
  return ({ opening: 1, objective: 2, activate: 4, explain: 7, model: 6, inquire: 7, practice: 6, feedback: 5, transfer: 5, assess: 4, closing: 3 } as const)[type];
}

function allocateLessonMinutes(weights: number[], totalMinutes: number) {
  const minimum = weights.map(() => 1);
  const remaining = Math.max(0, totalMinutes - minimum.length);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const raw = weights.map((weight) => weight / weightTotal * remaining);
  const allocated = raw.map((value, index) => minimum[index] + Math.floor(value));
  let leftover = totalMinutes - allocated.reduce((sum, value) => sum + value, 0);
  raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
    .forEach(({ index }) => { if (leftover > 0) { allocated[index] += 1; leftover -= 1; } });
  return allocated;
}

type LessonRouteSeed = {
  type: NonNullable<ContentPlan["lessonPlan"]>["events"][number]["type"];
  title: string;
  weight: number;
  teacherAction: string;
  studentAction: string;
  expectedResponse: string;
  evidenceOfLearning: string;
  fallbackAction: string;
};

function teacherLessonRoute(context: ReturnType<typeof teacherCoursewareContext>): LessonRouteSeed[] {
  const subject = cleanText(context?.subject, "课程");
  const topic = cleanText(context?.topic, "本课主题");
  const equipment = cleanText(context?.classroomConstraints?.equipment);
  const noExperimentEquipment = /无|没有|不可用|仅投影/.test(equipment);
  if (/物理/.test(subject)) {
    return [
      { type: "opening", title: "现象导入与问题提出", weight: 3, teacherAction: `呈现与“${topic}”有关的可观察现象，只提出需要解释的矛盾，不先给结论。`, studentAction: "独立观察并记录现象、变化条件和自己的初步解释。", expectedResponse: "学生能区分观察到的事实与尚待验证的解释。", evidenceOfLearning: "一条现象记录和一个可研究问题。", fallbackAction: "缩减变量，只保留一组对照现象并重新提问。" },
      { type: "inquire", title: "实验观察与证据记录", weight: 8, teacherAction: noExperimentEquipment ? "使用预先准备的实验记录或等价动态演示，明确变量、观察量和记录方式，不把结论直接写在材料中。" : "组织实验或等价演示，明确自变量、观察量和记录方式。", studentAction: "按条件完成观察，把不同状态的结果记录在同一张证据表中。", expectedResponse: "学生能用完整记录说明条件变化与观察结果的对应关系。", evidenceOfLearning: "包含条件、现象和方向信息的实验记录。", fallbackAction: "提供半结构化记录表，保留一个条件由学生独立补全。" },
      { type: "explain", title: "从证据建构物理规律", weight: 8, teacherAction: "引导学生比较多组证据，提炼共同关系并检查表述边界。", studentAction: "比较实验记录，提出规律表述并用反例检查。", expectedResponse: "学生能从证据概括规律，并说明规律针对的是哪一种变化。", evidenceOfLearning: "一条包含条件、关系和边界的规律表述。", fallbackAction: "回到两组最典型证据，用填空句式帮助学生完成第一次概括。" },
      { type: "model", title: "方向判断方法示范", weight: 7, teacherAction: "用一个典型情境示范判断链，每一步都说明依据。", studentAction: "补全判断链中的关键一步，并复述每一步为什么成立。", expectedResponse: "学生能按变化、作用、方向的顺序完成判断。", evidenceOfLearning: "完整的分步判断链和对应依据。", fallbackAction: "隐藏最终答案，只保留步骤提示并用更简单情境再示范一次。" },
      { type: "practice", title: "独立判断与同伴解释", weight: 7, teacherAction: "提供条件发生变化的任务，先独立作答再组织同伴解释。", studentAction: "独立完成判断，用学科语言向同伴解释，并核对差异。", expectedResponse: "学生能在新条件下独立使用判断方法。", evidenceOfLearning: "个人答案、判断依据和同伴修订痕迹。", fallbackAction: "把任务拆成条件判断和方向判断两小步，完成后再合并。" },
      { type: "feedback", title: "典型错误纠正与再练", weight: 6, teacherAction: "呈现具有代表性的错误思路，让学生定位错误发生在哪一步。", studentAction: "标出错误步骤，说明原因并完成一道同类再练。", expectedResponse: "学生能区分规律本身、变化方向和观察方向。", evidenceOfLearning: "错误诊断、修正理由和再练答案。", fallbackAction: "让学生对照判断流程逐项勾选，定位第一个不成立的步骤。" },
      { type: "closing", title: "迁移检测与课堂收束", weight: 4, teacherAction: "用一个未讲过的短任务检查迁移，并回扣驱动问题。", studentAction: "完成离堂任务并用一句话总结本课方法。", expectedResponse: "学生能独立迁移方法并说明核心规律。", evidenceOfLearning: "离堂任务与一分钟总结。", fallbackAction: "收集作答作为下节课分组依据，不在结尾继续扩讲。" },
    ];
  }
  if (/语文/.test(subject)) {
    return [
      { type: "activate", title: "初读与整体感知", weight: 5, teacherAction: `组织学生带着核心问题初读“${topic}”，只梳理人物、事件和情感线索。`, studentAction: "默读或朗读文本，圈画关键人物、事件和反复出现的线索。", expectedResponse: "学生能用简洁语言概括文本写了什么，并提出阅读疑问。", evidenceOfLearning: "事件概括和一条初读问题。", fallbackAction: "提供人物、地点、事件三个提示帮助学生完成概括。" },
      { type: "inquire", title: "定位关键语段与文本证据", weight: 7, teacherAction: "围绕驱动问题要求学生回到原文定位证据，不接受脱离文本的感受。", studentAction: "圈画关键语句，标注能够支持判断的词语和细节。", expectedResponse: "学生能引用准确文本支持自己的初步理解。", evidenceOfLearning: "带有原文词句的证据批注。", fallbackAction: "限定一个自然段，并用示例区分观点和文本证据。" },
      { type: "explain", title: "语言细读与人物理解", weight: 9, teacherAction: "抓住动作、外貌、语气或反复等语言现象，组织逐词替换和语境比较。", studentAction: "比较关键词替换前后的表达差异，形成词句、画面、人物理解的证据链。", expectedResponse: "学生能从具体语言说明人物形象和情感，不停留在空泛评价。", evidenceOfLearning: "词句、画面、人物或情感四要素批注。", fallbackAction: "教师示范一个关键词，学生按同一方法完成第二个关键词。" },
      { type: "model", title: "文本解释方法示范", weight: 6, teacherAction: "示范如何把引用、画面还原和情感判断组织成完整回答。", studentAction: "补全示范回答缺失的一环，并归纳可迁移的表达结构。", expectedResponse: "学生能用文本证据而不是故事复述完成解释。", evidenceOfLearning: "一段结构完整的文本解释。", fallbackAction: "提供句式支架，逐步撤掉提示。" },
      { type: "inquire", title: "朗读、交流与理解修正", weight: 6, teacherAction: "通过朗读和同伴交流检验语气、节奏与理解是否一致。", studentAction: "根据自己的理解设计重音和停顿，并用文本依据解释。", expectedResponse: "学生能把朗读处理和文本理解对应起来。", evidenceOfLearning: "朗读表现和基于原文的说明。", fallbackAction: "先比较两种教师示范，再让学生选择并说明理由。" },
      { type: "transfer", title: "表达迁移", weight: 6, teacherAction: "把本课的细节表达方法迁移到一个短写作或口头表达任务。", studentAction: "使用具体动作或语言细节完成短表达，并标出使用的方法。", expectedResponse: "学生能在新语境中使用本课学到的表达方法。", evidenceOfLearning: "包含可辨认细节的迁移作品。", fallbackAction: "提供生活情境和动作词库，降低选材难度。" },
      { type: "feedback", title: "反馈修改与课堂收束", weight: 4, teacherAction: "按文本证据、解释完整和表达具体三个标准反馈，回扣核心问题。", studentAction: "依据标准修改一次，并完成离堂自评。", expectedResponse: "学生能指出自己的修改依据并概括本课阅读方法。", evidenceOfLearning: "修改前后对照和离堂自评。", fallbackAction: "只聚焦一项标准完成有效修改，其余作为课后任务。" },
    ];
  }
  return [
    { type: "opening", title: "进入问题", weight: 4, teacherAction: `用与“${topic}”直接相关的任务激活已有认识。`, studentAction: "表达已有认识并提出待解决问题。", expectedResponse: "学生能说明已知与未知。", evidenceOfLearning: "一条已有认识和一个问题。", fallbackAction: "用更具体的示例缩小问题范围。" },
    { type: "explain", title: "建构核心理解", weight: 9, teacherAction: "组织材料、示例或讲解，突出关键关系与适用边界。", studentAction: "加工信息并用自己的话解释核心内容。", expectedResponse: "学生能准确复述并解释核心知识。", evidenceOfLearning: "结构化笔记或概念解释。", fallbackAction: "增加一个正例和反例帮助比较。" },
    { type: "model", title: "方法示范", weight: 7, teacherAction: "示范从问题到结论的完整过程并说明依据。", studentAction: "补全步骤并复述方法。", expectedResponse: "学生能说出方法步骤与依据。", evidenceOfLearning: "完整的方法链。", fallbackAction: "提供步骤支架后再次示范。" },
    { type: "inquire", title: "合作探究", weight: 7, teacherAction: "组织有明确产出的观察、讨论或操作任务。", studentAction: "合作完成任务并提交可检查成果。", expectedResponse: "学生能用证据说明小组结论。", evidenceOfLearning: "小组成果和证据说明。", fallbackAction: "缩小任务并明确分工。" },
    { type: "practice", title: "独立练习", weight: 7, teacherAction: "安排与目标直接对应的独立任务。", studentAction: "独立作答并标记不确定处。", expectedResponse: "学生能独立完成基础应用。", evidenceOfLearning: "个人作答。", fallbackAction: "把任务拆成两个小步骤。" },
    { type: "feedback", title: "反馈与修正", weight: 6, teacherAction: "根据典型作答组织诊断和二次练习。", studentAction: "定位错误并完成修正。", expectedResponse: "学生能说明错误原因。", evidenceOfLearning: "修正答案和理由。", fallbackAction: "提供对照标准逐项检查。" },
    { type: "closing", title: "迁移与收束", weight: 5, teacherAction: "用短任务检查迁移并回扣目标。", studentAction: "完成离堂任务并自评。", expectedResponse: "学生能概括方法并完成迁移。", evidenceOfLearning: "离堂任务。", fallbackAction: "记录结果并安排分层课后任务。" },
  ];
}

function buildTeacherLessonPlan(context: ReturnType<typeof teacherCoursewareContext>, slides: ContentPlan["slidePlan"]): NonNullable<ContentPlan["lessonPlan"]> {
  const totalMinutes = Math.max(slides.length, Number(String(context?.duration || "").match(/\d{1,3}/)?.[0] || 45));
  const confirmedPlan = context?.deckPlan as { status?: string; lessonBlueprint?: NonNullable<ContentPlan["lessonBlueprint"]> } | undefined;
  const confirmedLessonPlan = confirmedPlan?.lessonBlueprint?.lessonPlan;
  if (confirmedPlan?.status === "confirmed" && confirmedLessonPlan?.events?.length) {
    const confirmedEvents = confirmedLessonPlan.events.map((event) => ({ ...event, slideIds: [...event.slideIds] }));
    const eventBySlideId = new Map(confirmedEvents.flatMap((event) => event.slideIds.map((slideId) => [slideId, event.id] as const)));
    if (confirmedEvents.reduce((sum, event) => sum + event.durationMinutes, 0) === totalMinutes && slides.every((slide) => eventBySlideId.has(slide.id))) {
      slides.forEach((slide) => { slide.lessonEventId = eventBySlideId.get(slide.id); });
      return { totalMinutes, events: confirmedEvents };
    }
  }
  const assessmentFocus = cleanText(context?.classroomConstraints?.assessmentFocus, "balanced");
  const route = teacherLessonRoute(context).map((event) => ({
    ...event,
    weight: assessmentFocus === "exam_practice"
      ? event.weight + (["practice", "feedback", "assess"].includes(event.type) ? 2 : ["inquire", "activate"].includes(event.type) ? -1 : 0)
      : assessmentFocus === "conceptual_understanding"
        ? event.weight + (["inquire", "explain", "model"].includes(event.type) ? 1 : event.type === "practice" ? -1 : 0)
        : event.weight,
  }));
  const durations = allocateLessonMinutes(route.map((event) => event.weight || lessonEventWeight(event.type)), totalMinutes);
  const events = route.map((event, index) => ({
      id: `lesson-event-${String(index + 1).padStart(2, "0")}-${event.type}`,
      type: event.type,
      title: event.title,
      durationMinutes: durations[index],
      teacherAction: event.teacherAction,
      studentAction: event.studentAction,
      expectedResponse: event.expectedResponse,
      evidenceOfLearning: event.evidenceOfLearning,
      fallbackAction: event.fallbackAction,
      slideIds: [] as string[],
  }));
  let previousEventIndex = 0;
  slides.forEach((slide, slideIndex) => {
    const type = lessonEventType(`${slide.role} ${slide.titleIntent}`);
    const proportionalIndex = Math.round(slideIndex * (events.length - 1) / Math.max(1, slides.length - 1));
    const matching = events
      .map((event, index) => ({ event, index }))
      .filter((item) => item.event.type === type && item.index >= previousEventIndex)
      .sort((left, right) => Math.abs(left.index - proportionalIndex) - Math.abs(right.index - proportionalIndex));
    const eventIndex = Math.min(events.length - 1, Math.max(previousEventIndex, matching[0]?.index ?? proportionalIndex));
    events[eventIndex].slideIds.push(slide.id);
    slide.lessonEventId = events[eventIndex].id;
    previousEventIndex = eventIndex;
  });
  return { totalMinutes, events };
}

function buildTeacherLessonBlueprint(
  planId: string,
  context: ReturnType<typeof teacherCoursewareContext>,
  slides: ContentPlan["slidePlan"],
  lessonPlan: NonNullable<ContentPlan["lessonPlan"]>,
): NonNullable<ContentPlan["lessonBlueprint"]> {
  const confirmedPlan = context?.deckPlan as { status?: string; lessonBlueprint?: NonNullable<ContentPlan["lessonBlueprint"]> } | undefined;
  if (confirmedPlan?.status === "confirmed" && confirmedPlan.lessonBlueprint) {
    return {
      ...confirmedPlan.lessonBlueprint,
      blueprintId: `${planId}-lesson-blueprint`,
      planId,
      status: "teacher_confirmed",
      lessonPlan,
      presentationPlan: {
        ...confirmedPlan.lessonBlueprint.presentationPlan,
        recommendedPageCount: slides.length,
      },
    };
  }
  const subject = cleanText(context?.subject, "课程");
  const topic = cleanText(context?.topic, "本课主题");
  const isPhysics = /物理/.test(subject);
  const isChinese = /语文/.test(subject);
  const isMath = /数学/.test(subject);
  const learnerProfile = context?.learnerProfile || {};
  const classroomConstraints = context?.classroomConstraints || {};
  const teacherBaseline = cleanText(learnerProfile.baseline);
  const teacherDifficulties = cleanText(learnerProfile.commonDifficulties);
  const classSize = Number(learnerProfile.classSize || 0);
  const equipment = cleanText(classroomConstraints.equipment);
  const presentationStrategy = deriveLessonPresentationStrategy({
    duration: context?.duration,
    subject,
    teachingRequirements: context?.teachingRequirements,
    generationMode: context?.generationMode,
  });
  const architecture = isPhysics ? "experiment_inquiry" : isChinese ? "close_reading" : isMath ? "concept_building" : "general_lesson";
  const architectureReason = isPhysics
    ? "本课的理解应从现象和实验记录出发，再建构规律并完成方向判断，不能先展示结论。"
    : isChinese
      ? "本课必须以原文词句为证据，通过细读、朗读和表达迁移形成理解，不能停留在故事复述。"
      : isMath
        ? "本课需要从已有知识和表征活动进入概念，再用示例、练习和反馈完成建构。"
        : "本课采用问题进入、理解建构、方法示范、练习反馈和迁移收束的完整课堂闭环。";
  const objectives = isPhysics
    ? [
        { id: "objective-evidence", statement: `能从实验现象和记录中概括“${topic}”的核心规律。`, evidence: "实验记录与规律表述", successCriteria: "表述包含变化、作用和适用边界。" },
        { id: "objective-method", statement: "能按完整判断链确定物理方向并说明每一步依据。", evidence: "独立判断题与口头解释", successCriteria: "步骤完整，观察方向与物理规律不混淆。" },
        { id: "objective-transfer", statement: "能在条件改变后迁移方法并诊断典型错误。", evidence: "变式任务和纠错再练", successCriteria: "答案正确且能指出错误发生的步骤。" },
      ]
    : isChinese
      ? [
          { id: "objective-evidence", statement: `能围绕“${topic}”定位并引用关键文本证据。`, evidence: "原文批注与引用", successCriteria: "引用准确并与观点直接相关。" },
          { id: "objective-reading", statement: "能从具体词句、画面和语境解释人物与情感。", evidence: "细读回答和朗读说明", successCriteria: "解释不空泛，形成词句到理解的证据链。" },
          { id: "objective-expression", statement: "能迁移文本的细节表达方法完成短表达。", evidence: "迁移作品与修改痕迹", successCriteria: "作品包含具体细节并能说明表达作用。" },
        ]
      : [
          { id: "objective-understanding", statement: `能解释“${topic}”的核心知识与适用条件。`, evidence: "概念解释或结构化笔记", successCriteria: "表述准确且包含关键关系。" },
          { id: "objective-application", statement: "能独立完成与本课目标对应的基础和迁移任务。", evidence: "个人作答与离堂任务", successCriteria: "答案正确并能说明依据。" },
        ];
  const keyDifficulties = isPhysics
    ? [{ focus: "从现象归纳规律而不是背诵结论", reason: "学生容易把阻碍变化误记为方向永远相反。", breakthrough: "用四种状态证据表比较磁通量变化、感应磁场和电流方向。" }]
    : isChinese
      ? [{ focus: "用文本证据解释人物和情感", reason: "学生容易复述故事或只写父爱、感动等空泛结论。", breakthrough: "使用词句、画面、语境、情感四步细读，并通过朗读和改写复查。" }]
      : [{ focus: `形成对“${topic}”的可迁移理解`, reason: "学生可能记住结论但不能说明依据或应用条件。", breakthrough: "用示范、独立练习、反馈和变式任务形成闭环。" }];
  return {
    blueprintId: `${planId}-lesson-blueprint`,
    planId,
    status: "teacher_confirmation_required",
    architecture,
    architectureReason,
    lessonPromise: isPhysics
      ? `学生不是背诵“${topic}”，而是能从证据建构规律并独立完成方向判断。`
      : isChinese
        ? `学生不是复述“${topic}”的故事，而是能用原文细节解释人物情感并迁移表达方法。`
        : `学生能理解“${topic}”、说明依据并完成一次独立迁移。`,
    drivingQuestion: isPhysics
      ? "变化发生时，新的物理作用为什么这样响应，我们怎样用证据判断方向？"
      : isChinese
        ? "作者为什么选择这些具体词句和细节，它们怎样让人物与情感变得可见？"
        : `怎样证明我们真正理解并能使用“${topic}”？`,
    learnerAssumptions: [
      teacherBaseline || (isPhysics ? "学生具备本节所需的基础磁场与磁通量概念。" : isChinese ? "学生已经通读课文并能概括主要事件。" : "学生具备本课所需的基本前置知识。"),
      teacherDifficulties || (isPhysics ? "学生能使用右手螺旋定则，但观察方向可能混淆。" : isChinese ? "学生能够圈画词句，但文本证据与情感解释之间可能缺少联系。" : "常见困难尚待教师确认。"),
      classSize > 0 ? `本课按 ${classSize} 人班级组织课堂活动。` : "班级规模尚待教师确认。",
    ],
    keyDifficulties,
    objectives,
    lessonPlan,
    presentationPlan: {
      strategyVersion: presentationStrategy.version,
      recommendedPageCount: slides.length,
      minimumPageCount: presentationStrategy.minimumPageCount,
      maximumPageCount: presentationStrategy.maximumPageCount,
      drivers: presentationStrategy.drivers,
      rationale: `当前 ${slides.length} 页由 ${lessonPlan.events.length} 个课堂事件、${presentationStrategy.durationMinutes} 分钟课时及教学任务复杂度共同派生；课堂事件可以使用多页或不使用投影，页数不再代替课时完整性。`,
      screenPrinciples: ["学生当前要观察、思考或完成的任务上屏。", "证据、步骤和反馈按课堂节奏分步呈现。", "答案与结论不得早于学生任务出现。"],
      teacherOnlyPrinciples: ["追问、预期回答、备用动作和时间提醒保留在教师端。", "教材依据不足或学情未知的假设必须要求教师确认。"],
    },
    teacherDecisions: [
      { id: "confirm-learner-baseline", question: "当前班级的前置知识和常见困难是否符合以上假设？", assumption: teacherBaseline || teacherDifficulties ? "已使用教师填写的学情，仍建议生成前复核。" : "暂按同年级中等基础班设计。", requiredBeforeGeneration: !teacherBaseline || !teacherDifficulties },
      { id: "confirm-classroom-condition", question: isPhysics ? "课堂是否具备演示实验或等价观察条件？" : "是否需要指定朗读、讨论或写作的组织方式？", assumption: equipment || (isPhysics ? "暂按教师可完成一次演示实验设计。" : "暂按个人批注、同伴交流和一次短写作设计。"), requiredBeforeGeneration: isPhysics ? !equipment : false },
      { id: "confirm-source-basis", question: "教材版本、章节和本课文本或例题范围是否准确？", assumption: context?.textbook || "暂以教师填写的教材与章节为准。", requiredBeforeGeneration: !context?.textbook || !context?.chapter },
    ],
  };
}

function buildTeacherDeliveryPack(planId: string, context: ReturnType<typeof teacherCoursewareContext>, slides: ContentPlan["slidePlan"], lessonPlan: NonNullable<ContentPlan["lessonPlan"]>): NonNullable<ContentPlan["deliveryPack"]> {
  const topic = cleanText(context?.topic, "本课主题");
  const practiceEvents = lessonPlan.events.filter((event) => ["practice", "feedback", "transfer", "assess"].includes(event.type));
  return {
    packId: `${planId}-teacher-pack`,
    planId,
    readiness: "ready_for_teacher_review",
    teacherNotes: slides.map((slide) => {
      const event = lessonPlan.events.find((item) => item.id === slide.lessonEventId) || lessonPlan.events[0];
      return {
        pageId: slide.id,
        lessonEventId: event.id,
        title: slide.titleIntent,
        durationMinutes: event.durationMinutes,
        teacherAction: event.teacherAction,
        studentAction: cleanText(slide.studentAction, event.studentAction),
        expectedResponse: cleanText(slide.masteryCheck, event.expectedResponse),
        fallbackAction: event.fallbackAction,
        slideIds: [slide.id],
        prompt: `追问：${cleanText(slide.mustProve, event.expectedResponse)}`,
      };
    }),
    answerKey: practiceEvents.map((event) => ({
      eventId: event.id,
      slideIds: event.slideIds,
      answer: event.expectedResponse,
      scoringCriteria: `依据${event.evidenceOfLearning}判断；答案应有证据、步骤或文本依据。`,
      sourceStatus: "derived_from_plan" as const,
    })),
    boardPlan: {
      title: `${topic}板书骨架`,
      columns: [
        { heading: "问题与已有认识", items: slides.slice(0, 3).map((slide) => slide.titleIntent) },
        { heading: "核心知识与方法", items: slides.slice(3, Math.max(4, slides.length - 2)).map((slide) => slide.titleIntent) },
        { heading: "练习、反馈与迁移", items: slides.slice(-2).map((slide) => slide.titleIntent) },
      ],
    },
    homework: [
      { level: "基础", task: `完成教材中与“${topic}”直接对应的基础练习，并订正课堂错题。`, successCriteria: "步骤或证据完整，答案经过自检。" },
      { level: "提高", task: `用本课方法再完成一道“${topic}”变式题，写出关键判断依据。`, successCriteria: "能说明条件变化后哪些方法保持不变。" },
      { level: "迁移", task: `选择一个真实情境，说明“${topic}”如何在其中体现，并提交一段解释或一张证据卡。`, successCriteria: "情境、知识依据和结论相互对应。" },
    ],
  };
}

function buildPlan(input: ContentPlannerInput, playbookType: ContentPlanPPTType): ContentPlan {
  const playbook = getScenarioPlaybook(playbookType);
  const teacherContext = teacherCoursewareContext(input);
  const audience = inferAudience(input.prompt, playbook, input.typeDetection?.audience);
  const decisionGoal = inferDecisionGoal(input.prompt, playbook, input.typeDetection?.goal);
  const evidenceNeeds = evidenceNeedsFor(playbook, input.research, input.uploadedAssets);
  const isFunctionMathTopic = /函数|单调|解析式|坐标图|斜率|截距/.test(teacherContext?.topic || "");
  if (teacherContext && teacherContext.subject === "数学" && isFunctionMathTopic) {
    const topic = teacherContext.topic;
    const slidePlan = variableTeacherPlan(teacherModeSlidePlan(topic, teacherContext.generationMode), teacherContext);
    const confirmedPlanId = cleanText((teacherContext.deckPlan as { planId?: string } | undefined)?.planId);
    const planId = confirmedPlanId || `content-plan-teacher-math-${Date.now()}`;
    const lessonPlan = buildTeacherLessonPlan(teacherContext, slidePlan);
    const lessonBlueprint = buildTeacherLessonBlueprint(planId, teacherContext, slidePlan, lessonPlan);
    const deliveryPack = buildTeacherDeliveryPack(planId, teacherContext, slidePlan, lessonPlan);
    return {
      planId,
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
      slidePlan,
      qualityChecklist: ["课堂事件与动态页面引用完整", "每页一个核心任务", "数学图形可编辑", "有学生输出", "有真实练习和反馈", "无商务语义"],
      styleDirection: "teacher_math_science_v1 / teaching_grid / rational_teal",
      layoutDirection: "严格按TM01-TM09锁定教学版式，先角色、再视觉形式、再版式。",
      riskWarnings: ["坐标图、表格和参数对比不得退化为普通卡片", "内部字段不得进入可见正文", "练习必须有真实题目"],
      generationWarnings: ["数学核心表达必须使用可编辑形状、文本和表格。", "未命中锁定版式时标记LAYOUT_GAP。"],
      playbookId: "teacher_math_science_v1",
      teachingObjectives: ["理解核心概念与条件", "建立表格、解析式和图像的联系", "解释参数变化", "完成基础应用"],
      teachingChain: ["前置知识", "概念", "多表征", "参数", "例题", "练习", "总结"],
      lessonBlueprint,
      lessonPlan,
      deliveryPack,
      teacherContext,
      createdAt: new Date().toISOString()
    };
  }
  if (teacherContext) {
    const topic = teacherContext.topic;
    const subject = teacherContext.subject || "课程";
    const requirements = teacherContext.teachingRequirements;
    const slidePlan = variableTeacherPlan(teacherGeneralSlidePlan(topic, subject), teacherContext);
    const confirmedPlanId = cleanText((teacherContext.deckPlan as { planId?: string } | undefined)?.planId);
    const planId = confirmedPlanId || `content-plan-teacher-general-${Date.now()}`;
    const lessonPlan = buildTeacherLessonPlan(teacherContext, slidePlan);
    const lessonBlueprint = buildTeacherLessonBlueprint(planId, teacherContext, slidePlan, lessonPlan);
    const deliveryPack = buildTeacherDeliveryPack(planId, teacherContext, slidePlan, lessonPlan);
    return {
      planId,
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
      slidePlan,
      qualityChecklist: ["课堂蓝图与页面引用完整", "每页一个教学任务", "有学生行动", "有练习和反馈", "无商务语义"],
      styleDirection: `teacher_general_v1 / ${teacherContext.visualMode || "teaching_grid"} / ${teacherContext.theme || "book_blue"}`,
      layoutDirection: "按教学角色变化版式，保证讲解、活动、练习和反馈的节奏清楚。",
      riskWarnings: ["不得把课件写成商业汇报", "课堂活动必须有明确产出", "练习与反馈必须对应学习目标"],
      generationWarnings: ["事实性内容以教师教材和输入为准。", "证据不足时不得虚构来源。"],
      playbookId: "teacher_general_v1",
      teachingObjectives: ["理解核心知识", "掌握基本方法", "完成课堂任务", "根据反馈修正理解"],
      teachingChain: ["情境", "目标", "讲解", "示例", "探究", "练习", "反馈", "总结"],
      lessonBlueprint,
      lessonPlan,
      deliveryPack,
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
  const missing = repaired.teacherContext ? [] : playbook.requiredSlideRoles.filter((roleSeed) => !existingText.includes(roleSeed.role) && !existingText.includes(roleSeed.titleIntent));
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
