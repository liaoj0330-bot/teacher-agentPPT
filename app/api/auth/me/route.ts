import { NextResponse } from "next/server";
import { getCurrentUser, publicUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { creditCosts, estimateDeckCredits, initialBetaCredits } from "@/lib/credits";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null, creditPolicy: { initialBetaCredits, costs: creditCosts, estimates: [0, 6, 10].map(estimateDeckCredits) } });
  }
  const ledger = await prisma.creditLedger.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  return NextResponse.json({ user: publicUser(user), ledger, creditPolicy: { initialBetaCredits, costs: creditCosts, estimates: [0, 6, 10].map(estimateDeckCredits) } });
}
