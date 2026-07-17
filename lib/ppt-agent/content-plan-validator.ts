import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import { getScenarioPlaybook } from "@/lib/ppt-agent/scenario-playbooks";
import { cleanText } from "@/lib/text-sanitize";
import { deriveLessonPresentationStrategy } from "@/lib/ppt-agent/lesson-presentation-strategy";

export type ContentPlanValidationIssue = {
  id: string;
  field: string;
  message: string;
  blocking: boolean;
};

export type ContentPlanValidationResult = {
  valid: boolean;
  score: number;
  issues: ContentPlanValidationIssue[];
  blockingIssues: ContentPlanValidationIssue[];
  suggestedFixes: string[];
};

const MOJIBAKE_PATTERN = /[\uFFFD]|[脙脗芒鈧撁ぢ掆€斆瀅]/;
const QUESTION_MARK_PLACEHOLDER_PATTERN = /\?{3,}/;
const INTERNAL_FIELD_PATTERN = /\b(day-route|hero-image|image-strip|tips-grid|stat-card|source-note|route-card|bar-chart|donut-chart|visualPrompt|pageIntent|evidenceBlockIds|sourceIds|debug|mock|placeholder|generated visual)\b/i;
const UNIVERSAL_TEMPLATE_PATTERN = /背景[、，,]\s*意义[、，,]\s*方案[、，,]\s*总结|背景意义方案总结/;

function visiblePlanText(plan: ContentPlan) {
  return cleanText([
    plan.userIntent,
    plan.audience,
    plan.decisionGoal,
    plan.coreMessage,
    plan.narrativeStrategy,
    ...plan.contentScope.include,
    ...plan.contentScope.exclude,
    ...plan.contentScope.avoid,
    ...plan.evidenceNeeds,
    ...plan.keyQuestions,
    ...plan.qualityChecklist,
    ...plan.riskWarnings,
    ...plan.generationWarnings,
    plan.lessonBlueprint?.architectureReason,
    plan.lessonBlueprint?.lessonPromise,
    plan.lessonBlueprint?.drivingQuestion,
    ...(plan.lessonBlueprint?.learnerAssumptions || []),
    ...(plan.lessonBlueprint?.keyDifficulties || []).flatMap((item) => [item.focus, item.reason, item.breakthrough]),
    ...(plan.lessonBlueprint?.objectives || []).flatMap((item) => [item.statement, item.evidence, item.successCriteria]),
    ...(plan.lessonBlueprint?.teacherDecisions || []).flatMap((item) => [item.question, item.assumption]),
    ...(plan.lessonPlan?.events || []).flatMap((event) => [event.title, event.teacherAction, event.studentAction, event.expectedResponse, event.evidenceOfLearning, event.fallbackAction]),
    ...(plan.deliveryPack?.teacherNotes || []).flatMap((note) => [note.title, note.teacherAction, note.studentAction, note.expectedResponse, note.fallbackAction, note.prompt]),
    ...(plan.deliveryPack?.answerKey || []).flatMap((answer) => [answer.answer, answer.scoringCriteria]),
    ...(plan.deliveryPack?.boardPlan.columns || []).flatMap((column) => [column.heading, ...column.items]),
    ...(plan.deliveryPack?.homework || []).flatMap((item) => [item.level, item.task, item.successCriteria]),
    ...plan.slidePlan.flatMap((slide) => [
      slide.role,
      slide.titleIntent,
      slide.pagePurpose,
      slide.mustProve,
      ...slide.suggestedEvidence,
      ...slide.avoid
    ])
  ].join("\n"));
}

function generatedStructureText(plan: ContentPlan) {
  return cleanText([
    plan.userIntent,
    plan.decisionGoal,
    plan.coreMessage,
    plan.narrativeStrategy,
    ...plan.keyQuestions,
    ...plan.qualityChecklist,
    ...plan.slidePlan.flatMap((slide) => [
      slide.role,
      slide.titleIntent,
      slide.pagePurpose,
      slide.mustProve,
      ...slide.suggestedEvidence
    ])
  ].join("\n"));
}

function hasValue(value: unknown) {
  return typeof value === "string" ? cleanText(value).length >= 2 : Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function push(issues: ContentPlanValidationIssue[], id: string, field: string, message: string, blocking = true) {
  issues.push({ id, field, message, blocking });
}

function roleCovered(text: string, role: string, titleIntent: string) {
  return text.includes(role) || text.includes(titleIntent) || titleIntent.includes(role);
}

export function validateContentPlan(plan: ContentPlan): ContentPlanValidationResult {
  const issues: ContentPlanValidationIssue[] = [];
  const playbook = getScenarioPlaybook(plan.pptType);
  const text = visiblePlanText(plan);
  const structureText = generatedStructureText(plan);

  if (!hasValue(plan.userIntent)) push(issues, "missing-user-intent", "userIntent", "缺少用户真实意图。");
  if (!hasValue(plan.audience)) push(issues, "missing-audience", "audience", "缺少目标受众。");
  if (!hasValue(plan.decisionGoal)) push(issues, "missing-decision-goal", "decisionGoal", "缺少决策目标。");
  if (!hasValue(plan.coreMessage)) push(issues, "missing-core-message", "coreMessage", "缺少一句话核心观点。");
  if (!hasValue(plan.narrativeStrategy)) push(issues, "missing-narrative", "narrativeStrategy", "缺少叙事策略。");
  if (!plan.contentScope?.include?.length || !plan.contentScope.exclude?.length || !plan.contentScope.avoid?.length) {
    push(issues, "missing-content-scope", "contentScope", "内容边界 include/exclude/avoid 不完整。");
  }
  if (!plan.evidenceNeeds?.length) push(issues, "missing-evidence-needs", "evidenceNeeds", "缺少证据需求。");
  if (!plan.keyQuestions?.length) push(issues, "missing-key-questions", "keyQuestions", "缺少关键问题。");
  if (!plan.qualityChecklist?.length) push(issues, "missing-quality-checklist", "qualityChecklist", "缺少质量检查清单。");
  if (!plan.riskWarnings?.length) push(issues, "missing-risk-warnings", "riskWarnings", "缺少风险提醒。");

  if (plan.teacherContext) {
    const presentationStrategy = deriveLessonPresentationStrategy({
      duration: plan.teacherContext.duration,
      subject: plan.teacherContext.subject,
      teachingRequirements: plan.teacherContext.teachingRequirements,
      generationMode: plan.teacherContext.generationMode,
    });
    if (plan.teacherContext.generationMode !== "optimize_existing" && plan.slidePlan.length < presentationStrategy.minimumPageCount) {
      push(issues, "teacher-deck-too-thin", "slidePlan", `${presentationStrategy.durationMinutes} 分钟课堂至少需要 ${presentationStrategy.minimumPageCount} 个有效页面角色；当前 ${plan.slidePlan.length} 页无法覆盖完整教学闭环。`);
    }
    if (plan.teacherContext.generationMode !== "optimize_existing" && plan.slidePlan.length > presentationStrategy.maximumPageCount) {
      push(issues, "teacher-deck-too-dense", "slidePlan", `${presentationStrategy.durationMinutes} 分钟课堂建议不超过 ${presentationStrategy.maximumPageCount} 页；当前 ${plan.slidePlan.length} 页会挤压学生活动时间。`);
    }
    const instructionalSlides = plan.slidePlan.filter((slide) => !/封面|课程信息|学习目标|教学目标/.test(`${slide.role} ${slide.titleIntent}`));
    const unactionableSlides = instructionalSlides.filter((slide) => !hasValue(slide.studentAction) || !hasValue(slide.masteryCheck));
    if (unactionableSlides.length) {
      push(issues, "teacher-page-not-actionable", "slidePlan", `以下页面没有明确的学生行动或达成证据：${unactionableSlides.map((slide) => slide.titleIntent || slide.role).join("、")}。`);
    }
    const repeatedPageIntents = new Set<string>();
    const seenPageIntents = new Set<string>();
    instructionalSlides.forEach((slide) => {
      const signature = cleanText(`${slide.role}|${slide.titleIntent}|${slide.pagePurpose}`).replace(/\s+/g, "");
      if (seenPageIntents.has(signature)) repeatedPageIntents.add(slide.titleIntent || slide.role);
      seenPageIntents.add(signature);
    });
    if (repeatedPageIntents.size) {
      push(issues, "teacher-page-intent-duplicate", "slidePlan", `出现重复教学页面：${[...repeatedPageIntents].join("、")}；应合并或改成不同的学习任务。`);
    }
    const blueprint = plan.lessonBlueprint;
    if (!blueprint) {
      push(issues, "missing-lesson-blueprint", "lessonBlueprint", "教师课件缺少独立于页面目录的课堂蓝图。 ");
    } else {
      if (blueprint.planId !== plan.planId) push(issues, "lesson-blueprint-plan-mismatch", "lessonBlueprint.planId", "课堂蓝图与内容计划版本不一致。 ");
      if (!hasValue(blueprint.architectureReason) || !hasValue(blueprint.lessonPromise) || !hasValue(blueprint.drivingQuestion)) push(issues, "incomplete-lesson-blueprint", "lessonBlueprint", "课堂蓝图缺少课型依据、课堂承诺或驱动问题。 ");
      if (!blueprint.objectives?.length || blueprint.objectives.some((objective) => ![objective.statement, objective.evidence, objective.successCriteria].every(hasValue))) push(issues, "invalid-lesson-objectives", "lessonBlueprint.objectives", "课堂目标缺少可观察证据或达成标准。 ");
      if (!blueprint.keyDifficulties?.length || blueprint.keyDifficulties.some((item) => ![item.focus, item.reason, item.breakthrough].every(hasValue))) push(issues, "invalid-key-difficulties", "lessonBlueprint.keyDifficulties", "重难点缺少成因或突破路径。 ");
      if (!blueprint.teacherDecisions?.length) push(issues, "missing-teacher-decisions", "lessonBlueprint.teacherDecisions", "课堂蓝图没有列出需要教师确认的关键假设。 ");
      if (blueprint.presentationPlan?.recommendedPageCount !== plan.slidePlan.length) push(issues, "blueprint-page-count-mismatch", "lessonBlueprint.presentationPlan", "课堂蓝图的建议页数与派生页面数不一致。 ");
    }
    const lessonPlan = plan.lessonPlan;
    if (!lessonPlan?.events?.length) {
      push(issues, "missing-lesson-plan", "lessonPlan", "教师课件缺少课堂事件与时间预算。 ");
    } else {
      const expectedMinutes = Number(String(plan.teacherContext.duration || "").match(/\d{1,3}/)?.[0] || 45);
      const actualMinutes = lessonPlan.events.reduce((sum, event) => sum + event.durationMinutes, 0);
      if (actualMinutes !== expectedMinutes) push(issues, "lesson-duration-mismatch", "lessonPlan.totalMinutes", `课堂事件总时长为 ${actualMinutes} 分钟，与课时 ${expectedMinutes} 分钟不一致。`);
      const eventIds = new Set<string>();
      const slideIds = new Set<string>();
      const duplicateSlideIds = new Set<string>();
      lessonPlan.events.forEach((event) => {
        if (!event.id || eventIds.has(event.id)) push(issues, "duplicate-lesson-event", "lessonPlan.events", "课堂事件 ID 缺失或重复。 ");
        eventIds.add(event.id);
        if (!Number.isInteger(event.durationMinutes) || event.durationMinutes < 1) push(issues, "invalid-lesson-duration", "lessonPlan.events", `课堂事件“${event.title}”时长无效。`);
        if (![event.teacherAction, event.studentAction, event.expectedResponse, event.evidenceOfLearning, event.fallbackAction].every(hasValue)) push(issues, "incomplete-lesson-event", "lessonPlan.events", `课堂事件“${event.title}”缺少师生活动、预期回答、学习证据或备用动作。`);
        event.slideIds.forEach((slideId) => {
          if (slideIds.has(slideId)) duplicateSlideIds.add(slideId);
          slideIds.add(slideId);
        });
      });
      if (duplicateSlideIds.size) push(issues, "lesson-slide-link-duplicate", "lessonPlan.events", `页面被重复绑定到多个课堂事件：${[...duplicateSlideIds].join("、")}。`);
      const missingSlideLinks = plan.slidePlan.filter((slide) => !slide.lessonEventId || !slideIds.has(slide.id));
      if (missingSlideLinks.length) push(issues, "lesson-slide-link-missing", "slidePlan", `以下页面未绑定课堂事件：${missingSlideLinks.map((slide) => slide.id).join("、")}。`);
    }
    const deliveryPack = plan.deliveryPack;
    if (!deliveryPack?.teacherNotes?.length || !deliveryPack.answerKey?.length || !deliveryPack.boardPlan?.columns?.length || !deliveryPack.homework?.length) {
      push(issues, "missing-teacher-delivery-pack", "deliveryPack", "教师课件缺少讲稿、答案要点、板书安排或分层作业。 ");
    } else {
      if (deliveryPack.planId !== plan.planId) push(issues, "teacher-pack-plan-mismatch", "deliveryPack.planId", "教师交付包与课件计划版本不一致。 ");
      if (deliveryPack.teacherNotes.length !== plan.slidePlan.length) push(issues, "teacher-notes-page-mismatch", "deliveryPack.teacherNotes", "教师讲稿未覆盖全部课件页面。 ");
      const notePageIds = new Set(deliveryPack.teacherNotes.map((note) => note.pageId));
      const missingNotePages = plan.slidePlan.filter((slide) => !notePageIds.has(slide.id));
      if (missingNotePages.length) push(issues, "teacher-note-link-missing", "deliveryPack.teacherNotes", `以下页面缺少教师讲稿：${missingNotePages.map((slide) => slide.id).join("、")}。`);
      const homeworkLevels = new Set(deliveryPack.homework.map((item) => item.level));
      if (!["基础", "提高", "迁移"].every((level) => homeworkLevels.has(level as "基础" | "提高" | "迁移"))) push(issues, "teacher-homework-level-missing", "deliveryPack.homework", "分层作业未覆盖基础、提高和迁移三个层级。 ");
    }
  }

  if (!Array.isArray(plan.slidePlan) || plan.slidePlan.length < Math.min(5, playbook.requiredSlideRoles.length)) {
    push(issues, "slide-plan-too-thin", "slidePlan", "页面角色规划不足。");
  }

  const slidePlanText = cleanText((plan.slidePlan || []).map((slide) => `${slide.role} ${slide.titleIntent} ${slide.pagePurpose} ${slide.mustProve}`).join("\n"));
  const missingRoles = plan.teacherContext ? [] : playbook.requiredSlideRoles.filter((role) => !roleCovered(slidePlanText, role.role, role.titleIntent));
  if (missingRoles.length) {
    push(issues, "missing-required-roles", "slidePlan", `缺少必备页面角色：${missingRoles.map((item) => item.role).join("、")}。`);
  }

  const forbiddenGeneric = [...playbook.forbiddenGenericPatterns, "背景、意义、方案、总结"].filter(Boolean);
  const matchedForbidden = forbiddenGeneric.find((pattern) => structureText.includes(pattern));
  if (matchedForbidden || UNIVERSAL_TEMPLATE_PATTERN.test(structureText)) {
    push(issues, "forbidden-generic-template", "slidePlan", `出现禁用泛化结构：${matchedForbidden || "背景、意义、方案、总结"}。`);
  }

  if (MOJIBAKE_PATTERN.test(text)) {
    push(issues, "mojibake", "contentPlan", "ContentPlan 出现乱码。");
  }
  if (QUESTION_MARK_PLACEHOLDER_PATTERN.test(text)) {
    push(issues, "question-mark-placeholder", "contentPlan", "ContentPlan 出现连续问号占位文本。");
  }
  if (INTERNAL_FIELD_PATTERN.test(text)) {
    push(issues, "internal-field", "contentPlan", "ContentPlan 出现工程字段。");
  }
  const blockingIssues = issues.filter((issue) => issue.blocking);
  const score = Math.max(0, Math.min(100, 100 - blockingIssues.length * 14 - (issues.length - blockingIssues.length) * 5));
  return {
    valid: blockingIssues.length === 0 && score >= 82,
    score,
    issues,
    blockingIssues,
    suggestedFixes: issues.map((issue) => {
      if (issue.id === "missing-required-roles") return "从对应 Playbook 重新补齐 requiredSlideRoles。";
      if (issue.id === "forbidden-generic-template") return "删除万能模板结构，改为类型专属叙事链路。";
      if (issue.id === "internal-field") return "清除 mock/debug/section 类型名等工程字段。";
      if (issue.id === "hardcoded-golden-case") return "移除测试案例专有名词，改为从用户 prompt 动态提取。";
      return `补齐 ${issue.field}。`;
    })
  };
}
