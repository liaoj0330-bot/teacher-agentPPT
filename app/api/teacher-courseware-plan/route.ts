import { NextResponse } from "next/server";
import { createContentPlan } from "@/lib/ppt-agent/content-planner";
import { normalizeTeacherTask } from "@/lib/teacher-topic-normalizer";
import type { TeacherCoursewareTask } from "@/lib/teacher-courseware-task";
import { buildTeacherMaterialPackage } from "@/lib/ppt-agent/teacher-material-package";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const rawTask = body?.teacherTask as TeacherCoursewareTask | undefined;
  if (!rawTask || rawTask.scenario !== "teacher_courseware") {
    return NextResponse.json({ message: "teacherTask is required" }, { status: 400 });
  }
  const normalizedTask = normalizeTeacherTask(rawTask);
  const materialPackage = buildTeacherMaterialPackage({ task: normalizedTask });
  if (materialPackage.readiness.status === "blocked") {
    return NextResponse.json({
      code: "MATERIAL_PACKAGE_BLOCKED",
      message: "上传资料尚不能支持可靠备课，请处理解析失败或教材匹配问题。",
      materialPackage,
    }, { status: 422 });
  }
  const teacherTask: TeacherCoursewareTask = { ...normalizedTask, materialPackage };
  const prompt = `为${teacherTask.schoolStage}${teacherTask.grade}${teacherTask.subject}课题“${teacherTask.topic}”规划${teacherTask.duration}课堂课件。教材：${teacherTask.textbook || "未提供"}；章节：${teacherTask.chapter || "未提供"}；要求：${teacherTask.teachingRequirements || "未提供"}`;
  const { contentPlan, validation } = createContentPlan({
    prompt,
    pptType: "courseware",
    mode: "professional",
    userPreferences: {
      scenario: "teacher_courseware",
      teacherTask,
      teacherStyle: teacherTask.teacherStyle,
    },
  });
  if (!validation.valid) {
    return NextResponse.json({ message: "规划校验未通过", validation, contentPlan }, { status: 422 });
  }
  return NextResponse.json({
    materialPackage,
    contentPlan,
    deckPlan: {
      planId: contentPlan.planId,
      status: "draft",
      pageCount: contentPlan.slidePlan.length,
      pages: contentPlan.slidePlan.map((slide) => ({
        id: slide.id, role: slide.role, titleIntent: slide.titleIntent,
        pagePurpose: slide.pagePurpose, mustProve: slide.mustProve,
        layoutHint: slide.layoutHint, priority: slide.priority === "required" ? "required" : "recommended", lessonEventId: slide.lessonEventId,
      })),
      lessonBlueprint: contentPlan.lessonBlueprint,
      lessonPlan: contentPlan.lessonPlan,
      deliveryPack: contentPlan.deliveryPack,
    },
  });
}
