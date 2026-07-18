"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Clock, Coins, FileDown, Image, RefreshCw, ShieldCheck, Users } from "lucide-react";

type MonitorData = {
  status: "healthy" | "warning" | "critical";
  window: { hours: number; since: string; generatedAt: string };
  usage: {
    registeredUsers: number; newUsers: number; activeUsers: number; registeredUserActivityRate: number | null;
    generationUsers: number; exportUsers: number; projectsTouched: number; generationAttempts: number;
    pptxExportAttempts: number; imagePagesAttempted: number; creditsSpent: number; invitationActivationRate: number | null;
    invitationActivationRateReason?: string;
  };
  stability: {
    generationCompletionRate: number | null; generationSamples: number; generationLatencyP50Seconds: number | null;
    generationLatencyP90Seconds: number | null; exportSuccessRate: number | null; exportSamples: number;
    imagePageSuccessRate: number | null; imagePageSamples: number; queuedJobs: number; oldestQueueMinutes: number;
    openP0: number; openP1: number; openFeedback: number;
  };
  alerts: Array<{ level: "critical" | "warning"; metric: string; message: string; fireCommand: string }>;
  unmeasuredUntilCloudTelemetry: string[];
};

function metric(value: number | null, suffix = "") {
  return value === null ? "--" : `${value}${suffix}`;
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: string; note: string; icon: typeof Activity }) {
  return <div className="min-h-32 rounded-lg border border-[#e5e7eb] bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between text-sm text-[#667085]"><span>{label}</span><Icon className="size-4" /></div>
    <div className="mt-3 text-3xl font-semibold text-[#171719]">{value}</div>
    <div className="mt-2 text-xs text-[#667085]">{note}</div>
  </div>;
}

export function BetaMonitoringDashboard() {
  const [data, setData] = useState<MonitorData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/beta-monitor?hours=24", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as (MonitorData & { message?: string }) | null;
      if (!response.ok || !payload?.status) throw new Error(response.status === 403 ? "当前账号不是内测管理员" : payload?.message || "监控数据读取失败");
      setData(payload);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "监控数据读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh]);

  const statusStyle = data?.status === "critical" ? "border-[#fda29b] bg-[#fff1f0] text-[#b42318]" : data?.status === "warning" ? "border-[#fedf89] bg-[#fffaeb] text-[#b54708]" : "border-[#a6f4c5] bg-[#ecfdf3] text-[#067647]";
  const statusLabel = data?.status === "critical" ? "严重：停止发码并启动消防队" : data?.status === "warning" ? "预警：暂缓扩批并持续观察" : "稳定：当前没有触发硬停条件";

  return <main className="min-h-screen bg-[#f7f8fa] text-[#171719]">
    <header className="border-b border-[#e5e7eb] bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
        <div><h1 className="text-xl font-semibold">100 人内测监控台</h1><p className="mt-1 text-sm text-[#667085]">使用率、稳定性、队列、反馈和积分消耗</p></div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[#475467]"><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />60 秒刷新</label>
          <button type="button" onClick={() => void refresh()} disabled={loading} title="刷新监控数据" className="grid size-10 place-items-center rounded-lg border border-[#d0d5dd] bg-white hover:bg-[#f9fafb] disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
      </div>
    </header>

    <div className="mx-auto max-w-7xl px-5 py-6">
      {error ? <div className="rounded-lg border border-[#fda29b] bg-[#fff1f0] px-4 py-3 text-sm text-[#b42318]">{error}</div> : null}
      {data ? <>
        <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${statusStyle}`}>
          {data.status === "healthy" ? <ShieldCheck className="size-5" /> : <AlertTriangle className="size-5" />}{statusLabel}
          <span className="ml-auto text-xs font-normal">{new Date(data.window.generatedAt).toLocaleString("zh-CN")}</span>
        </div>

        <section className="py-7"><h2 className="mb-4 text-base font-semibold">使用率</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="注册老师" value={String(data.usage.registeredUsers)} note={`24小时新增 ${data.usage.newUsers}`} icon={Users} />
          <Metric label="24小时活跃" value={String(data.usage.activeUsers)} note={`注册用户活跃率 ${metric(data.usage.registeredUserActivityRate, "%")}`} icon={Activity} />
          <Metric label="生成用户" value={String(data.usage.generationUsers)} note={`${data.usage.generationAttempts} 次生成请求`} icon={Activity} />
          <Metric label="导出用户" value={String(data.usage.exportUsers)} note={`${data.usage.pptxExportAttempts} 次 PPTX 导出`} icon={FileDown} />
          <Metric label="处理项目" value={String(data.usage.projectsTouched)} note="24小时发生修改的项目" icon={Activity} />
          <Metric label="图片页" value={String(data.usage.imagePagesAttempted)} note="成功页和失败页合计" icon={Image} />
          <Metric label="积分消耗" value={String(data.usage.creditsSpent)} note="24小时真实扣费账本" icon={Coins} />
          <Metric label="邀请码激活率" value={metric(data.usage.invitationActivationRate, "%")} note="一次性邀请码台账接入后可测" icon={Users} />
        </div></section>

        <section className="border-t border-[#e5e7eb] py-7"><h2 className="mb-4 text-base font-semibold">稳定性</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="生成完成率" value={metric(data.stability.generationCompletionRate, "%")} note={`${data.stability.generationSamples} 个成熟样本`} icon={ShieldCheck} />
          <Metric label="生成 P50" value={metric(data.stability.generationLatencyP50Seconds, "秒")} note={`P90 ${metric(data.stability.generationLatencyP90Seconds, "秒")}`} icon={Clock} />
          <Metric label="导出成功率" value={metric(data.stability.exportSuccessRate, "%")} note={`${data.stability.exportSamples} 个样本`} icon={FileDown} />
          <Metric label="图片页成功率" value={metric(data.stability.imagePageSuccessRate, "%")} note={`${data.stability.imagePageSamples} 个页面样本`} icon={Image} />
          <Metric label="排队任务" value={String(data.stability.queuedJobs)} note={`最老等待 ${data.stability.oldestQueueMinutes} 分钟`} icon={Clock} />
          <Metric label="开放 P0" value={String(data.stability.openP0)} note="任何 P0 都停止发码" icon={AlertTriangle} />
          <Metric label="开放 P1" value={String(data.stability.openP1)} note="超过 2 个暂缓扩批" icon={AlertTriangle} />
          <Metric label="未关闭反馈" value={String(data.stability.openFeedback)} note="含 P0-P3" icon={Activity} />
        </div></section>

        <section className="border-t border-[#e5e7eb] py-7"><h2 className="mb-4 text-base font-semibold">告警与消防队</h2>
          {data.alerts.length ? <div className="space-y-3">{data.alerts.map((alert) => <div key={`${alert.metric}-${alert.message}`} className={`rounded-lg border px-4 py-3 ${alert.level === "critical" ? "border-[#fda29b] bg-[#fff1f0]" : "border-[#fedf89] bg-[#fffaeb]"}`}><div className="font-medium">{alert.message}</div><code className="mt-1 block text-xs text-[#475467]">{alert.fireCommand}</code></div>)}</div> : <div className="rounded-lg border border-[#d0d5dd] bg-white px-4 py-5 text-sm text-[#475467]">当前 24 小时窗口没有触发告警。</div>}
        </section>
      </> : null}
    </div>
  </main>;
}
