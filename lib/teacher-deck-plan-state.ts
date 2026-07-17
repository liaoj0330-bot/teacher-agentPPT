import type { LessonBlueprint } from "@/lib/ppt-agent/content-plan";
import type { TeacherDeckPlan, TeacherDeckPlanPage, TeacherDeckPlanStatus } from "@/lib/teacher-courseware-task";

export type TeacherDeckPlanAction =
  | { type: "begin_generation" }
  | { type: "outline_generated"; pages: TeacherDeckPlanPage[] }
  | { type: "add_section"; page: TeacherDeckPlanPage; at?: number }
  | { type: "remove_section"; pageId: string }
  | { type: "move_section"; pageId: string; to: number }
  | { type: "rewrite_section"; pageId: string; patch: Partial<Omit<TeacherDeckPlanPage, "id">> }
  | { type: "confirm" }
  | { type: "start_compile" }
  | { type: "page_progress"; pageId: string; completed?: boolean; failed?: boolean }
  | { type: "complete" }
  | { type: "fail"; code: string; message: string; retryable?: boolean }
  | { type: "retry" | "resume" };

export class TeacherDeckPlanStateError extends Error {
  public code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "TeacherDeckPlanStateError";
  }
}

const allowed: Record<TeacherDeckPlanStatus, TeacherDeckPlanStatus[]> = {
  draft: ["generating", "failed"], generating: ["reviewing", "failed"], reviewing: ["confirmed", "failed"],
  confirmed: ["reviewing", "compiling", "failed"], compiling: ["ready", "failed"], ready: ["reviewing", "compiling"],
  failed: ["draft", "generating", "reviewing", "confirmed", "compiling"],
};
const timestamp = () => new Date().toISOString();
const editable = (status: TeacherDeckPlanStatus) => status === "draft" || status === "reviewing";

function validatePage(page: TeacherDeckPlanPage) {
  if (!page.id?.trim() || !page.role?.trim() || !page.titleIntent?.trim() || !page.pagePurpose?.trim() || !page.mustProve?.trim())
    throw new TeacherDeckPlanStateError("INVALID_SECTION", "章节必须包含 id、角色、标题意图、页面目的和必须证明的内容。");
  return { ...page, id: page.id.trim(), role: page.role.trim(), titleIntent: page.titleIntent.trim(), pagePurpose: page.pagePurpose.trim(), mustProve: page.mustProve.trim() };
}

function validatePages(pages: TeacherDeckPlanPage[]) {
  if (!pages.length) throw new TeacherDeckPlanStateError("EMPTY_PLAN", "大纲至少需要一页；页数由内容决定，不固定为 9 页。");
  const ids = new Set<string>();
  pages.forEach((page) => { validatePage(page); if (ids.has(page.id)) throw new TeacherDeckPlanStateError("DUPLICATE_SECTION", `章节 ID 重复：${page.id}`); ids.add(page.id); });
}

function transition(plan: TeacherDeckPlan, to: TeacherDeckPlanStatus, event: string): TeacherDeckPlan {
  if (!allowed[plan.status]?.includes(to)) throw new TeacherDeckPlanStateError("INVALID_TRANSITION", `不能从 ${plan.status} 通过 ${event} 进入 ${to}。`);
  return { ...plan, status: to, revision: (plan.revision ?? 0) + 1, transitions: [...(plan.transitions ?? []), { from: plan.status, to, event, at: timestamp() }].slice(-50) };
}

function replacePages(plan: TeacherDeckPlan, pages: TeacherDeckPlanPage[]) {
  if (!editable(plan.status)) throw new TeacherDeckPlanStateError("PLAN_LOCKED", `计划处于 ${plan.status}，不能编辑章节。`);
  validatePages(pages);
  return { ...plan, pages: pages.map(validatePage), pageCount: pages.length, revision: (plan.revision ?? 0) + 1,
    progress: { totalPages: pages.length, completedPages: 0, completedPageIds: [], failedPageIds: [], updatedAt: timestamp() } };
}

export function createTeacherDeckPlan(planId: string, pages: TeacherDeckPlanPage[], lessonBlueprint?: LessonBlueprint): TeacherDeckPlan {
  const draft: TeacherDeckPlan = { planId, status: "draft", pageCount: 0, pages: [], lessonBlueprint, revision: 0, transitions: [], progress: { totalPages: 0, completedPages: 0, completedPageIds: [], failedPageIds: [], updatedAt: timestamp() } };
  return reduceTeacherDeckPlan(reduceTeacherDeckPlan(draft, { type: "begin_generation" }), { type: "outline_generated", pages });
}

export function reduceTeacherDeckPlan(plan: TeacherDeckPlan, action: TeacherDeckPlanAction): TeacherDeckPlan {
  switch (action.type) {
    case "begin_generation": return transition(plan, "generating", action.type);
    case "outline_generated": {
      if (plan.status !== "generating") throw new TeacherDeckPlanStateError("INVALID_TRANSITION", "只有 generating 可以接收大纲。");
      const reviewing = transition(plan, "reviewing", action.type); return replacePages(reviewing, action.pages);
    }
    case "add_section": { const pages = [...plan.pages]; pages.splice(Math.max(0, Math.min(pages.length, action.at ?? pages.length)), 0, action.page); return replacePages(plan, pages); }
    case "remove_section": { const pages = plan.pages.filter((page) => page.id !== action.pageId); if (pages.length === plan.pages.length) throw new TeacherDeckPlanStateError("SECTION_NOT_FOUND", "找不到章节。"); return replacePages(plan, pages); }
    case "move_section": { const from = plan.pages.findIndex((page) => page.id === action.pageId); if (from < 0) throw new TeacherDeckPlanStateError("SECTION_NOT_FOUND", "找不到章节。"); const pages = [...plan.pages]; const [page] = pages.splice(from, 1); pages.splice(Math.max(0, Math.min(pages.length, action.to)), 0, page); return replacePages(plan, pages); }
    case "rewrite_section": { const index = plan.pages.findIndex((page) => page.id === action.pageId); if (index < 0) throw new TeacherDeckPlanStateError("SECTION_NOT_FOUND", "找不到章节。"); const pages = [...plan.pages]; pages[index] = { ...pages[index], ...action.patch, id: pages[index].id }; return replacePages(plan, pages); }
    case "confirm": { validatePages(plan.pages); return { ...transition(plan, "confirmed", action.type), confirmedAt: timestamp(), failure: undefined }; }
    case "start_compile": { validatePages(plan.pages); const next = transition(plan, "compiling", action.type); return { ...next, failure: undefined, progress: { totalPages: plan.pages.length, completedPages: 0, completedPageIds: [], failedPageIds: [], updatedAt: timestamp() } }; }
    case "page_progress": { if (plan.status !== "compiling") throw new TeacherDeckPlanStateError("INVALID_TRANSITION", "逐页进度只能在 compiling 更新。"); if (!plan.pages.some((page) => page.id === action.pageId)) throw new TeacherDeckPlanStateError("SECTION_NOT_FOUND", "找不到进度对应章节。"); const previous = plan.progress ?? { totalPages: plan.pages.length, completedPages: 0, completedPageIds: [], failedPageIds: [], updatedAt: timestamp() }; const failed = new Set(previous.failedPageIds); const completed = new Set(previous.completedPageIds ?? []); action.failed ? failed.add(action.pageId) : failed.delete(action.pageId); if (action.completed) completed.add(action.pageId); if (action.failed) completed.delete(action.pageId); return { ...plan, revision: (plan.revision ?? 0) + 1, progress: { ...previous, activePageId: action.pageId, completedPages: completed.size, completedPageIds: [...completed], failedPageIds: [...failed], updatedAt: timestamp() } }; }
    case "complete": { if (plan.status !== "compiling") throw new TeacherDeckPlanStateError("INVALID_TRANSITION", "只有 compiling 可以完成。"); return { ...transition(plan, "ready", action.type), failure: undefined, progress: { totalPages: plan.pages.length, completedPages: plan.pages.length, completedPageIds: plan.pages.map((page) => page.id), failedPageIds: [], updatedAt: timestamp() } }; }
    case "fail": { const resumeStatus = plan.status === "failed" ? plan.failure?.resumeStatus ?? "reviewing" : plan.status; const next = plan.status === "failed" ? plan : transition(plan, "failed", action.type); return { ...next, failure: { code: action.code, message: action.message, retryable: action.retryable !== false, failedAt: timestamp(), resumeStatus } }; }
    case "retry": case "resume": { if (plan.status !== "failed" || !plan.failure) throw new TeacherDeckPlanStateError("INVALID_TRANSITION", "只有失败计划可以重试或恢复。"); if (action.type === "retry" && !plan.failure.retryable) throw new TeacherDeckPlanStateError("NOT_RETRYABLE", "该失败不可重试。"); return { ...transition(plan, plan.failure.resumeStatus, action.type), failure: undefined }; }
  }
}

export function assertTeacherDeckPlan(plan: TeacherDeckPlan) { if (!plan.planId) throw new TeacherDeckPlanStateError("INVALID_PLAN", "缺少 planId。"); if (plan.pageCount !== plan.pages.length) throw new TeacherDeckPlanStateError("COUNT_MISMATCH", "pageCount 与页面数组不一致。"); validatePages(plan.pages); return plan; }
