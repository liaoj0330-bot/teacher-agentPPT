import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ sessions: [] });
  }

  const sessions = await prisma.pptSession.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      prompt: true,
      stage: true,
      provider: true,
      updatedAt: true,
      createdAt: true
    },
    take: 50
  });

  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "请先登录" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const project = body?.project;
  const title = typeof project?.title === "string" ? project.title.slice(0, 120) : "未命名 PPT";
  const prompt = typeof project?.prompt === "string" ? project.prompt.slice(0, 4000) : "";

  const data = {
    userId: user.id,
    title,
    prompt,
    stage: typeof body?.stage === "string" ? body.stage : "idle",
    provider: typeof body?.provider === "string" ? body.provider : null,
    projectJson: JSON.stringify(project ?? {}),
    assetsJson: JSON.stringify(body?.assets ?? []),
    searchJson: JSON.stringify(body?.searchGroups ?? []),
    visualsJson: JSON.stringify(body?.generatedVisuals ?? {}),
    messagesJson: JSON.stringify(body?.messages ?? [])
  };

  const existingId = typeof body?.id === "string" ? body.id : "";
  const session = existingId
    ? await prisma.pptSession.updateMany({ where: { id: existingId, userId: user.id }, data }).then(async (result: { count: number }) => {
        if (result.count > 0) {
          return prisma.pptSession.findUniqueOrThrow({ where: { id: existingId } });
        }
        return prisma.pptSession.create({ data });
      })
    : await prisma.pptSession.create({ data });

  return NextResponse.json({ session: { id: session.id, title: session.title, updatedAt: session.updatedAt } });
}
