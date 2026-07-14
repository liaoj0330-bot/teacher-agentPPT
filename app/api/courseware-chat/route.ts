import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  sendChatMessage,
  listChatMessages,
  markChatSuggestionApplied,
  type ChatContextSlide,
} from "@/lib/courseware-chat";

/**
 * GET /api/courseware-chat?projectId=&versionId=
 *
 * The persisted chat transcript for a project (optionally scoped to one version).
 * Every user and assistant turn is stored server-side, including failed turns
 * (status="failed"), so the client renders the real history rather than local
 * ephemeral state.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") || "";
  const versionId = url.searchParams.get("versionId") || undefined;
  if (!projectId) {
    return NextResponse.json({ message: "projectId 为必填" }, { status: 400 });
  }

  const messages = await listChatMessages(projectId, user.id, versionId);
  if (messages === null) {
    return NextResponse.json({ message: "项目不存在或无权访问" }, { status: 404 });
  }
  return NextResponse.json({ projectId, versionId: versionId ?? null, messages });
}

/**
 * POST /api/courseware-chat
 *
 * Send one teacher message and get a real, model-produced assistant reply. Both
 * turns are persisted. The assistant may return suggestedActions / suggestedPatch,
 * but this endpoint NEVER mutates courseware — applying a suggestion is a separate
 * explicit call to POST /api/courseware-version. When no model is configured or
 * the call fails, the turn is stored failed and this returns an explicit error.
 *
 * Body: { projectId, versionId?, message, context? }
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "请求体必须是 JSON" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const versionId = typeof body.versionId === "string" ? body.versionId : undefined;
  const message = typeof body.message === "string" ? body.message : "";
  const rawContext =
    body.context && typeof body.context === "object"
      ? (body.context as Record<string, unknown>)
      : undefined;

  if (!projectId || !message.trim()) {
    return NextResponse.json({ message: "projectId 与 message 均为必填" }, { status: 400 });
  }

  const context = rawContext
    ? {
        topic: typeof rawContext.topic === "string" ? rawContext.topic : undefined,
        slides: Array.isArray(rawContext.slides)
          ? (rawContext.slides as unknown[])
              .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
              .map((s) => ({
                id: typeof s.id === "string" ? s.id : "",
                title: typeof s.title === "string" ? s.title : undefined,
                subtitle: typeof s.subtitle === "string" ? s.subtitle : undefined,
                bullets: Array.isArray(s.bullets)
                  ? (s.bullets as unknown[]).filter((b): b is string => typeof b === "string")
                  : undefined,
              }))
              .filter((s) => s.id) as ChatContextSlide[]
          : undefined,
      }
    : undefined;

  const result = await sendChatMessage({
    userId: user.id,
    projectId,
    versionId,
    message,
    context,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        code: result.code,
        message: result.message,
        assistantMessageId: result.assistantMessageId ?? null,
      },
      { status: result.status }
    );
  }

  return NextResponse.json(
    {
      messageId: result.messageId,
      assistantMessageId: result.assistantMessageId,
      reply: result.reply,
      suggestedActions: result.suggestedActions,
      suggestedPatch: result.suggestedPatch,
    },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const messageId = typeof body?.messageId === "string" ? body.messageId : "";
  const appliedVersionId = typeof body?.appliedVersionId === "string" ? body.appliedVersionId : "";
  if (!projectId || !messageId || !appliedVersionId) {
    return NextResponse.json(
      { message: "projectId、messageId、appliedVersionId 均为必填" },
      { status: 400 },
    );
  }
  const updated = await markChatSuggestionApplied(messageId, appliedVersionId, projectId, user.id);
  if (!updated) {
    return NextResponse.json({ message: "建议不存在或无权操作" }, { status: 404 });
  }
  return NextResponse.json({ messageId, appliedVersionId });
}
