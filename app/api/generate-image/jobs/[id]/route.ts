import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { imageJobResponse, ownerKeyFor, retryImageJob } from "@/lib/image-generation-jobs";
import { scheduleImageJob } from "@/lib/image-generation-worker";

async function owner() {
  const user = await getCurrentUser().catch(() => null);
  return ownerKeyFor(user?.id);
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ownerKey = await owner();
  const job = await imageJobResponse(id, ownerKey);
  if (job?.status === "queued") scheduleImageJob(id, ownerKey);
  return job ? NextResponse.json(job) : NextResponse.json({ error: "image_job_not_found" }, { status: 404 });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ownerKey = await owner();
  const body = await request.json().catch(() => ({}));
  const pageIds = Array.isArray(body?.pageIds) ? body.pageIds.filter((value: unknown): value is string => typeof value === "string") : undefined;
  const job = await retryImageJob(id, ownerKey, pageIds);
  if (!job) return NextResponse.json({ error: "image_job_not_found" }, { status: 404 });
  const hasQueued = job.pages.some((page) => page.status === "queued");
  if (hasQueued) scheduleImageJob(id, ownerKey);
  return NextResponse.json({ ...job, queued: hasQueued }, { status: hasQueued ? 202 : 200 });
}
