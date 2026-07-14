"use client";

import { ArrowDown, ArrowUp, Loader2, Plus, RefreshCw, Trash2, WandSparkles } from "lucide-react";
import type { TeacherDeckPlan, TeacherDeckPlanPage } from "@/lib/teacher-courseware-task";

type Props = { plan: TeacherDeckPlan; busy: boolean; onChange: (plan: TeacherDeckPlan) => void; onRegenerate: () => void; onConfirm: () => void };

export function TeacherOutlinePlanner({ plan, busy, onChange, onRegenerate, onConfirm }: Props) {
  const editable = plan.status === "draft" || plan.status === "reviewing";
  const setPages = (pages: TeacherDeckPlanPage[]) => {
    if (!editable) return;
    onChange({ ...plan, status: "draft", pageCount: pages.length, pages });
  };
  const update = (index: number, patch: Partial<TeacherDeckPlanPage>) => setPages(plan.pages.map((page, current) => current === index ? { ...page, ...patch } : page));
  const move = (index: number, delta: -1 | 1) => { const target = index + delta; if (target < 0 || target >= plan.pages.length) return; const pages = [...plan.pages]; [pages[index], pages[target]] = [pages[target], pages[index]]; setPages(pages); };
  const remove = (index: number) => { if (plan.pages.length > 1) setPages(plan.pages.filter((_, current) => current !== index)); };
  const add = () => setPages([...plan.pages, { id: `outline-${Date.now()}`, role: "teaching_content", titleIntent: `第 ${plan.pages.length + 1} 页：新教学环节`, pagePurpose: "说明这一页在课堂中的作用", mustProve: "填写学生在这一页必须理解或完成的内容", layoutHint: "cards", priority: "recommended" }]);
  const valid = plan.pages.length > 0 && plan.pages.every((page) => page.titleIntent.trim() && page.pagePurpose.trim() && page.mustProve.trim());

  return <div className="space-y-3" data-testid="teacher-outline-planner">
    <div className="rounded-[22px] border border-[#b2ddff] bg-[#eef6ff] p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[#175cd3]">先确认教学大纲，再逐页生成</div><p className="mt-1 text-xs leading-5 text-[#475467]">页数由教学环节决定，不固定为 9 页。可以增删、排序并修改每页的课堂职责。</p></div><span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#175cd3]">{plan.pages.length} 页 · {plan.status}</span></div><button type="button" onClick={onRegenerate} disabled={busy} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#b2ddff] bg-white px-3 text-xs font-semibold text-[#175cd3] disabled:opacity-50">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}重新规划全部章节</button></div>
    {plan.pages.map((page, index) => <article key={page.id} className="rounded-2xl border border-line bg-white p-3" data-testid={`outline-page-${index}`}><div className="flex items-center gap-2"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#eef6ff] text-[11px] font-bold text-[#2f7cff]">{index + 1}</span><input aria-label={`第 ${index + 1} 页标题`} value={page.titleIntent} onChange={(event) => update(index, { titleIntent: event.target.value })} className="min-w-0 flex-1 border-0 text-sm font-semibold outline-none" /><button type="button" aria-label="上移" onClick={() => move(index, -1)} disabled={index === 0} className="flex size-7 items-center justify-center rounded-lg border border-line disabled:opacity-30"><ArrowUp className="size-3.5" /></button><button type="button" aria-label="下移" onClick={() => move(index, 1)} disabled={index === plan.pages.length - 1} className="flex size-7 items-center justify-center rounded-lg border border-line disabled:opacity-30"><ArrowDown className="size-3.5" /></button><button type="button" aria-label="删除" onClick={() => remove(index)} disabled={plan.pages.length <= 1} className="flex size-7 items-center justify-center rounded-lg border border-[#fee4e2] text-[#d92d20] disabled:opacity-30"><Trash2 className="size-3.5" /></button></div><label className="mt-3 block text-[11px] font-semibold text-[#667085]">课堂作用<textarea value={page.pagePurpose} onChange={(event) => update(index, { pagePurpose: event.target.value })} rows={2} className="mt-1 w-full resize-y rounded-xl border border-line px-3 py-2 text-xs leading-5 text-[#344054] outline-none focus:border-[#2f7cff]" /></label><label className="mt-2 block text-[11px] font-semibold text-[#667085]">这一页必须讲清<textarea value={page.mustProve} onChange={(event) => update(index, { mustProve: event.target.value })} rows={2} className="mt-1 w-full resize-y rounded-xl border border-line px-3 py-2 text-xs leading-5 text-[#344054] outline-none focus:border-[#2f7cff]" /></label></article>)}
    <button type="button" onClick={add} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#98a2b3] bg-white text-sm font-semibold text-[#475467]"><Plus className="size-4" />添加教学环节</button>
    <button type="button" onClick={onConfirm} disabled={busy || !valid} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}确认大纲并逐页生成</button>
    {!valid ? <p className="text-xs text-[#b42318]">每一页都必须填写标题、课堂作用和必须讲清的内容。</p> : null}
  </div>;
}
