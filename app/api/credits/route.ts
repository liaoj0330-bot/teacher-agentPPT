import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { creditCosts, estimateDeckCredits, getCreditBalance } from "@/lib/credits";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null, costs: creditCosts });
  return NextResponse.json({
    userId: user.id,
    balance: await getCreditBalance(user.id),
    costs: creditCosts,
    estimates: [0, 6, 10].map((imageCount) => estimateDeckCredits(imageCount)),
  });
}
