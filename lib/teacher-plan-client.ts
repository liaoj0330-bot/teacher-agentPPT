import type { TeacherCoursewareTask, TeacherDeckPlan } from "@/lib/teacher-courseware-task";
import type { TeacherDeckPlanAction } from "@/lib/teacher-deck-plan-state";

async function json<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null) as (T & { message?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.message || `教学大纲服务返回 HTTP ${response.status}`);
  return data;
}

export async function createTeacherPlanState(task: TeacherCoursewareTask, plan: TeacherDeckPlan) {
  return json<{ plan: TeacherDeckPlan }>(await fetch("/api/teacher-courseware-plan/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teacherTask: task, planId: plan.planId, pages: plan.pages, lessonBlueprint: plan.lessonBlueprint }),
  })).then((result) => result.plan);
}

export async function dispatchTeacherPlanState(plan: TeacherDeckPlan, action: TeacherDeckPlanAction) {
  if (!plan.projectId || !plan.requestId) throw new Error("教学大纲尚未建立服务器状态");
  return json<{ plan: TeacherDeckPlan }>(await fetch("/api/teacher-courseware-plan/state", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: plan.projectId, requestId: plan.requestId, expectedRevision: plan.revision, action }),
  })).then((result) => result.plan);
}

export async function beginTeacherPlanCompilation(task: TeacherCoursewareTask, plan: TeacherDeckPlan) {
  let current = plan;
  if (!current.projectId || !current.requestId) current = await createTeacherPlanState(task, current);
  if (current.status === "failed") current = await dispatchTeacherPlanState(current, { type: "retry" });
  if (current.status === "reviewing") current = await dispatchTeacherPlanState(current, { type: "confirm" });
  if (current.status === "confirmed") current = await dispatchTeacherPlanState(current, { type: "start_compile" });
  if (current.status !== "compiling") throw new Error(`大纲当前状态 ${current.status} 不能开始逐页生成`);
  return current;
}

export async function completeTeacherPlanCompilation(plan: TeacherDeckPlan) {
  let current = plan;
  for (const page of plan.pages) current = await dispatchTeacherPlanState(current, { type: "page_progress", pageId: page.id, completed: true });
  return dispatchTeacherPlanState(current, { type: "complete" });
}

export async function failTeacherPlanCompilation(plan: TeacherDeckPlan, error: unknown) {
  if (!plan.projectId || !plan.requestId || plan.status === "failed") return plan;
  return dispatchTeacherPlanState(plan, { type: "fail", code: "DECK_GENERATION_FAILED", message: error instanceof Error ? error.message : "课件生成失败", retryable: true });
}
