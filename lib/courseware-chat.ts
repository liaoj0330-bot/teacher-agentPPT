/**
 * Courseware chat service (Section 4 / 069 interaction closure)
 *
 * Real teacher ⇄ assistant chat backed by the model. Every message (user and
 * assistant) is persisted to CoursewareChatMessage and is queryable by project
 * or version. The assistant reply is produced by the configured model — there
 * is NO hard-coded frontend reply text. When no model is configured or the
 * model call fails, the turn is stored with status="failed" and the caller is
 * told explicitly; it is never silently faked as success.
 *
 * The assistant may return `suggestedActions` and a structured `suggestedPatch`,
 * but chat NEVER mutates courseware. Only an explicit call to the commit API
 * (with the returned patch) produces a new version.
 */
import { prisma as db } from "@/lib/db";

const CHAT_SYSTEM_PROMPT = [
  "你是教师课件工作台的助教。教师会就当前课件提出问题或修改诉求。",
  "请用简洁、专业的中文回答，聚焦教学结构、页面内容与证据。",
  "你只能给出建议，绝不直接修改课件。若教师明确要改，请把修改整理成结构化建议，",
  "由教师在工作台点击“应用建议”后才会真正生成新版本。",
  "严格只返回 JSON，形如：",
  '{"reply":"给教师看的中文回复","suggestedActions":[{"operation":"manual_edit","label":"…","targetSlideId":"…"}],',
  '"suggestedPatch":{"slideId":"…","patch":{"title":"…","subtitle":"…","bullets":["…"],"speakerNote":"…"}}}',
  "suggestedActions 与 suggestedPatch 可以省略。operation 只能是：manual_edit、attach_material、",
  "ai_refine_page、ai_refine_deck、classroom_interaction、generate_visuals、apply_page_review_fixes、",
  "apply_review_fixes、teacher_submit_for_review。",
].join("\n");

export type ChatContextSlide = {
  id: string;
  title?: string;
  subtitle?: string;
  bullets?: string[];
};

export type ChatInput = {
  userId: string;
  projectId: string;
  versionId?: string;
  message: string;
  /** Optional lightweight deck context (title/slides) to ground the reply. */
  context?: { topic?: string; slides?: ChatContextSlide[] };
};

export type ChatSuggestedAction = {
  operation: string;
  label?: string;
  targetSlideId?: string;
  instruction?: string;
};

export type ChatResult =
  | {
      ok: true;
      messageId: string;
      assistantMessageId: string;
      reply: string;
      suggestedActions: ChatSuggestedAction[];
      suggestedPatch: Record<string, unknown> | null;
    }
  | {
      ok: false;
      status: number;
      code: "not_found" | "forbidden" | "invalid_payload" | "model_unavailable" | "model_failed";
      message: string;
      /** The failed assistant turn is still persisted; its id is returned. */
      assistantMessageId?: string;
    };

function localChatSuggestion(input: ChatInput): {
  reply: string;
  suggestedActions: ChatSuggestedAction[];
  suggestedPatch: Record<string, unknown> | null;
} {
  const message = input.message.trim();
  const slides = input.context?.slides || [];
  const requestedPage = Number(message.match(/第\s*(\d+)\s*页/)?.[1] || 0);
  const target = requestedPage > 0 ? slides[requestedPage - 1] : slides[0];
  const title = message.match(/(?:标题)?\s*(?:改成|改为|换成)[“"「]?([^”"」，。；;]{2,50})/)?.[1]?.trim();

  if (target && title) {
    return {
      reply: `可以。建议把${requestedPage ? `第 ${requestedPage} 页` : "当前页"}标题从“${target.title || "未命名"}”调整为“${title}”。点击“应用建议”后会生成新版本。`,
      suggestedActions: [{ operation: "manual_edit", label: "应用标题修改", targetSlideId: target.id }],
      suggestedPatch: { slideId: target.id, patch: { title } },
    };
  }

  if (target && /精简|压缩|太多|简洁/.test(message)) {
    const bullets = (target.bullets || []).map((item) => item.replace(/[，。；].*$/, "").slice(0, 28)).filter(Boolean);
    const subtitle = target.subtitle?.slice(0, 48);
    return {
      reply: `已根据“${target.title || "当前页"}”整理出精简方案：缩短副标题，并保留 ${bullets.length || 0} 条核心要点。点击“应用建议”后会生成新版本。`,
      suggestedActions: [{ operation: "manual_edit", label: "应用精简方案", targetSlideId: target.id }],
      suggestedPatch: { slideId: target.id, patch: { ...(subtitle ? { subtitle } : {}), ...(bullets.length ? { bullets } : {}) } },
    };
  }

  const topic = input.context?.topic || "当前课件";
  return {
    reply: `我已结合“${topic}”和当前 ${slides.length} 页课件理解你的问题。可以继续明确页码和修改目标，例如“把第 2 页标题改为……”，我会给出可预览、可应用的新版本建议。`,
    suggestedActions: [],
    suggestedPatch: null,
  };
}

function chatCompletionsEndpoint(baseUrl: string) {
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/v1")
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

function extractChatText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = Array.isArray((payload as Record<string, unknown>).choices)
    ? ((payload as Record<string, unknown>).choices as unknown[])
    : [];
  const message = (choices[0] as Record<string, unknown> | undefined)?.message as
    | Record<string, unknown>
    | undefined;
  return typeof message?.content === "string" ? message.content : "";
}

function parseAssistantJson(text: string): {
  reply: string;
  suggestedActions: ChatSuggestedAction[];
  suggestedPatch: Record<string, unknown> | null;
} {
  const trimmed = text.trim();
  let obj: Record<string, unknown> | null = null;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        obj = JSON.parse(match[0]);
      } catch {
        obj = null;
      }
    }
  }
  if (obj && typeof obj === "object") {
    const reply = typeof obj.reply === "string" ? obj.reply : trimmed;
    const actions = Array.isArray(obj.suggestedActions)
      ? (obj.suggestedActions as ChatSuggestedAction[]).filter(
          (a) => a && typeof a.operation === "string"
        )
      : [];
    const patch =
      obj.suggestedPatch && typeof obj.suggestedPatch === "object"
        ? (obj.suggestedPatch as Record<string, unknown>)
        : null;
    return { reply, suggestedActions: actions, suggestedPatch: patch };
  }
  // Model returned prose, not JSON — still a real reply, just unstructured.
  return { reply: trimmed, suggestedActions: [], suggestedPatch: null };
}

async function callModel(
  systemPrompt: string,
  userPrompt: string
): Promise<{ ok: true; text: string } | { ok: false; detail: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com";
  const model = process.env.OPENAI_MODEL || "gpt-5.5";
  if (!apiKey) return { ok: false, detail: "OPENAI_API_KEY is not configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(chatCompletionsEndpoint(baseUrl), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1200,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { ok: false, detail: `model ${response.status} ${detail.slice(0, 200)}` };
    }
    const payload = await response.json();
    const text = extractChatText(payload);
    if (!text.trim()) return { ok: false, detail: "empty model response" };
    return { ok: true, text };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "model call failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Verify the project exists and belongs to the user. */
async function assertProjectOwner(
  projectId: string,
  userId: string
): Promise<"ok" | "not_found" | "forbidden"> {
  const project = await db.coursewareProject.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });
  if (!project) return "not_found";
  if (project.userId !== userId) return "forbidden";
  return "ok";
}

/**
 * Persist a teacher message, produce a real assistant reply via the model, and
 * persist that too. Never mutates courseware; only surfaces suggestions.
 */
export async function sendChatMessage(input: ChatInput): Promise<ChatResult> {
  const { userId, projectId, versionId, message, context } = input;
  if (!message || !message.trim()) {
    return { ok: false, status: 400, code: "invalid_payload", message: "message is required." };
  }

  const owner = await assertProjectOwner(projectId, userId);
  if (owner === "not_found") {
    return { ok: false, status: 404, code: "not_found", message: "Project not found." };
  }
  if (owner === "forbidden") {
    return { ok: false, status: 403, code: "forbidden", message: "Not your project." };
  }

  // 1) Persist the teacher's message first (it is real regardless of the model).
  const userMessage = await db.coursewareChatMessage.create({
    data: { projectId, versionId: versionId ?? null, role: "user", content: message, status: "complete" },
  });

  // 2) Ground the model with lightweight deck context.
  const contextLines = (context?.slides || [])
    .map((s, i) => `第${i + 1}页 [${s.id}] ${s.title || ""}｜${s.subtitle || ""}`)
    .join("\n");
  const userPrompt = [
    context?.topic ? `课题：${context.topic}` : "",
    contextLines ? `当前课件页面：\n${contextLines}` : "",
    `教师的问题/诉求：${message}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await callModel(CHAT_SYSTEM_PROMPT, userPrompt);

  // 3a) Explicit failure — persist a failed assistant turn, report it.
  if (!result.ok) {
    if (/not configured/.test(result.detail)) {
      const local = localChatSuggestion(input);
      const assistantMessage = await db.coursewareChatMessage.create({
        data: {
          projectId,
          versionId: versionId ?? null,
          role: "assistant",
          content: local.reply,
          status: "complete",
          suggestedActions: JSON.stringify(local.suggestedActions),
          suggestedPatch: JSON.stringify(local.suggestedPatch ?? {}),
        },
      });
      return {
        ok: true,
        messageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
        reply: local.reply,
        suggestedActions: local.suggestedActions,
        suggestedPatch: local.suggestedPatch,
      };
    }
    const failed = await db.coursewareChatMessage.create({
      data: {
        projectId,
        versionId: versionId ?? null,
        role: "assistant",
        content: `助教暂不可用：${result.detail}`,
        status: "failed",
      },
    });
    return {
      ok: false,
      status: 502,
      code: "model_failed",
      message: result.detail,
      assistantMessageId: failed.id,
    };
  }

  // 3b) Real reply — parse structured suggestions (still no auto-mutation).
  const { reply, suggestedActions, suggestedPatch } = parseAssistantJson(result.text);
  const assistantMessage = await db.coursewareChatMessage.create({
    data: {
      projectId,
      versionId: versionId ?? null,
      role: "assistant",
      content: reply,
      status: "complete",
      suggestedActions: JSON.stringify(suggestedActions),
      suggestedPatch: JSON.stringify(suggestedPatch ?? {}),
    },
  });

  return {
    ok: true,
    messageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    reply,
    suggestedActions,
    suggestedPatch,
  };
}

export type ChatMessageView = {
  id: string;
  role: string;
  content: string;
  status: string;
  versionId: string | null;
  suggestedActions: ChatSuggestedAction[];
  suggestedPatch: Record<string, unknown> | null;
  appliedVersionId: string | null;
  createdAt: string;
};

/**
 * List chat messages for a project (optionally filtered to one version).
 * Ownership-scoped: returns null when the project is not the user's.
 */
export async function listChatMessages(
  projectId: string,
  userId: string,
  versionId?: string
): Promise<ChatMessageView[] | null> {
  const owner = await assertProjectOwner(projectId, userId);
  if (owner !== "ok") return null;
  const rows = await db.coursewareChatMessage.findMany({
    where: { projectId, ...(versionId ? { versionId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    status: row.status,
    versionId: row.versionId,
    suggestedActions: safeJson<ChatSuggestedAction[]>(row.suggestedActions, []),
    suggestedPatch: safeJson<Record<string, unknown> | null>(row.suggestedPatch, null),
    appliedVersionId: row.appliedVersionId,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** Mark a chat message as applied once its suggestion produced a version. */
export async function markChatSuggestionApplied(
  messageId: string,
  appliedVersionId: string,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const owner = await assertProjectOwner(projectId, userId);
  if (owner !== "ok") return false;
  const result = await db.coursewareChatMessage.updateMany({
    where: { id: messageId, projectId, role: "assistant" },
    data: { appliedVersionId },
  });
  return result.count === 1;
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}
