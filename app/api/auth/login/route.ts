import { NextResponse } from "next/server";
import { createSession, publicUser, verifyPassword } from "@/lib/auth";
import { ensureCreditAccount } from "@/lib/credits";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const user = await prisma.user.findUnique({ where: { email }, include: { credit: true } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ message: "邮箱或密码不正确" }, { status: 401 });
  }

  const account = user.credit ?? (await ensureCreditAccount(user.id, 500));
  await createSession(user.id);

  return NextResponse.json({
    user: publicUser({
      id: user.id,
      email: user.email,
      name: user.name,
      inviteCode: user.inviteCode,
      credits: account.balance
    })
  });
}
