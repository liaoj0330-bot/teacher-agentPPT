import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { TeacherFeedbackError, updateTeacherFeedback } from "@/lib/teacher-feedback";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ code: "invalid_input", message: "请求体必须是 JSON" }, { status: 400 });
  const { id } = await context.params;
  try {
    const ticket = await updateTeacherFeedback(user.id, id, body);
    return NextResponse.json({ ticket });
  } catch (error) {
    if (error instanceof TeacherFeedbackError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.code === "not_found" ? 404 : 400 });
    }
    return NextResponse.json({ code: "feedback_failed", message: "反馈服务暂时不可用" }, { status: 500 });
  }
}
