import { prisma as db } from "@/lib/db";
import { assertTeacherDeckPlan, reduceTeacherDeckPlan, type TeacherDeckPlanAction } from "@/lib/teacher-deck-plan-state";
import type { TeacherCoursewareTask, TeacherDeckPlan } from "@/lib/teacher-courseware-task";

function parseTask(value: string): TeacherCoursewareTask {
  const task = JSON.parse(value) as TeacherCoursewareTask;
  if (!task || task.scenario !== "teacher_courseware") throw new Error("INVALID_PLAN_SNAPSHOT");
  return task;
}

function requestStatus(status: TeacherDeckPlan["status"]) {
  if (status === "generating" || status === "compiling") return "running";
  if (status === "failed") return "failed";
  if (status === "ready") return "completed";
  return "pending";
}

export async function createPersistedTeacherPlan(userId: string, task: TeacherCoursewareTask, plan: TeacherDeckPlan) {
  assertTeacherDeckPlan(plan);
  return db.$transaction(async (tx) => {
    const project = await tx.coursewareProject.create({ data: {
      userId, title: task.topic || "教师课件", subject: task.subject || "课程",
      schoolStage: task.schoolStage || "", grade: task.grade || "", lifecycleStatus: plan.status,
    } });
    const request = await tx.coursewareRequest.create({ data: {
      projectId: project.id, requestType: "plan", status: requestStatus(plan.status),
      teacherTaskSnapshot: JSON.stringify({ ...task, deckPlan: { ...plan, projectId: project.id } }),
    } });
    const persisted = { ...plan, projectId: project.id, requestId: request.id };
    await tx.coursewareRequest.update({ where: { id: request.id }, data: {
      teacherTaskSnapshot: JSON.stringify({ ...task, deckPlan: persisted }),
    } });
    return persisted;
  });
}

export async function loadPersistedTeacherPlan(userId: string, projectId: string, requestId: string) {
  const request = await db.coursewareRequest.findFirst({ where: { id: requestId, projectId, project: { userId } } });
  if (!request) return null;
  const task = parseTask(request.teacherTaskSnapshot);
  if (!task.deckPlan) throw new Error("PLAN_SNAPSHOT_MISSING");
  return { task, plan: assertTeacherDeckPlan(task.deckPlan) };
}

export async function dispatchPersistedTeacherPlan(input: { userId: string; projectId: string; requestId: string; action: TeacherDeckPlanAction; expectedRevision?: number }) {
  return db.$transaction(async (tx) => {
    const request = await tx.coursewareRequest.findFirst({ where: { id: input.requestId, projectId: input.projectId, project: { userId: input.userId } } });
    if (!request) return { ok: false as const, code: "PLAN_NOT_FOUND" };
    const task = parseTask(request.teacherTaskSnapshot);
    if (!task.deckPlan) return { ok: false as const, code: "PLAN_SNAPSHOT_MISSING" };
    if (input.expectedRevision != null && (task.deckPlan.revision ?? 0) !== input.expectedRevision)
      return { ok: false as const, code: "PLAN_CONFLICT", currentRevision: task.deckPlan.revision ?? 0 };
    const plan = assertTeacherDeckPlan(reduceTeacherDeckPlan(task.deckPlan, input.action));
    await tx.coursewareRequest.update({ where: { id: request.id }, data: {
      status: requestStatus(plan.status), teacherTaskSnapshot: JSON.stringify({ ...task, deckPlan: plan }),
      errorFacts: plan.failure ? JSON.stringify(plan.failure) : null,
      completedAt: plan.status === "ready" ? new Date() : null,
    } });
    await tx.coursewareProject.update({ where: { id: input.projectId }, data: { lifecycleStatus: plan.status } });
    return { ok: true as const, plan };
  });
}
