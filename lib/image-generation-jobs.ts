import { randomUUID } from "node:crypto";
import { prisma } from "./db.ts";

export type ImageJobPageInput = {
  pageId: string;
  prompt: string;
  size?: string;
  title?: string;
};

export type ImageJobPage = ImageJobPageInput & {
  status: "queued" | "processing" | "completed" | "failed";
  attempts: number;
  image?: string;
  model?: string;
  transport?: string;
  elapsedMs?: number;
  error?: string;
};

type JobRecord = {
  id: string;
  ownerKey: string;
  userId: string | null;
  status: string;
  attempts: number;
  errorMessage: string | null;
  pages: ImageJobPage[];
  request: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(value) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function rowToJob(row: {
  id: string; ownerKey: string; userId: string | null; status: string; attempts: number;
  errorMessage: string | null; pagesJson: string; requestJson: string; createdAt: Date;
  updatedAt: Date; completedAt: Date | null;
}): JobRecord {
  return {
    id: row.id,
    ownerKey: row.ownerKey,
    userId: row.userId,
    status: row.status,
    attempts: row.attempts,
    errorMessage: row.errorMessage,
    pages: parseJson<ImageJobPage[]>(row.pagesJson, []),
    request: parseJson<Record<string, unknown>>(row.requestJson, {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {})
  };
}

function publicJob(job: JobRecord) {
  const completed = job.pages.filter((page) => page.status === "completed").length;
  const failed = job.pages.filter((page) => page.status === "failed").length;
  return {
    jobId: job.id,
    status: job.status,
    attempts: job.attempts,
    progress: { total: job.pages.length, completed, failed, pending: job.pages.length - completed - failed },
    pages: job.pages,
    error: job.errorMessage || undefined,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt
  };
}

export function ownerKeyFor(userId?: string | null) {
  return userId ? `user:${userId}` : "anonymous";
}

export async function createImageJob(input: {
  ownerKey: string;
  userId?: string | null;
  idempotencyKey?: string;
  pages: ImageJobPageInput[];
  request?: Record<string, unknown>;
}) {
  const idempotencyKey = input.idempotencyKey?.trim() || `image-${randomUUID()}`;
  const existing = await prisma.imageGenerationJob.findUnique({
    where: { ownerKey_idempotencyKey: { ownerKey: input.ownerKey, idempotencyKey } }
  });
  if (existing) return { job: publicJob(rowToJob(existing)), deduped: true };
  const pages: ImageJobPage[] = input.pages.map((page) => ({
    pageId: page.pageId,
    prompt: page.prompt,
    size: page.size,
    title: page.title,
    status: "queued",
    attempts: 0
  }));
  try {
    const created = await prisma.imageGenerationJob.create({
      data: {
        ownerKey: input.ownerKey,
        userId: input.userId || null,
        idempotencyKey,
        requestJson: JSON.stringify(input.request || {}),
        pagesJson: JSON.stringify(pages)
      }
    });
    return { job: publicJob(rowToJob(created)), deduped: false };
  } catch (error) {
    // Concurrent retries can race the read above. Return the winner instead of creating a duplicate.
    const duplicate = await prisma.imageGenerationJob.findUnique({
      where: { ownerKey_idempotencyKey: { ownerKey: input.ownerKey, idempotencyKey } }
    });
    if (duplicate) return { job: publicJob(rowToJob(duplicate)), deduped: true };
    throw error;
  }
}

export async function getImageJob(id: string, ownerKey: string) {
  const row = await prisma.imageGenerationJob.findFirst({ where: { id, ownerKey } });
  return row ? publicJob(rowToJob(row)) : null;
}

async function recoverStaleJob(id: string, ownerKey: string) {
  const staleAt = new Date(Date.now() - 10 * 60 * 1000);
  const row = await prisma.imageGenerationJob.findFirst({
    where: { id, ownerKey, status: "processing", updatedAt: { lt: staleAt } }
  });
  if (!row) return;
  const pages = parseJson<ImageJobPage[]>(row.pagesJson, []).map((page) => page.status === "processing"
    ? { ...page, status: "queued" as const, error: "worker interrupted; queued for resume" }
    : page);
  await prisma.imageGenerationJob.update({
    where: { id },
    data: { status: "queued", pagesJson: JSON.stringify(pages), errorMessage: "worker interrupted; queued for resume" }
  });
}

export async function retryImageJob(id: string, ownerKey: string, pageIds?: string[]) {
  const row = await prisma.imageGenerationJob.findFirst({ where: { id, ownerKey } });
  if (!row) return null;
  const job = rowToJob(row);
  const requested = pageIds?.length ? new Set(pageIds) : null;
  let changed = false;
  const pages = job.pages.map((page) => {
    if (page.status !== "failed" || (requested && !requested.has(page.pageId))) return page;
    changed = true;
    return { ...page, status: "queued" as const, error: undefined };
  });
  if (changed) {
    await prisma.imageGenerationJob.update({
      where: { id },
      data: { pagesJson: JSON.stringify(pages), status: "queued", errorMessage: null, completedAt: null }
    });
  }
  return publicJob({ ...job, pages, status: changed ? "queued" : job.status, errorMessage: changed ? null : job.errorMessage });
}

export async function runImageJob(
  id: string,
  ownerKey: string,
  generate: (page: ImageJobPage) => Promise<{ image: string; model?: string; transport?: string; elapsedMs?: number }>
) {
  await recoverStaleJob(id, ownerKey);
  const row = await prisma.imageGenerationJob.findFirst({ where: { id, ownerKey } });
  if (!row) return null;
  let job = rowToJob(row);
  if (job.status === "completed") return publicJob(job);
  const claimed = await prisma.imageGenerationJob.updateMany({
    where: { id, ownerKey, status: { in: ["queued", "retrying"] } },
    data: { status: "processing", attempts: { increment: 1 }, errorMessage: null }
  });
  if (!claimed.count) return publicJob(job);
  const claimedRow = await prisma.imageGenerationJob.findFirst({ where: { id, ownerKey } });
  if (!claimedRow) return null;
  job = rowToJob(claimedRow);
  let fatal: string | undefined;
  for (const page of job.pages) {
    if (page.status !== "queued") continue;
    const working = { ...page, status: "processing" as const, attempts: page.attempts + 1 };
    job.pages = job.pages.map((item) => item.pageId === page.pageId ? working : item);
    await prisma.imageGenerationJob.update({ where: { id }, data: { pagesJson: JSON.stringify(job.pages) } });
    try {
      const result = await generate(working);
      job.pages = job.pages.map((item) => item.pageId === page.pageId ? {
        ...working, status: "completed" as const, image: result.image, model: result.model,
        transport: result.transport, elapsedMs: result.elapsedMs, error: undefined
      } : item);
    } catch (error) {
      const message = error instanceof Error ? error.message : "image generation failed";
      fatal = message;
      job.pages = job.pages.map((item) => item.pageId === page.pageId ? { ...working, status: "failed" as const, error: message } : item);
    }
    await prisma.imageGenerationJob.update({
      where: { id },
      data: { pagesJson: JSON.stringify(job.pages), errorMessage: fatal || null }
    });
  }
  const hasFailed = job.pages.some((page) => page.status === "failed");
  const status = hasFailed ? "failed" : "completed";
  const completedAt = status === "completed" ? new Date() : null;
  const final = await prisma.imageGenerationJob.update({
    where: { id },
    data: { status, pagesJson: JSON.stringify(job.pages), errorMessage: fatal || null, completedAt }
  });
  return publicJob(rowToJob(final));
}

export async function imageJobResponse(id: string, ownerKey: string) {
  await recoverStaleJob(id, ownerKey);
  const row = await prisma.imageGenerationJob.findFirst({ where: { id, ownerKey } });
  return row ? publicJob(rowToJob(row)) : null;
}
