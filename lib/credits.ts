import { prisma } from "@/lib/db";

export async function ensureCreditAccount(userId: string, initialBalance = 500) {
  return prisma.creditAccount.upsert({
    where: { userId },
    create: { userId, balance: initialBalance },
    update: {}
  });
}

export async function addCredits(userId: string, amount: number, reason: string, refType?: string, refId?: string) {
  const account = await ensureCreditAccount(userId, 0);
  const nextBalance = account.balance + amount;
  await prisma.$transaction([
    prisma.creditAccount.update({ where: { userId }, data: { balance: nextBalance } }),
    prisma.creditLedger.create({ data: { userId, amount, reason, refType, refId } })
  ]);
  return nextBalance;
}

export async function spendCredits(userId: string, amount: number, reason: string, refType?: string, refId?: string) {
  const account = await ensureCreditAccount(userId, 500);
  if (account.balance < amount) {
    throw new Error("INSUFFICIENT_CREDITS");
  }
  const nextBalance = account.balance - amount;
  await prisma.$transaction([
    prisma.creditAccount.update({ where: { userId }, data: { balance: nextBalance } }),
    prisma.creditLedger.create({ data: { userId, amount: -amount, reason, refType, refId } })
  ]);
  return nextBalance;
}
