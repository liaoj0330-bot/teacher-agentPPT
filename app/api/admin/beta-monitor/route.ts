import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function adminEmails() {
  return new Set((process.env.BETA_ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean));
}

function rate(success: number, total: number) {
  return total ? Number(((success / total) * 100).toFixed(1)) : null;
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))] / 1000);
}

export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || !adminEmails().has(actor.email.toLowerCase())) {
    return NextResponse.json({ message: "admin_required" }, { status: 403 });
  }
  const requestedHours = Number(new URL(request.url).searchParams.get("hours") || "24");
  const hours = Math.max(1, Math.min(168, Number.isFinite(requestedHours) ? Math.floor(requestedHours) : 24));
  const now = new Date();
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const matureBefore = new Date(now.getTime() - 5 * 60 * 1000);

  const [registeredUsers, newUsers, projects, requests, artifacts, imageJobs, feedback, creditLedger] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
    prisma.coursewareProject.findMany({ where: { updatedAt: { gte: since } }, select: { id: true, userId: true } }),
    prisma.coursewareRequest.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, status: true, createdAt: true, completedAt: true, project: { select: { userId: true } } },
    }),
    prisma.coursewareArtifact.findMany({
      where: { artifactType: "pptx", createdAt: { gte: since } },
      select: { id: true, status: true, createdAt: true, project: { select: { userId: true } } },
    }),
    prisma.imageGenerationJob.findMany({
      where: { updatedAt: { gte: since } },
      select: { id: true, status: true, pagesJson: true, createdAt: true, updatedAt: true, completedAt: true },
    }),
    prisma.feedbackTicket.findMany({
      where: { status: { notIn: ["resolved", "closed", "duplicate"] } },
      select: { id: true, severity: true, status: true, createdAt: true },
    }),
    prisma.creditLedger.findMany({ where: { createdAt: { gte: since }, amount: { lt: 0 } }, select: { amount: true, refType: true } }),
  ]);

  const activeUsers = new Set(projects.map((item) => item.userId));
  const generationUsers = new Set(requests.map((item) => item.project.userId));
  const exportUsers = new Set(artifacts.map((item) => item.project.userId));
  const matureRequests = requests.filter((item) => item.createdAt <= matureBefore || item.completedAt);
  const completedRequests = matureRequests.filter((item) => item.status === "completed");
  const generationLatencies = completedRequests.flatMap((item) => item.completedAt ? [item.completedAt.getTime() - item.createdAt.getTime()] : []);
  const readyArtifacts = artifacts.filter((item) => item.status === "ready");

  let imageCompletedPages = 0;
  let imageFailedPages = 0;
  for (const job of imageJobs) {
    try {
      const pages = JSON.parse(job.pagesJson) as Array<{ status?: string }>;
      imageCompletedPages += pages.filter((page) => page.status === "completed").length;
      imageFailedPages += pages.filter((page) => page.status === "failed").length;
    } catch {
      imageFailedPages += 1;
    }
  }
  const queuedJobs = imageJobs.filter((item) => item.status === "queued" || item.status === "processing");
  const oldestQueueMinutes = queuedJobs.length
    ? Math.round((now.getTime() - Math.min(...queuedJobs.map((item) => item.createdAt.getTime()))) / 60000)
    : 0;
  const generationRate = rate(completedRequests.length, matureRequests.length);
  const exportRate = rate(readyArtifacts.length, artifacts.length);
  const imageRate = rate(imageCompletedPages, imageCompletedPages + imageFailedPages);
  const openP0 = feedback.filter((item) => item.severity === "P0").length;
  const openP1 = feedback.filter((item) => item.severity === "P1").length;
  const alerts: Array<{ level: "critical" | "warning"; metric: string; message: string; fireCommand: string }> = [];

  if (openP0) alerts.push({ level: "critical", metric: "open_p0", message: `${openP0} 个 P0 尚未关闭`, fireCommand: "/fire report open P0 detected" });
  if (matureRequests.length >= 5 && generationRate !== null && generationRate < 90) alerts.push({ level: "critical", metric: "generation_completion_rate", message: `生成完成率 ${generationRate}% 低于 90%`, fireCommand: "/fire contain generation failure" });
  else if (matureRequests.length >= 5 && generationRate !== null && generationRate < 95) alerts.push({ level: "warning", metric: "generation_completion_rate", message: `生成完成率 ${generationRate}% 低于 95%`, fireCommand: "/fire report generation degradation" });
  if (artifacts.length >= 5 && exportRate !== null && exportRate < 95) alerts.push({ level: "critical", metric: "export_success_rate", message: `导出成功率 ${exportRate}% 低于 95%`, fireCommand: "/fire contain export failure" });
  else if (artifacts.length >= 5 && exportRate !== null && exportRate < 98) alerts.push({ level: "warning", metric: "export_success_rate", message: `导出成功率 ${exportRate}% 低于 98%`, fireCommand: "/fire report export degradation" });
  if (oldestQueueMinutes >= 30) alerts.push({ level: "critical", metric: "oldest_queue_minutes", message: `最老任务已排队 ${oldestQueueMinutes} 分钟`, fireCommand: "/fire contain queue growth" });
  else if (oldestQueueMinutes >= 15) alerts.push({ level: "warning", metric: "oldest_queue_minutes", message: `最老任务已排队 ${oldestQueueMinutes} 分钟`, fireCommand: "/fire report queue delay" });
  if (openP1 > 2) alerts.push({ level: "warning", metric: "open_p1", message: `${openP1} 个 P1 尚未关闭`, fireCommand: "/fire status beta support backlog" });

  const status = alerts.some((item) => item.level === "critical") ? "critical" : alerts.length ? "warning" : "healthy";
  const creditsSpent = creditLedger.reduce((sum, item) => sum + Math.abs(item.amount), 0);
  const creditsByOperation = Object.fromEntries([...new Set(creditLedger.map((item) => item.refType || "unknown"))].map((type) => [type, creditLedger.filter((item) => (item.refType || "unknown") === type).reduce((sum, item) => sum + Math.abs(item.amount), 0)]));

  return NextResponse.json({
    status,
    window: { hours, since: since.toISOString(), generatedAt: now.toISOString() },
    usage: {
      registeredUsers,
      newUsers,
      activeUsers: activeUsers.size,
      registeredUserActivityRate: rate(activeUsers.size, registeredUsers),
      generationUsers: generationUsers.size,
      exportUsers: exportUsers.size,
      projectsTouched: projects.length,
      generationAttempts: requests.length,
      pptxExportAttempts: artifacts.length,
      imagePagesAttempted: imageCompletedPages + imageFailedPages,
      creditsSpent,
      creditsByOperation,
      invitationActivationRate: null,
      invitationActivationRateReason: "single_use_invite_inventory_not_implemented",
    },
    stability: {
      generationCompletionRate: generationRate,
      generationSamples: matureRequests.length,
      generationLatencyP50Seconds: percentile(generationLatencies, 0.5),
      generationLatencyP90Seconds: percentile(generationLatencies, 0.9),
      exportSuccessRate: exportRate,
      exportSamples: artifacts.length,
      imagePageSuccessRate: imageRate,
      imagePageSamples: imageCompletedPages + imageFailedPages,
      queuedJobs: queuedJobs.length,
      oldestQueueMinutes,
      openP0,
      openP1,
      openFeedback: feedback.length,
    },
    alerts,
    unmeasuredUntilCloudTelemetry: ["http_uptime", "server_cpu_memory", "client_crash_free_sessions", "provider_latency_and_error_rate", "backup_freshness", "object_storage_capacity"],
  });
}
