"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpenCheck,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { Background, BackgroundVariant, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LessonEvent } from "@/lib/ppt-agent/content-plan";
import type { TeacherDeckPlan, TeacherDeckPlanPage } from "@/lib/teacher-courseware-task";

type Props = {
  plan: TeacherDeckPlan;
  busy: boolean;
  onChange: (plan: TeacherDeckPlan) => void;
  onRegenerate: () => void;
  onConfirm: () => void;
};

const architectureNames = {
  play_based_discovery: "游戏化发现活动",
  experiment_inquiry: "实验探究课",
  close_reading: "文本精读课",
  concept_building: "概念建构课",
  representation_modeling: "数学表征建模课",
  evidence_experiment: "化学证据实验课",
  observation_systems: "生物观察系统课",
  source_inquiry: "历史史料探究课",
  spatial_reasoning: "地理空间推理课",
  communicative_task_cycle: "英语交际任务课",
  skill_practice: "技能训练课",
  review_consolidation: "复习巩固课",
  general_lesson: "综合课",
};

function LessonCanvas({ plan, lessonPlan }: { plan: TeacherDeckPlan; lessonPlan: NonNullable<TeacherDeckPlan["lessonPlan"]> }) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    lessonPlan.events.forEach((event, eventIndex) => {
      const eventId = `event-${event.id}`;
      const pages = plan.pages.filter((page) => page.lessonEventId === event.id);
      nodes.push({
        id: eventId,
        position: { x: (eventIndex % 2) * 294, y: Math.floor(eventIndex / 2) * 150 },
        data: { label: <div className="w-52"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-[#175cd3]">{event.durationMinutes} 分钟</span><span className="text-[10px] font-semibold text-[#667085]">{pages.length} 页投影</span></div><div className="mt-1 text-sm font-semibold text-[#1d2939]">{event.title}</div><div className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#667085]">{pages.map((page, index) => `${plan.pages.indexOf(page) + 1}. ${page.titleIntent}`).join(" · ")}</div></div> },
        style: { border: "1px solid #98b8ff", borderRadius: 8, background: "#f5f9ff", padding: 10 },
      });
      if (eventIndex > 0) edges.push({ id: `event-flow-${eventIndex}`, source: `event-${lessonPlan.events[eventIndex - 1].id}`, target: eventId, type: "smoothstep", style: { stroke: "#84adff" } });
    });
    return { nodes, edges };
  }, [lessonPlan, plan.pages]);

  return <div className="h-[420px] overflow-hidden border border-line bg-[#f8fafc]" data-testid="teacher-lesson-canvas">
    <ReactFlow nodes={nodes} edges={edges} fitView minZoom={0.15} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }}>
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#d0d5dd" />
      <Controls showInteractive={false} className="!rounded-lg !border !border-line !bg-white" />
    </ReactFlow>
  </div>;
}

export function TeacherOutlinePlanner({ plan, busy, onChange, onRegenerate, onConfirm }: Props) {
  const [viewMode, setViewMode] = useState<"list" | "canvas">("canvas");
  const editable = plan.status === "draft" || plan.status === "reviewing";
  const blueprint = plan.lessonBlueprint;
  const lessonPlan = blueprint?.lessonPlan || plan.lessonPlan;

  const setPages = (pages: TeacherDeckPlanPage[]) => {
    if (!editable) return;
    onChange({ ...plan, status: "draft", pageCount: pages.length, pages });
  };
  const updatePage = (index: number, patch: Partial<TeacherDeckPlanPage>) => {
    setPages(plan.pages.map((page, current) => current === index ? { ...page, ...patch } : page));
  };
  const updateEvent = (index: number, patch: Partial<LessonEvent>) => {
    if (!editable || !blueprint || !lessonPlan) return;
    const events = lessonPlan.events.map((event, current) => current === index ? { ...event, ...patch } : event);
    const nextLessonPlan = { ...lessonPlan, events };
    onChange({
      ...plan,
      status: "draft",
      lessonPlan: nextLessonPlan,
      lessonBlueprint: { ...blueprint, status: "teacher_confirmation_required", lessonPlan: nextLessonPlan },
    });
  };
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= plan.pages.length) return;
    const pages = [...plan.pages];
    [pages[index], pages[target]] = [pages[target], pages[index]];
    setPages(pages);
  };
  const remove = (index: number) => {
    if (plan.pages.length > 1) setPages(plan.pages.filter((_, current) => current !== index));
  };
  const add = () => setPages([
    ...plan.pages,
    {
      id: `outline-${Date.now()}`,
      role: "teaching_content",
      titleIntent: `新教学页面`,
      pagePurpose: "说明这一页服务哪个课堂事件",
      mustProve: "填写学生在这一页必须观察、理解或完成的内容",
      layoutHint: "cards",
      priority: "recommended",
      lessonEventId: lessonPlan?.events.at(-1)?.id,
    },
  ]);
  const valid = plan.pages.length > 0
    && plan.pages.every((page) => page.titleIntent.trim() && page.pagePurpose.trim() && page.mustProve.trim() && page.lessonEventId)
    && Boolean(blueprint && lessonPlan?.events.length && lessonPlan.events.reduce((sum, event) => sum + event.durationMinutes, 0) === lessonPlan.totalMinutes);

  return (
    <div className="space-y-5" data-testid="teacher-outline-planner">
      <div className="flex border border-line bg-white p-1" role="tablist" aria-label="课堂方案视图">
        <button type="button" role="tab" aria-selected={viewMode === "canvas"} onClick={() => setViewMode("canvas")} className={`flex-1 px-3 py-2 text-xs font-semibold ${viewMode === "canvas" ? "bg-[#171719] text-white" : "text-[#667085]"}`}>课堂画布</button>
        <button type="button" role="tab" aria-selected={viewMode === "list"} onClick={() => setViewMode("list")} className={`flex-1 px-3 py-2 text-xs font-semibold ${viewMode === "list" ? "bg-[#171719] text-white" : "text-[#667085]"}`}>列表编辑</button>
      </div>

      {viewMode === "canvas" && lessonPlan ? <LessonCanvas plan={plan} lessonPlan={lessonPlan} /> : null}

      <section className="border-b border-line pb-5" data-testid="lesson-blueprint-summary">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#175cd3]">
              <BookOpenCheck className="size-4" />
              先确认这节课怎么上
            </div>
            <p className="mt-1 text-xs leading-5 text-[#475467]">页面由课堂方案派生。先检查课型、目标、难点和课堂节奏，再生成投影课件。</p>
          </div>
          {blueprint ? (
            <span className="shrink-0 rounded-full bg-[#eef6ff] px-2.5 py-1 text-[11px] font-semibold text-[#175cd3]">
              {architectureNames[blueprint.architecture]}
            </span>
          ) : null}
        </div>
        {blueprint ? (
          <div className="mt-4 space-y-4">
            <div>
              <div className="text-[11px] font-semibold text-[#667085]">这节课交付什么结果</div>
              <p className="mt-1 text-sm leading-6 text-[#1d2939]">{blueprint.lessonPromise}</p>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-[#667085]">驱动问题</div>
              <p className="mt-1 text-sm leading-6 text-[#1d2939]">{blueprint.drivingQuestion}</p>
            </div>
            <div className="border-l-2 border-[#84adff] pl-3 text-xs leading-5 text-[#475467]">{blueprint.architectureReason}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold text-[#667085]">学习目标与证据</div>
                <div className="mt-2 space-y-2">
                  {blueprint.objectives.map((objective, index) => (
                    <div key={objective.id} className="text-xs leading-5 text-[#344054]">
                      <b>{index + 1}. {objective.statement}</b>
                      <div className="text-[#667085]">证据：{objective.evidence}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-[#667085]">关键难点与突破</div>
                <div className="mt-2 space-y-2">
                  {blueprint.keyDifficulties.map((item) => (
                    <div key={item.focus} className="text-xs leading-5 text-[#344054]">
                      <b>{item.focus}</b>
                      <div className="text-[#667085]">{item.breakthrough}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {blueprint.teacherDecisions.some((item) => item.requiredBeforeGeneration) ? (
              <div className="border border-[#fedf89] bg-[#fffaeb] p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#93370d]"><AlertTriangle className="size-4" />生成前需要复核</div>
                <div className="mt-2 space-y-1 text-xs leading-5 text-[#7a2e0e]">
                  {blueprint.teacherDecisions.filter((item) => item.requiredBeforeGeneration).map((item) => <p key={item.id}>{item.question} 当前假设：{item.assumption}</p>)}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-4 text-xs text-[#b42318]">规划服务没有返回课堂蓝图，请重新规划。</p>
        )}
        <button type="button" onClick={onRegenerate} disabled={busy} className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#b2ddff] bg-white px-3 text-xs font-semibold text-[#175cd3] disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          重新规划整节课
        </button>
      </section>

      {viewMode === "list" && lessonPlan ? (
        <section data-testid="lesson-event-plan">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#1d2939]">45 分钟课堂节奏</h3>
              <p className="mt-1 text-xs text-[#667085]">可修改每个环节的教师动作和学生任务。</p>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-[#175cd3]"><Clock3 className="size-4" />{lessonPlan.totalMinutes} 分钟</div>
          </div>
          <div className="mt-3 space-y-3">
            {lessonPlan.events.map((event, index) => (
              <article key={event.id} className="border-l-2 border-[#d1e0ff] pl-3" data-testid={`lesson-event-${index}`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#175cd3]">{event.durationMinutes} 分钟</span>
                  <input aria-label={`第 ${index + 1} 个课堂环节`} value={event.title} onChange={(change) => updateEvent(index, { title: change.target.value })} className="min-w-0 flex-1 border-0 text-sm font-semibold text-[#1d2939] outline-none" />
                </div>
                <label className="mt-2 block text-[11px] font-semibold text-[#667085]">教师动作<textarea value={event.teacherAction} onChange={(change) => updateEvent(index, { teacherAction: change.target.value })} rows={2} className="mt-1 w-full resize-y rounded-lg border border-line px-2.5 py-2 text-xs leading-5 text-[#344054] outline-none focus:border-[#2f7cff]" /></label>
                <label className="mt-2 block text-[11px] font-semibold text-[#667085]">学生任务<textarea value={event.studentAction} onChange={(change) => updateEvent(index, { studentAction: change.target.value })} rows={2} className="mt-1 w-full resize-y rounded-lg border border-line px-2.5 py-2 text-xs leading-5 text-[#344054] outline-none focus:border-[#2f7cff]" /></label>
                <div className="mt-2 text-[11px] leading-5 text-[#667085]">学习证据：{event.evidenceOfLearning}</div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {viewMode === "list" ? <section className="border-t border-line pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#1d2939]">投影页面</h3>
            <p className="mt-1 text-xs leading-5 text-[#667085]">当前 {plan.pages.length} 页，服务于 {lessonPlan?.events.length || 0} 个课堂事件。可继续增删和排序。</p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-[#175cd3]">{plan.pages.length} 页</span>
        </div>
        <div className="mt-3 space-y-3">
          {plan.pages.map((page, index) => (
            <article key={page.id} className="rounded-lg border border-line bg-white p-3" data-testid={`outline-page-${index}`}>
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#eef6ff] text-[11px] font-bold text-[#2f7cff]">{index + 1}</span>
                <input aria-label={`第 ${index + 1} 页标题`} value={page.titleIntent} onChange={(change) => updatePage(index, { titleIntent: change.target.value })} className="min-w-0 flex-1 border-0 text-sm font-semibold outline-none" />
                <button type="button" aria-label="上移" title="上移" onClick={() => move(index, -1)} disabled={index === 0} className="flex size-7 items-center justify-center rounded-lg border border-line disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                <button type="button" aria-label="下移" title="下移" onClick={() => move(index, 1)} disabled={index === plan.pages.length - 1} className="flex size-7 items-center justify-center rounded-lg border border-line disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                <button type="button" aria-label="删除" title="删除" onClick={() => remove(index)} disabled={plan.pages.length <= 1} className="flex size-7 items-center justify-center rounded-lg border border-[#fee4e2] text-[#d92d20] disabled:opacity-30"><Trash2 className="size-3.5" /></button>
              </div>
              <label className="mt-3 block text-[11px] font-semibold text-[#667085]">课堂作用<textarea value={page.pagePurpose} onChange={(change) => updatePage(index, { pagePurpose: change.target.value })} rows={2} className="mt-1 w-full resize-y rounded-xl border border-line px-3 py-2 text-xs leading-5 text-[#344054] outline-none focus:border-[#2f7cff]" /></label>
              <label className="mt-2 block text-[11px] font-semibold text-[#667085]">这一页必须讲清<textarea value={page.mustProve} onChange={(change) => updatePage(index, { mustProve: change.target.value })} rows={2} className="mt-1 w-full resize-y rounded-xl border border-line px-3 py-2 text-xs leading-5 text-[#344054] outline-none focus:border-[#2f7cff]" /></label>
            </article>
          ))}
        </div>
        <button type="button" onClick={add} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#98a2b3] bg-white text-sm font-semibold text-[#475467]"><Plus className="size-4" />添加投影页面</button>
      </section> : null}

      <button type="button" onClick={onConfirm} disabled={busy || !valid} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-semibold text-white disabled:opacity-50">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
        确认课堂方案并生成
      </button>
      {!valid ? <p className="text-xs text-[#b42318]">课堂蓝图、45 分钟预算和页面事件引用必须完整。</p> : null}
    </div>
  );
}
