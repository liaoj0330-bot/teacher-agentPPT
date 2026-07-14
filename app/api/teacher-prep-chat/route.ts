import { NextResponse } from "next/server";
import {
  runTeacherPrepAssistant,
  type TeacherPrepAssistantInput,
  type TeacherPrepForm,
  type TeacherPrepTaskKind,
} from "@/lib/teacher-prep-assistant";

const emptyForm: TeacherPrepForm = {
  schoolStage: "",
  grade: "",
  subject: "",
  topic: "",
  duration: "",
  textbook: "",
  chapter: "",
  teachingRequirements: "",
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ message: "请输入备课问题或教学要求" }, { status: 400 });
  }

  const rawForm = body?.form && typeof body.form === "object"
    ? body.form as Record<string, unknown>
    : {};
  const form = Object.fromEntries(
    Object.keys(emptyForm).map((key) => [key, typeof rawForm[key] === "string" ? rawForm[key] : ""]),
  ) as TeacherPrepForm;
  const rawTaskKind = typeof body?.taskKind === "string" ? body.taskKind : "";
  const taskKind = ["chapter", "materials", "polish"].includes(rawTaskKind)
    ? rawTaskKind as TeacherPrepTaskKind
    : null;
  const input: TeacherPrepAssistantInput = {
    message,
    form,
    taskKind,
    step: typeof body?.step === "string" ? body.step : undefined,
  };

  const result = await runTeacherPrepAssistant(input);
  return NextResponse.json(result);
}
