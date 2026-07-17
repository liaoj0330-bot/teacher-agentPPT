import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createTeacherFeedback, listTeacherFeedback, TeacherFeedbackError } from "@/lib/teacher-feedback";

function feedbackError(error: unknown) {
  if (error instanceof TeacherFeedbackError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.code === "context_not_found" ? 404 : 400 });
  }
  return NextResponse.json({ code: "feedback_failed", message: "反馈服务暂时不可用" }, { status: 500 });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const url = new URL(request.url);
  try {
    const tickets = await listTeacherFeedback(user.id, {
      projectId: url.searchParams.get("projectId") || undefined,
      status: url.searchParams.get("status") || undefined,
      category: url.searchParams.get("category") || undefined,
      limit: Number(url.searchParams.get("limit") || 50),
    });
    return NextResponse.json({ tickets });
  } catch (error) {
    return feedbackError(error);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ code: "invalid_input", message: "请求体必须是 JSON" }, { status: 400 });
  try {
    const result = await createTeacherFeedback(user.id, body);
    return NextResponse.json(result, { status: result.deduped ? 200 : 201 });
  } catch (error) {
    return feedbackError(error);
  }
}
