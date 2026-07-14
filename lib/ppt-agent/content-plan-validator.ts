import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import { getScenarioPlaybook } from "@/lib/ppt-agent/scenario-playbooks";
import { cleanText } from "@/lib/text-sanitize";

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
