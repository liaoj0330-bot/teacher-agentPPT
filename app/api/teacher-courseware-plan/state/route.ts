import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createPersistedTeacherPlan, dispatchPersistedTeacherPlan, loadPersistedTeacherPlan } from "@/lib/teacher-deck-plan-store";
import { createTeacherDeckPlan, TeacherDeckPlanStateError, type TeacherDeckPlanAction } from "@/lib/teacher-deck-plan-state";
import type { LessonBlueprint } from "@/lib/ppt-agent/content-plan";
import type { TeacherCoursewareTask, TeacherDeckPlanPage } from "@/lib/teacher-courseware-task";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const url = new URL(request.url);
  const result = await loadPersistedTeacherPlan(user.id, url.searchParams.get("projectId") || "", url.searchParams.get("requestId") || "");
  return result ? NextResponse.json(result) : NextResponse.json({ message: "计划不存在" }, { status: 404 });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as { teacherTask?: TeacherCoursewareTask; planId?: string; pages?: TeacherDeckPlanPage[]; lessonBlueprint?: LessonBlueprint } | null;
  if (!body?.teacherTask || body.teacherTask.scenario !== "teacher_courseware" || !body.planId || !Array.isArray(body.pages))
    return NextResponse.json({ message: "teacherTask、planId 和 pages 必填" }, { status: 400 });
  try {
    const plan = await createPersistedTeacherPlan(user.id, body.teacherTask, createTeacherDeckPlan(body.planId, body.pages, body.lessonBlueprint));
    return NextResponse.json({ plan, projectId: plan.projectId, requestId: plan.requestId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建计划失败";
    return NextResponse.json({ message }, { status: error instanceof TeacherDeckPlanStateError ? 422 : 500 });
  }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "未登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as { projectId?: string; requestId?: string; expectedRevision?: number; action?: TeacherDeckPlanAction } | null;
  if (!body?.projectId || !body.requestId || !body.action?.type) return NextResponse.json({ message: "projectId、requestId 和 action 必填" }, { status: 400 });
  try {
    const result = await dispatchPersistedTeacherPlan({ userId: user.id, projectId: body.projectId, requestId: body.requestId, expectedRevision: body.expectedRevision, action: body.action });
    if (!result.ok) return NextResponse.json(result, { status: result.code === "PLAN_CONFLICT" ? 409 : 404 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TeacherDeckPlanStateError) return NextResponse.json({ code: error.code, message: error.message }, { status: 422 });
    return NextResponse.json({ message: error instanceof Error ? error.message : "计划操作失败" }, { status: 500 });
  }
}
