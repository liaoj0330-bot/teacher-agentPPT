"use client";

import { useState } from "react";
import { Loader2, LogIn, X } from "lucide-react";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  inviteCode: string;
  credits: number;
};

type AuthModalProps = {
  open: boolean;
  user: AuthUser | null;
  onClose: () => void;
  onAuthed: (user: AuthUser | null) => void;
};

export function AuthModal({ open, user, onClose, onAuthed }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!open) return null;

  const submit = async () => {
    setIsLoading(true);
    setMessage("");
    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, inviteCode })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message || "登录失败");
      }
      onAuthed(data.user);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    onAuthed(null);
    setIsLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-[28px] border border-line bg-white p-5 shadow-[0_30px_100px_rgba(15,23,42,0.24)]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-ink">{user ? "账户中心" : mode === "login" ? "登录 AI PPT Agent" : "注册 AI PPT Agent"}</div>
            <div className="mt-1 text-sm text-muted">{user ? "本地账号、积分和会话历史已启用" : "登录后保存会话历史并使用积分"}</div>
          </div>
          <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-2xl text-[#667085] transition hover:bg-[#f2f4f7]">
            <X className="size-5" />
          </button>
        </div>

        {user ? (
          <div className="mt-5 space-y-3">
            <div className="rounded-2xl bg-[#f8fafc] p-4">
              <div className="text-xs text-muted">邮箱</div>
              <div className="mt-1 font-semibold text-ink">{user.email}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#eef6ff] p-4">
                <div className="text-xs text-[#1462ff]">积分</div>
                <div className="mt-1 text-2xl font-bold text-[#1462ff]">{user.credits}</div>
              </div>
              <div className="rounded-2xl bg-[#f8fafc] p-4">
                <div className="text-xs text-muted">邀请码</div>
                <div className="mt-1 font-bold text-ink">{user.inviteCode}</div>
              </div>
            </div>
            <button type="button" onClick={logout} disabled={isLoading} className="flex h-11 w-full items-center justify-center rounded-2xl border border-line bg-white text-sm font-semibold text-ink transition hover:bg-[#f8fafc] disabled:opacity-60">
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : "退出登录"}
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <div className="flex rounded-2xl bg-[#f8fafc] p-1">
              {(["login", "register"] as const).map((item) => (
                <button key={item} type="button" onClick={() => setMode(item)} className={`h-9 flex-1 rounded-xl text-sm font-semibold transition ${mode === item ? "bg-white text-ink shadow-sm" : "text-muted"}`}>
                  {item === "login" ? "登录" : "注册"}
                </button>
              ))}
            </div>
            {mode === "register" ? <input value={name} onChange={(event) => setName(event.target.value)} placeholder="昵称" className="h-11 w-full rounded-2xl border-line bg-[#fbfcff] px-4 text-sm focus:border-[#82b7ff] focus:ring-[#82b7ff]" /> : null}
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" className="h-11 w-full rounded-2xl border-line bg-[#fbfcff] px-4 text-sm focus:border-[#82b7ff] focus:ring-[#82b7ff]" />
            <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码，至少 6 位" type="password" className="h-11 w-full rounded-2xl border-line bg-[#fbfcff] px-4 text-sm focus:border-[#82b7ff] focus:ring-[#82b7ff]" />
            {mode === "register" ? <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="邀请码，可选" className="h-11 w-full rounded-2xl border-line bg-[#fbfcff] px-4 text-sm focus:border-[#82b7ff] focus:ring-[#82b7ff]" /> : null}
            {message ? <div className="rounded-2xl bg-[#fff7ed] px-4 py-3 text-sm text-[#c2410c]">{message}</div> : null}
            <button type="button" onClick={submit} disabled={isLoading} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-semibold text-white transition hover:-translate-y-0.5 disabled:opacity-60">
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
              {mode === "login" ? "登录" : "注册并领取 500 积分"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
