import { NextResponse } from "next/server";
import { createSession, generateInviteCode, hashPassword, publicUser } from "@/lib/auth";
import { addCredits, configuredInitialCredits, ensureCreditAccount } from "@/lib/credits";
import { prisma } from "@/lib/db";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 40) : "";
  const inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim().toUpperCase() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ message: "请输入有效邮箱" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ message: "密码至少 6 位" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ message: "该邮箱已注册" }, { status: 409 });
  }

  const inviter = inviteCode ? await prisma.user.findUnique({ where: { inviteCode } }) : null;
  const masterInviteCodes = new Set(String(process.env.BETA_MASTER_INVITE_CODES || "")
    .split(",").map((value) => value.trim().toUpperCase()).filter(Boolean));
  const inviteAccepted = Boolean(inviter || (inviteCode && masterInviteCodes.has(inviteCode)));
  if (inviteCode && !inviteAccepted) return NextResponse.json({ message: "内测邀请码无效或已停用" }, { status: 400 });
  if (process.env.BETA_REQUIRE_INVITE === "true" && !inviteAccepted) return NextResponse.json({ message: "当前为邀请制内测，请输入有效邀请码" }, { status: 403 });
  const initialCredits = configuredInitialCredits();
  const user = await prisma.user.create({
    data: {
      email,
      name: name || email.split("@")[0],
      passwordHash: await hashPassword(password),
      inviteCode: generateInviteCode(email),
      invitedById: inviter?.id
    }
  });

  await ensureCreditAccount(user.id, initialCredits);
  await prisma.creditLedger.create({ data: { userId: user.id, amount: initialCredits, reason: "内测注册赠送积分", refType: "beta_registration", refId: user.id } });
  if (inviter && process.env.BETA_ENABLE_REFERRAL_REWARD === "true") {
    const referralCredits = Math.max(0, Number(process.env.BETA_REFERRAL_CREDITS || "0") || 0);
    if (referralCredits) await addCredits(inviter.id, referralCredits, "邀请好友注册奖励", "user", user.id);
  }
  await createSession(user.id);
  const account = await prisma.creditAccount.findUnique({ where: { userId: user.id } });

  return NextResponse.json({
    user: publicUser({
      id: user.id,
      email: user.email,
      name: user.name,
      inviteCode: user.inviteCode,
      credits: account?.balance ?? initialCredits
    })
  });
}
