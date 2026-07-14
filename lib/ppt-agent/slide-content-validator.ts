import type { SlideContentDraft } from "@/lib/ppt-agent/slide-content-draft";
import { cleanText } from "@/lib/text-sanitize";

export type SlideContentValidationIssue = {
  id: string;
  severity: "error" | "warn";
  field: string;
  message: string;
};

export type SlideContentValidationResult = {
  valid: boolean;
  score: number;
  issues: SlideContentValidationIssue[];
  blockingIssues: SlideContentValidationIssue[];
  scaffoldMatches: string[];
  suggestedFixes: string[];
};

export const scaffoldTerms = [
  "受众问题",
  "核心观点",
  "证据安排",
  "页面结论",
  "版式执行层",
  "推荐表达形式",
  "可编辑结构",
  "这一页要",
  "本页要",
  "页面需要",
  "必须先证明",
  "否则",
  "无法形成判断",
  "转成可检查的判断",
  "不要停留在普通信息罗列",
  "证明任务",
  "页面目的",
  "内容策划",
  "生成依据",
  "示例值",
  "写出判断依据、关键步骤和最终结论",
  "对应变化趋势",
  "待补充教材依据",
  "教师补充"
];

export const internalFieldTerms = [
  "pagePlanId",
  "layoutPlanId",
  "contentDraftId",
  "evidenceBlockId",
  "sourceId",
  "visualPrompt",
  "debug",
  "mock",
  "placeholder",
  "generated visual",
  "auto",
  "layoutPlan"
];

const metaTitlePattern = /^(本页|这一页|页面|此页|必须|需要|要把|用来|用于|证明|讲清|说明)/;
const strongClaimPattern = /一定|必然|显著提升|大幅降低|确保|保证|完全解决|唯一|最佳|立刻见效/;

function visibleText(draft: SlideContentDraft) {
  return cleanText([
    draft.finalTitle,
    draft.subtitle,
    draft.leadSentence,
    draft.actionText,
    draft.sourceUseSummary,
    draft.confidenceNote,
    ...draft.visibleBlocks.flatMap((block) => [block.title, block.body, block.tag || ""]),
    ...draft.evidenceSnippets.map((snippet) => snippet.text)
  ].join(" "));
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function push(
  issues: SlideContentValidationIssue[],
  id: string,
  severity: "error" | "warn",
  field: string,
  message: string
) {
  issues.push({ id, severity, field, message });
}

export function findScaffoldMatches(text: string) {
  const normalized = cleanText(text);
  return unique(scaffoldTerms.filter((term) => normalized.includes(term)));
}

export function findInternalFieldMatches(text: string) {
  const normalized = cleanText(text);
  return unique(internalFieldTerms.filter((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalized)));
}

export function validateSlideContentDraft(draft: SlideContentDraft): SlideContentValidationResult {
  const issues: SlideContentValidationIssue[] = [];
  const text = visibleText(draft);
  const title = cleanText(draft.finalTitle);
  const titleLength = [...title].length;
  const scaffoldMatches = findScaffoldMatches(text);
  const internalMatches = findInternalFieldMatches(text);

  if (!title) {
    push(issues, "missing-final-title", "error", "finalTitle", "缺少用户可见标题。");
  } else {
    if (titleLength > 32) push(issues, "long-final-title", "error", "finalTitle", "标题过长，容易在 PPT 中截断。");
    if (titleLength < 6) push(issues, "thin-final-title", "warn", "finalTitle", "标题过短，结论感不足。");
    if (metaTitlePattern.test(title) || /必须先证明|否则|页面需要|本页要/.test(title)) {
      push(issues, "meta-final-title", "error", "finalTitle", "标题仍是元说明或策划指令。");
    }
  }

  if (!draft.visibleBlocks.length) {
    push(issues, "empty-visible-blocks", "error", "visibleBlocks", "正文内容块为空。");
  }
  draft.visibleBlocks.forEach((block, index) => {
    const blockText = `${block.title} ${block.body}`;
    if (!cleanText(block.body) || [...cleanText(block.body)].length < 8) {
      push(issues, `thin-block-${index + 1}`, "warn", "visibleBlocks", "正文块内容过薄。");
    }
    if (findScaffoldMatches(blockText).length) {
      push(issues, `scaffold-block-${index + 1}`, "error", "visibleBlocks", "正文块包含脚手架标签或策划语言。");
    }
  });

  if (scaffoldMatches.length) {
    push(issues, "scaffold-leakage", "error", "visibleText", `可见文本包含脚手架词：${scaffoldMatches.join("、")}`);
  }
  if (internalMatches.length) {
    push(issues, "internal-field-leakage", "error", "visibleText", `可见文本包含内部字段：${internalMatches.join("、")}`);
  }
  if (draft.pptType === "proposal" && /政务蓝|评审汇报|GOVERNANCE REVIEW/i.test(text)) {
    push(issues, "proposal-theme-leakage", "error", "theme", "销售提案出现政务 / 评审汇报主题串味。");
  }
  if (draft.pptType === "courseware" && /event_plan|活动亮白|执行策划|EVENT PLAN/i.test(text)) {
    push(issues, "courseware-type-leakage", "error", "theme", "课程课件出现活动策划类型或主题串味。");
  }
  if (!draft.evidenceSnippets.length && strongClaimPattern.test(text)) {
    push(issues, "strong-claim-without-evidence", "error", "evidenceSnippets", "缺少证据片段时不允许强确定表达。");
  }
  if (!draft.confidenceNote && draft.evidenceSnippets.every((snippet) => snippet.reliability !== "verified" && snippet.reliability !== "traceable")) {
    push(issues, "missing-low-confidence-note", "warn", "confidenceNote", "低置信来源需要给出待补资料提示。");
  }

  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  const score = Math.max(0, 100 - blockingIssues.length * 20 - issues.filter((issue) => issue.severity === "warn").length * 6);
  return {
    valid: blockingIssues.length === 0 && score >= 70,
    score,
    issues,
    blockingIssues,
    scaffoldMatches,
    suggestedFixes: unique(issues.map((issue) => {
      if (issue.id.includes("title")) return "将标题改写为 12-28 字的短观点句。";
      if (issue.id.includes("scaffold")) return "删除脚手架标签，并改写为客户可读正文。";
      if (issue.id.includes("evidence")) return "补充 evidenceSnippets，或把强结论降级为待确认判断。";
      if (issue.id.includes("theme")) return "按 pptType 重新锁定主题和类型。";
      return "重新生成页面成稿内容。";
    }))
  };
}

export function validateSlideContentDrafts(drafts: SlideContentDraft[]) {
  return drafts.map(validateSlideContentDraft);
}
