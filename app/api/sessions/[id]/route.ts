import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "请先登录" }, { status: 401 });
  }
  const { id } = await context.params;
  const session = await prisma.pptSession.findFirst({ where: { id, userId: user.id } });
  if (!session) {
    return NextResponse.json({ message: "会话不存在" }, { status: 404 });
  }

  return NextResponse.json({
    session: {
      id: session.id,
      title: session.title,
      prompt: session.prompt,
      stage: session.stage,
      provider: session.provider,
      project: parseJson(session.projectJson, null),
      assets: parseJson(session.assetsJson, []),
      searchGroups: parseJson(session.searchJson, []),
      generatedVisuals: parseJson(session.visualsJson, {}),
      messages: parseJson(session.messagesJson, []),
      updatedAt: session.updatedAt
    }
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "请先登录" }, { status: 401 });
  }
  const { id } = await context.params;
  await prisma.pptSession.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
