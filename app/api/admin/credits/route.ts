import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { addCredits } from "@/lib/credits";
import { prisma } from "@/lib/db";

function adminEmails() {
  return new Set((process.env.BETA_ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
}

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || !adminEmails().has(actor.email.toLowerCase())) {
    return NextResponse.json({ message: "admin_required" }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const amount = Number(body?.amount);
  const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : "内测额度补发";
  const emails = Array.isArray(body?.emails) ? body.emails.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter(Boolean) : [];
  if (!Number.isInteger(amount) || amount < 1 || amount > 5000 || !emails.length || emails.length > 500) {
    return NextResponse.json({ message: "amount must be 1..5000 and emails must contain 1..500 entries" }, { status: 400 });
  }
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } });
  const batchId = randomUUID();
  const results: Array<{ email: string; balance: number }> = [];
  for (const user of users) {
    const balance = await addCredits(user.id, amount, reason, "admin_grant", batchId);
    results.push({ email: user.email, balance });
  }
  return NextResponse.json({ batchId, requested: emails.length, granted: results.length, missing: emails.filter((email) => !results.some((item) => item.email.toLowerCase() === email)), amount, results });
}
