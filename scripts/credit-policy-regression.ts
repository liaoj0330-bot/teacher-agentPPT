import assert from "node:assert/strict";
import { prisma } from "../lib/db.ts";
import { estimateDeckCredits, ensureCreditAccount, spendCreditsOnce, refundCreditsOnce } from "../lib/credits.ts";

const marker = `credit-regression-${Date.now()}`;
const user = await prisma.user.create({
  data: { email: `${marker}@example.com`, name: marker, passwordHash: "test", inviteCode: marker.toUpperCase() },
});
await ensureCreditAccount(user.id, 50);
assert.deepEqual(estimateDeckCredits(6), { deck: 24, export: 8, images: 36, total: 68, imageCount: 6 });
const first = await spendCreditsOnce(user.id, 24, "generate", "generation", "same-request");
assert.equal(first.balance, 26);
assert.equal(first.charged, true);
const duplicate = await spendCreditsOnce(user.id, 24, "generate", "generation", "same-request");
assert.equal(duplicate.balance, 26);
assert.equal(duplicate.charged, false);
await assert.rejects(() => spendCreditsOnce(user.id, 40, "too much", "generation", "insufficient"), /INSUFFICIENT_CREDITS/);
const refund = await refundCreditsOnce(user.id, 24, "failed refund", "generation", "same-request");
assert.equal(refund.balance, 50);
assert.equal((await refundCreditsOnce(user.id, 24, "failed refund", "generation", "same-request")).refunded, false);
await prisma.user.delete({ where: { id: user.id } });
console.log(JSON.stringify({ passed: true, verified: ["estimate", "idempotent-spend", "atomic-insufficient", "idempotent-refund"] }, null, 2));
