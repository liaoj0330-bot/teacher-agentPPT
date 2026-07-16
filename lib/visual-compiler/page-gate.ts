import type { TeacherDeckPlan } from "../teacher-courseware-task.ts";
import { reduceTeacherDeckPlan } from "../teacher-deck-plan-state.ts";
import type { RenderScene, VisualQAIssue } from "./contracts.ts";
import type { VisualQAReportV2 } from "./qa-v2.ts";

export type PageGateDecision = {
  pageId: string;
  slideId: string;
  sceneId: string;
  status: "passed" | "review_required" | "failed";
  action: "continue" | "review_page" | "retry_current_page";
  retryFrom?: "content" | "layout" | "render";
  issueCodes: string[];
  issues: VisualQAIssue[];
};

function retryStage(issues: VisualQAIssue[]): PageGateDecision["retryFrom"] {
  if (issues.some((issue) => issue.code === "UNEDITABLE_CORE_CONTENT" || issue.code === "OUT_OF_BOUNDS")) return "render";
  if (issues.some((issue) => issue.code === "OVERLAP" || issue.code === "TEXT_OVERFLOW" || issue.code === "FONT_TOO_SMALL" || issue.code === "DENSITY_BUDGET_EXCEEDED" || issue.code === "REPETITIVE_COMPOSITION")) return "layout";
  return "content";
}

export function evaluatePageGates(scenes: RenderScene[], report: VisualQAReportV2): PageGateDecision[] {
  return scenes.map((scene) => {
    const issues = report.issues.filter((issue) => issue.sceneId === scene.sceneId);
    const hasError = issues.some((issue) => issue.severity === "error");
    const hasWarning = issues.some((issue) => issue.severity === "warning");
    return {
      pageId: scene.slideId,
      slideId: scene.slideId,
      sceneId: scene.sceneId,
      status: hasError ? "failed" : hasWarning ? "review_required" : "passed",
      action: hasError ? "retry_current_page" : hasWarning ? "review_page" : "continue",
      retryFrom: hasError ? retryStage(issues) : undefined,
      issueCodes: [...new Set(issues.map((issue) => issue.code))],
      issues
    };
  });
}

/**
 * Applies page gates to the existing TeacherDeckPlan reducer. It deliberately
 * does not introduce a second workflow state: passed/review pages are recorded
 * as completed, failed pages remain isolated in failedPageIds.
 */
export function applyPageGatesToPlan(plan: TeacherDeckPlan, gates: PageGateDecision[]) {
  if (plan.status !== "compiling") throw new Error("页面 Gate 只能应用到 compiling 计划");
  return gates.reduce((current, gate) => reduceTeacherDeckPlan(current, {
    type: "page_progress",
    pageId: gate.pageId,
    completed: gate.status !== "failed",
    failed: gate.status === "failed"
  }), plan);
}

export function beginPageRetry(plan: TeacherDeckPlan, pageId: string) {
  if (plan.status !== "compiling") throw new Error("只有 compiling 计划可以重试单页");
  if (!plan.progress?.failedPageIds.includes(pageId)) throw new Error(`页面 ${pageId} 当前不是失败状态`);
  return reduceTeacherDeckPlan(plan, { type: "page_progress", pageId });
}
