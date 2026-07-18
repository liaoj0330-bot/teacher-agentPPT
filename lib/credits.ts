import { createHash, randomUUID } from "node:crypto";
import { prisma } from "./db.ts";

export const creditCosts = {
  generateDeck: 24,
  exportPptx: 8,
  generateImage: 6,
  refinePage: 4,
} as const;

export const initialBetaCredits = 500;

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function configuredInitialCredits() {
  return positiveInteger(process.env.BETA_INITIAL_CREDITS, initialBetaCredits);
}

export function estimateDeckCredits(imageCount = 0) {
  const images = Math.max(0, Math.min(20, Math.floor(Number(imageCount) || 0)));
  return {
    deck: creditCosts.generateDeck,
    export: creditCosts.exportPptx,
    images: images * creditCosts.generateImage,
    total: creditCosts.generateDeck + creditCosts.exportPptx + images * creditCosts.generateImage,
    imageCount: images,
  };
}

export async function ensureCreditAccount(userId: string, initialBalance = configuredInitialCredits()) {
  return prisma.creditAccount.upsert({
    where: { userId },
    create: { userId, balance: initialBalance },
    update: {}
  });
}

export async function getCreditBalance(userId: string) {
  return (await ensureCreditAccount(userId, configuredInitialCredits())).balance;
}

export async function assertCredits(userId: string, amount: number) {
  const balance = await getCreditBalance(userId);
  if (balance < amount) throw new Error("INSUFFICIENT_CREDITS");
  return balance;
}

export async function hasCreditOperation(userId: string, refType: string, refId: string) {
  const operationId = ledgerId("spend", userId, refType, refId);
  return Boolean(await prisma.creditLedger.findUnique({ where: { id: operationId } }));
}

function ledgerId(kind: "spend" | "refund", userId: string, refType: string, refId: string) {
  return `credit-${createHash("sha256").update(`${kind}:${userId}:${refType}:${refId}`).digest("hex").slice(0, 32)}`;
}

export async function addCredits(userId: string, amount: number, reason: string, refType?: string, refId?: string) {
  const value = positiveInteger(amount, 0);
  if (!value) return getCreditBalance(userId);
  await ensureCreditAccount(userId, 0);
  return prisma.$transaction(async (tx) => {
    await tx.creditAccount.update({ where: { userId }, data: { balance: { increment: value } } });
    await tx.creditLedger.create({ data: { userId, amount: value, reason, refType, refId } });
    return (await tx.creditAccount.findUniqueOrThrow({ where: { userId } })).balance;
  });
}

export async function spendCreditsOnce(
  userId: string,
  amount: number,
  reason: string,
  refType: string,
  refId: string,
) {
  const value = positiveInteger(amount, 0);
  if (!value) return { balance: await getCreditBalance(userId), charged: false };
  const operationId = ledgerId("spend", userId, refType, refId);
  const existing = await prisma.creditLedger.findUnique({ where: { id: operationId } });
  if (existing) return { balance: await getCreditBalance(userId), charged: false };
  try {
    const balance = await prisma.$transaction(async (tx) => {
      await tx.creditAccount.upsert({ where: { userId }, create: { userId, balance: configuredInitialCredits() }, update: {} });
      const debited = await tx.creditAccount.updateMany({
        where: { userId, balance: { gte: value } },
        data: { balance: { decrement: value } },
      });
      if (!debited.count) throw new Error("INSUFFICIENT_CREDITS");
      await tx.creditLedger.create({ data: { id: operationId, userId, amount: -value, reason, refType, refId } });
      return (await tx.creditAccount.findUniqueOrThrow({ where: { userId } })).balance;
    });
    return { balance, charged: true };
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") throw error;
    const duplicate = await prisma.creditLedger.findUnique({ where: { id: operationId } });
    if (duplicate) return { balance: await getCreditBalance(userId), charged: false };
    throw error;
  }
}

export async function refundCreditsOnce(
  userId: string,
  amount: number,
  reason: string,
  refType: string,
  refId: string,
) {
  const value = positiveInteger(amount, 0);
  if (!value) return { balance: await getCreditBalance(userId), refunded: false };
  const operationId = ledgerId("refund", userId, refType, refId);
  const existing = await prisma.creditLedger.findUnique({ where: { id: operationId } });
  if (existing) return { balance: await getCreditBalance(userId), refunded: false };
  try {
    const balance = await prisma.$transaction(async (tx) => {
      await tx.creditAccount.upsert({ where: { userId }, create: { userId, balance: configuredInitialCredits() }, update: {} });
      await tx.creditAccount.update({ where: { userId }, data: { balance: { increment: value } } });
      await tx.creditLedger.create({ data: { id: operationId, userId, amount: value, reason, refType: `${refType}_refund`, refId } });
      return (await tx.creditAccount.findUniqueOrThrow({ where: { userId } })).balance;
    });
    return { balance, refunded: true };
  } catch (error) {
    const duplicate = await prisma.creditLedger.findUnique({ where: { id: operationId } });
    if (duplicate) return { balance: await getCreditBalance(userId), refunded: false };
    throw error;
  }
}

export async function spendCredits(userId: string, amount: number, reason: string, refType = "legacy", refId = randomUUID()) {
  return (await spendCreditsOnce(userId, amount, reason, refType, refId)).balance;
}
