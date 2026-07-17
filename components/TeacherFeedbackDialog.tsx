"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, MessageSquareText, Send, X } from "lucide-react";
import { submitTeacherFeedback } from "@/lib/teacher-workspace-client";
import type { TeacherFeedbackCategory } from "@/lib/teacher-workspace-contract";

type TeacherFeedbackDialogProps = {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
  versionId?: string | null;
  subject?: string;
  topic?: string;
  textbook?: string;
  chapter?: string;
  pageNumber?: number;
  pageId?: string;
};

const categoryOptions: Array<{ value: TeacherFeedbackCategory; label: string }> = [
  { value: "textbook", label: "教材或章节不一致" },
  { value: "content", label: "知识、答案或内容错误" },
  { value: "pacing", label: "课堂节奏不合理" },
  { value: "layout", label: "排版、字体或乱码" },
  { value: "export", label: "生成、导出或下载失败" },
  { value: "usability", label: "操作体验问题" },
  { value: "privacy", label: "隐私或安全问题" },
  { value: "other", label: "其他建议" },
];

function newIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || `feedback-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function TeacherFeedbackDialog({ open, onClose, projectId, versionId, subject = "", topic = "", textbook = "", chapter = "", pageNumber, pageId }: TeacherFeedbackDialogProps) {
  const [category, setCategory] = useState<TeacherFeedbackCategory>("content");
  const [message, setMessage] = useState("");
  const [permissionToContact, setPermissionToContact] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ticketId, setTicketId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const contextLabel = useMemo(() => [subject, topic, pageNumber ? `第 ${pageNumber} 页` : ""].filter(Boolean).join(" · "), [pageNumber, subject, topic]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !submitting) onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, submitting]);

  if (!open) return null;
  const resetAndClose = () => {
    if (submitting) return;
    setCategory("content"); setMessage(""); setPermissionToContact(false); setError(""); setTicketId(""); setIdempotencyKey(newIdempotencyKey()); onClose();
  };
  const submit = async () => {
    if (message.trim().length < 3 || !permissionToContact || submitting) return;
    setSubmitting(true); setError("");
    try {
      const result = await submitTeacherFeedback({
        projectId: projectId || undefined, versionId: versionId || undefined, subject, topic, pageNumber, pageId, category,
        message: message.trim(), idempotencyKey,
        clientMetadata: { permissionToContact, textbook, chapter, route: window.location.pathname, viewport: `${window.innerWidth}x${window.innerHeight}`, browser: navigator.userAgent, occurredAt: new Date().toISOString() },
      });
      setTicketId(result.ticket.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "反馈提交失败，请稍后重试"); } finally { setSubmitting(false); }
  };
  return <div className="fixed inset-0 z-[140] flex items-end justify-center bg-[#101828]/45 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) resetAndClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="teacher-feedback-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-md bg-white shadow-[0_24px_64px_rgba(16,24,40,0.24)] sm:max-w-lg sm:rounded-md">
      <header className="flex items-start justify-between gap-4 border-b border-[#e7ebf1] px-5 py-4"><div className="min-w-0"><h2 id="teacher-feedback-title" className="flex items-center gap-2 text-base font-semibold text-[#171719]"><MessageSquareText className="size-4 text-[#2f7cff]" />反馈问题或建议</h2><p className="mt-1 break-words text-xs leading-5 text-[#667085]">{contextLabel || "当前教师课件工作台"}</p></div><button type="button" onClick={resetAndClose} disabled={submitting} aria-label="关闭反馈" className="flex size-8 shrink-0 items-center justify-center rounded-md text-[#667085] hover:bg-[#f2f4f7]"><X className="size-4" /></button></header>
      {ticketId ? <div className="px-5 py-8 text-center"><CheckCircle2 className="mx-auto size-9 text-[#027a48]" /><h3 className="mt-3 text-base font-semibold text-[#171719]">反馈已记录</h3><p className="mt-2 text-xs leading-5 text-[#667085]">工单号 <span className="font-mono text-[#344054]">{ticketId}</span></p><button type="button" onClick={resetAndClose} className="mt-5 h-10 rounded-md bg-[#171719] px-6 text-sm font-semibold text-white">完成</button></div> : <div className="px-5 py-4">
        <label className="block text-xs font-semibold text-[#475467]">问题类型<select value={category} onChange={(event) => setCategory(event.target.value as TeacherFeedbackCategory)} className="mt-2 h-10 w-full rounded-md border border-[#d0d5dd] bg-white px-3 text-sm focus:border-[#2f7cff] focus:ring-[#2f7cff]/10">{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="mt-4 block text-xs font-semibold text-[#475467]">具体情况<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} placeholder="请说明发生了什么、你原本希望得到什么结果" className="mt-2 min-h-28 w-full rounded-md border border-[#d0d5dd] p-3 text-sm leading-6 focus:border-[#2f7cff] focus:ring-[#2f7cff]/10" /></label>
        <p className="mt-2 text-[11px] leading-5 text-[#667085]">请勿填写学生姓名、手机号、身份证号、成绩、正脸图片、密码或 API Key。</p>
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-5 text-[#475467]"><input type="checkbox" checked={permissionToContact} onChange={(event) => setPermissionToContact(event.target.checked)} className="mt-1 rounded border-[#98a2b3] text-[#2f7cff] focus:ring-[#2f7cff]" /><span>同意内测运营人员就此问题联系我。课件、版本和当前页面信息会自动附在工单中。</span></label>
        {error ? <div role="alert" className="mt-3 rounded-md border border-[#fecdca] bg-[#fff1f3] px-3 py-2 text-xs leading-5 text-[#b42318]">{error}</div> : null}
        <div className="mt-5 flex justify-end gap-2 border-t border-[#eef1f6] pt-4"><button type="button" onClick={resetAndClose} disabled={submitting} className="h-10 rounded-md border border-[#d0d5dd] px-4 text-sm font-semibold text-[#344054]">取消</button><button type="button" onClick={() => void submit()} disabled={submitting || message.trim().length < 3 || !permissionToContact} className="flex h-10 min-w-28 items-center justify-center gap-2 rounded-md bg-[#171719] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}提交反馈</button></div>
      </div>}
    </section>
  </div>;
}
