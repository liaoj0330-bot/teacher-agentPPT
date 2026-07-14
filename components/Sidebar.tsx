"use client";

import {
  Gift,
  LayoutDashboard,
  LogIn,
  MessageSquareText,
  Plus,
  Sparkles,
  UserPlus
} from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarProps = {
  onNewSession: () => void;
  onOpenAuth: () => void;
  onSelectSession?: (sessionId: string) => void;
  onInvite?: () => void;
  sessionState?: "loading" | "empty" | "ready";
  forceVisible?: boolean;
};

const sessions = [
  {
    id: "new",
    title: "New",
    meta: "刚刚创建"
  }
];

export function Sidebar({ onNewSession, onOpenAuth, onSelectSession, onInvite, sessionState = "ready", forceVisible = false }: SidebarProps) {
  const invite = async () => {
    if (onInvite) {
      onInvite();
      return;
    }
    await navigator.clipboard?.writeText("邀请你体验 AI PPT Agent：http://localhost:3002");
  };

  return (
    <aside
      className={cn(
        "h-screen w-[284px] shrink-0 flex-col border-r border-white/70 bg-[#f1f3f7]/90 px-4 py-4 text-ink shadow-[inset_-1px_0_0_rgba(255,255,255,0.9)] backdrop-blur-xl",
        forceVisible ? "flex" : "hidden md:flex"
      )}
    >
      <div className="flex items-center gap-3 px-2 py-2">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-ink text-white shadow-sm">
          <Sparkles className="size-5" />
        </div>
        <div>
          <div className="text-[15px] font-semibold tracking-tight">AI PPT Agent</div>
          <div className="text-xs text-muted">Presentation Workbench</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onNewSession}
        className="mt-5 flex h-11 items-center justify-center gap-2 rounded-2xl bg-ink px-4 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0"
      >
        <Plus className="size-4" />
        新建会话
      </button>

      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between px-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted">
            <LayoutDashboard className="size-4" />
            会话列表
          </div>
          <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-muted shadow-sm">1</span>
        </div>

        <div className="thin-scrollbar min-h-[140px] flex-1 overflow-y-auto rounded-3xl border border-white/80 bg-white/60 p-2">
          {sessionState === "loading" ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-12 animate-pulse rounded-2xl bg-[#eef1f7]" />
              ))}
            </div>
          ) : sessionState === "empty" ? (
            <div className="flex h-full min-h-[180px] flex-col items-center justify-center rounded-2xl border border-dashed border-line px-4 text-center">
              <MessageSquareText className="mb-3 size-6 text-[#aab0bd]" />
              <div className="text-sm font-medium">暂无会话</div>
              <div className="mt-1 text-xs leading-5 text-muted">新建后会在这里继续编辑</div>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => onSelectSession?.(session.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition",
                    "border-[#dfe4ed] bg-white shadow-sm hover:border-[#b9c7ff] hover:bg-[#f8faff]"
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#eef2ff] text-[#3b52d8]">
                    <MessageSquareText className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{session.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{session.meta}</span>
                  </span>
                </button>
              ))}
              <div className="rounded-2xl border border-dashed border-line bg-[#fbfcff] px-4 py-5 text-center text-xs text-muted">
                加载中 / 空状态已预留
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-[#dfe4ee] bg-white p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#eef6ff] text-[#2563eb]">
            <Gift className="size-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">邀请好友来生成 PPT</div>
            <div className="mt-1 text-xs leading-5 text-muted">共可得 500 积分</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void invite()}
          className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-[#fafbfe] text-xs font-medium transition hover:border-[#b8c5ff] hover:bg-white"
        >
          <UserPlus className="size-4" />
          邀请好友
        </button>
      </div>

      <button
        type="button"
        onClick={onOpenAuth}
        className="mt-3 flex h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-white text-sm font-medium text-ink shadow-sm transition hover:border-[#c7d2fe] hover:bg-[#fbfcff]"
      >
        <LogIn className="size-4" />
        登录 / 注册
      </button>
    </aside>
  );
}
