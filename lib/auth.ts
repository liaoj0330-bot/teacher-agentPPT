import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "ai_ppt_agent_session";
const SESSION_DAYS = 30;

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  inviteCode: string;
  credits: number;
};

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteCode(email: string) {
  const seed = createHash("sha1").update(`${email}-${Date.now()}-${Math.random()}`).digest("hex").slice(0, 8);
  return seed.toUpperCase();
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt
    }
  });
  const cookieStore = await cookies();
  const secureCookie = process.env.AUTH_COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" && process.env.AUTH_COOKIE_SECURE !== "false");
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    path: "/",
    expires: expiresAt
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { credit: true } } }
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.authSession.delete({ where: { id: session.id } }).catch(() => null);
    }
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    inviteCode: session.user.inviteCode,
    credits: session.user.credit?.balance ?? 0
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    inviteCode: user.inviteCode,
    credits: user.credits
  };
}
