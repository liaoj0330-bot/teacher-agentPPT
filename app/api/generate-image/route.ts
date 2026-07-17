import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createImageJob,
  imageJobResponse,
  ownerKeyFor
} from "@/lib/image-generation-jobs";
import { generateImageForRequest } from "@/lib/image-generation-provider";
import { scheduleImageJob } from "@/lib/image-generation-worker";

function teacherRoleKind(value: string) {
  if (/cover|封面/.test(value)) return "cover";
  if (/目标|评价/.test(value)) return "objectives";
  if (/导入|情境|前置|已有/.test(value)) return "lead_in";
  if (/例题|示范|推导/.test(value)) return "example";
  if (/纠错|错因|易错|再练习/.test(value)) return "misconception";
  if (/练习|互动|探究|操作|反馈/.test(value)) return "practice";
  if (/总结|作业|回顾|迁移/.test(value)) return "summary";
  if (/教材|定义|概念|讲解|算理/.test(value)) return "concept";
  return "content";
}

function asyncPages(body: Record<string, unknown>) {
  const source = Array.isArray(body.pages) ? body.pages : [body];
  const pages: Array<{ pageId: string; prompt: string; size?: string; title?: string }> = [];
  for (let index = 0; index < Math.min(source.length, 20); index += 1) {
    const page = source[index];
    if (!page || typeof page !== "object") continue;
    const record = page as Record<string, unknown>;
    const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
    if (!prompt) continue;
    pages.push({
      pageId: typeof record.pageId === "string" && record.pageId.trim() ? record.pageId.trim() : `page-${index + 1}`,
      prompt,
      size: typeof record.size === "string" && record.size.trim() ? record.size.trim() : undefined,
      title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : undefined
    });
  }
  return pages;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (body && typeof body === "object" && (body.async === true || body.mode === "async" || Array.isArray(body.pages))) {
    const parsedBody = body as Record<string, unknown>;
    const pages = asyncPages(parsedBody);
    if (!pages.length) return NextResponse.json({ error: "invalid_image_pages", message: "至少需要一个包含 prompt 的页面。" }, { status: 400 });
    const user = await getCurrentUser().catch(() => null);
    const ownerKey = ownerKeyFor(user?.id);
    const idempotencyKey = request.headers.get("idempotency-key") || (typeof parsedBody.idempotencyKey === "string" ? parsedBody.idempotencyKey : undefined);
    const created = await createImageJob({
      ownerKey,
      userId: user?.id,
      idempotencyKey,
      pages,
      request: { title: parsedBody.title, context: parsedBody.context, source: "generate-image" }
    });
    if (!created.deduped || created.job.status === "queued") scheduleImageJob(created.job.jobId, ownerKey);
    return NextResponse.json({ ...created.job, deduped: created.deduped }, { status: created.deduped ? 200 : 202 });
  }
  const title = typeof body?.title === "string" && body.title.trim() ? body.title.trim() : "AI PPT Agent";
  const requestedPrompt =
    typeof body?.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim()
      : `生成一张高级干净的 PPT 视觉图，主题：${title}。浅色商务风，真实场景质感，适合作为 16:9 PPT 背景，不要文字，不要水印。`;
  const teacherRole = body?.context === "teacher_courseware" ? teacherRoleKind(String(body?.slideRole || "")) : "";
  const prompt = teacherRole === "cover"
    ? `真实课堂主视觉：${requestedPrompt}。教师在明亮现代教室的白板前授课，学生和教材作为背景，教育摄影或高质量教育插画，蓝色与暖色点缀，标题安全留白。禁止坐标轴、函数曲线、公式、数字、图表、流程图、文字、Logo、UI截图和水印。`
    : teacherRole === "objectives"
      ? `学习目标视觉：${requestedPrompt}。使用清晰的学习材料、路线或课堂成果意象，构图简洁，保留大片留白。禁止任何可读文字、数字、算式、表格、卡片界面、Logo和水印。`
    : teacherRole === "lead_in"
      ? `数学课堂真实情境图：${requestedPrompt}。必须是学生熟悉的生活场景，能观察到两个量共同变化，构图清晰，适合16:9课堂投影右侧配图。不要公式、坐标轴、图表、文字、Logo、UI截图和水印。`
      : teacherRole === "example"
        ? `例题实物图：${requestedPrompt}。只表现数量、分组、移动或比较的实物关系，物体个数清楚且可数。不要生成数字、算式、等号、答案框、文字、Logo、UI截图和水印；算式由PPT原生对象另行叠加。`
      : teacherRole === "practice"
        ? `课堂操作活动图：${requestedPrompt}。突出学生可操作的学具、分类、组合或拿取过程，画面只承担情境和观察证据。不要生成数字、公式、答案框、可读文字、Logo、UI截图和水印。`
      : teacherRole === "misconception"
        ? `纠错观察图：${requestedPrompt}。用两种清楚的实物状态呈现可比较的错误线索与修正结果，但不直接写答案。不要生成数字、公式、文字、Logo、UI截图和水印。`
      : teacherRole === "summary"
        ? `课堂总结记忆图：${requestedPrompt}。使用简洁的学具、生活物品或知识迁移场景形成单一记忆锚点。不要生成数字、公式、可读文字、Logo、UI截图和水印。`
      : teacherRole === "concept"
        ? `概念直观图：${requestedPrompt}。使用真实学具或清晰科学插画表达关系和变化，只画可观察对象，不在图片内写定义或结论。不要生成数字、公式、文字、Logo、UI截图和水印。`
          : requestedPrompt;
  const size = typeof body?.size === "string" && body.size.trim() ? body.size.trim() : process.env.OPENAI_IMAGE_SIZE || "1024x1024";

  try {
    const result = await generateImageForRequest(prompt, size);
    return NextResponse.json({ ...result, provider: "openai-compatible" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "image generation failed";
    console.error("[generate-image] OpenAI-compatible image request failed.", message);
    return NextResponse.json({ error: "image_generation_failed", message }, { status: 502 });
  }
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim();
  if (!jobId) return NextResponse.json({ error: "job_id_required" }, { status: 400 });
  const user = await getCurrentUser().catch(() => null);
  const ownerKey = ownerKeyFor(user?.id);
  const job = await imageJobResponse(jobId, ownerKey);
  if (job?.status === "queued") scheduleImageJob(jobId, ownerKey);
  return job ? NextResponse.json(job) : NextResponse.json({ error: "image_job_not_found" }, { status: 404 });
}
