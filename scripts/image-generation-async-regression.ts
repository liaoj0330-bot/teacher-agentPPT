import assert from "node:assert/strict";
import { prisma } from "../lib/db.ts";
import {
  createImageJob,
  getImageJob,
  ownerKeyFor,
  retryImageJob,
  runImageJob
} from "../lib/image-generation-jobs.ts";

const marker = `image-async-regression-${Date.now()}`;
const ownerKey = ownerKeyFor(marker);
const first = await createImageJob({
  ownerKey,
  userId: marker,
  idempotencyKey: "same-request",
  pages: [
    { pageId: "cover", prompt: "cover" },
    { pageId: "practice", prompt: "practice" },
    { pageId: "extension", prompt: "extension" }
  ]
});
const duplicate = await createImageJob({
  ownerKey,
  userId: marker,
  idempotencyKey: "same-request",
  pages: [{ pageId: "different", prompt: "must be deduped" }]
});
assert.equal(duplicate.deduped, true);
assert.equal(duplicate.job.jobId, first.job.jobId);

let firstRun = true;
const failed = await runImageJob(first.job.jobId, ownerKey, async (page) => {
  if (page.pageId !== "cover" && firstRun) throw new Error("temporary upstream failure");
  return { image: `data:image/png;base64,${page.pageId}`, model: "test", transport: "fake" };
});
assert.equal(failed?.status, "failed");
assert.deepEqual(failed?.progress, { total: 3, completed: 1, failed: 2, pending: 0 });
assert.equal(failed?.pages.find((page) => page.pageId === "cover")?.attempts, 1);
assert.equal(failed?.pages.find((page) => page.pageId === "practice")?.attempts, 1);

const retry = await retryImageJob(first.job.jobId, ownerKey, ["practice"]);
assert.equal(retry?.status, "queued");
assert.equal(retry?.pages.find((page) => page.pageId === "cover")?.status, "completed");
assert.equal(retry?.pages.find((page) => page.pageId === "practice")?.status, "queued");
firstRun = false;
const completed = await runImageJob(first.job.jobId, ownerKey, async (page) => ({
  image: `data:image/png;base64,${page.pageId}-retry`, model: "test", transport: "fake"
}));
assert.equal(completed?.status, "failed");
assert.equal(completed?.pages.find((page) => page.pageId === "cover")?.attempts, 1);
assert.equal(completed?.pages.find((page) => page.pageId === "practice")?.attempts, 2);
assert.equal(completed?.pages.find((page) => page.pageId === "extension")?.attempts, 1, "unselected failed page must not retry");

await retryImageJob(first.job.jobId, ownerKey, ["extension"]);
const final = await runImageJob(first.job.jobId, ownerKey, async (page) => ({
  image: `data:image/png;base64,${page.pageId}-retry`, model: "test", transport: "fake"
}));
assert.equal(final?.status, "completed");
assert.equal(final?.pages.find((page) => page.pageId === "cover")?.attempts, 1);
assert.equal(final?.pages.find((page) => page.pageId === "practice")?.attempts, 2);
assert.equal(final?.pages.find((page) => page.pageId === "extension")?.attempts, 2);
assert.equal((await getImageJob(first.job.jobId, ownerKey))?.status, "completed");

await prisma.imageGenerationJob.delete({ where: { id: first.job.jobId } });
console.log(JSON.stringify({ passed: true, jobId: first.job.jobId, verified: ["idempotency", "durable-page-state", "retry-failed-pages-only", "refresh-query"] }, null, 2));
