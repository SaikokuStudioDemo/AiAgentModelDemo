"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Play, CheckCircle2, Clock, Database, AlertCircle, Calendar } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

interface RunProgress {
  current: number;
  total: number;
  message: string;
  eta_seconds: number | null;
}

interface SyncSource {
  id: string;
  name: string;
  source: string;
  description: string;
  record_count: number;
  last_synced_at: string | null;
  next_run_at: string | null;
  schedule_description: string;
  job_id: string;
  is_running: boolean;
  run_progress: RunProgress | null;
  scheduler_active: boolean;
}

interface SyncStatus {
  sources: SyncSource[];
  scheduler_active: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "未取得";
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor(diff / 60000);
  if (days > 0) return `${days}日前`;
  if (hours > 0) return `${hours}時間前`;
  if (minutes > 0) return `${minutes}分前`;
  return "たった今";
}

function formatETA(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "計算中...";
  if (seconds < 60) return `残り${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `残り${m}分${s}秒`;
}

export default function SyncManager() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<Set<string>>(new Set());

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/sync/status`);
      if (res.ok) setStatus(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleTrigger = async (sourceId: string) => {
    setTriggering(prev => new Set(prev).add(sourceId));
    try {
      const res = await fetch(`${API_URL}/sync/trigger/${sourceId}`, { method: "POST" });
      if (res.ok) {
        setTimeout(fetchStatus, 1000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setTriggering(prev => { const s = new Set(prev); s.delete(sourceId); return s; }), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 読み込み中...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-8 overflow-y-auto bg-background rounded-l-3xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground mb-1">Sync Manager</h1>
            <p className="text-muted-foreground">データソースの同期状況とスケジュールを管理</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${status?.scheduler_active ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-muted-foreground">
              スケジューラー: {status?.scheduler_active ? "稼働中" : "停止中"}
            </span>
          </div>
        </div>
      </div>

      {/* Source Cards */}
      <div className="space-y-5 max-w-3xl">
        {status?.sources.map(source => (
          <SourceCard
            key={source.id}
            source={source}
            isTriggerring={triggering.has(source.id)}
            onTrigger={() => handleTrigger(source.id)}
          />
        ))}
      </div>
    </div>
  );
}

function SourceCard({ source, isTriggerring, onTrigger }: {
  source: SyncSource;
  isTriggerring: boolean;
  onTrigger: () => void;
}) {
  const isRunning = source.is_running;
  const progress = source.run_progress;
  const progressPct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className={`bg-card border rounded-2xl shadow-sm overflow-hidden transition-all ${isRunning ? "border-blue-300 shadow-blue-100" : ""}`}>
      {/* Running progress bar */}
      {isRunning && (
        <div className="h-1 bg-blue-100 w-full">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: progress?.total ? `${progressPct}%` : "100%", animation: !progress?.total ? "pulse 1.5s infinite" : undefined }}
          />
        </div>
      )}

      <div className="p-6">
        {/* Card header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 p-2 rounded-lg ${isRunning ? "bg-blue-100" : "bg-muted/40"}`}>
              <Database className={`w-5 h-5 ${isRunning ? "text-blue-600" : "text-muted-foreground"}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-foreground">{source.name}</h2>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{source.source}</span>
                {isRunning && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                    <RefreshCw className="w-3 h-3" /> 同期中
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{source.description}</p>
            </div>
          </div>
          <button
            onClick={onTrigger}
            disabled={isRunning || isTriggerring}
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 ml-4"
          >
            {isRunning || isTriggerring
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4" />}
            {isRunning ? "実行中..." : "今すぐ実行"}
          </button>
        </div>

        {/* Progress detail */}
        {isRunning && progress && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex justify-between text-sm font-medium text-blue-800 mb-2">
              <span>{progress.message}</span>
              <span>{formatETA(progress.eta_seconds)}</span>
            </div>
            {progress.total > 0 && (
              <>
                <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="text-xs text-blue-600 mt-1 text-right">
                  {progress.current.toLocaleString()} / {progress.total.toLocaleString()} 件
                </div>
              </>
            )}
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatItem
            icon={<Database className="w-4 h-4" />}
            label="件数"
            value={`${source.record_count.toLocaleString()} 件`}
          />
          <StatItem
            icon={<CheckCircle2 className="w-4 h-4" />}
            label="最終更新"
            value={formatDate(source.last_synced_at)}
            sub={timeAgo(source.last_synced_at)}
          />
          <StatItem
            icon={<Calendar className="w-4 h-4" />}
            label="スケジュール"
            value={source.schedule_description}
          />
          <StatItem
            icon={<Clock className="w-4 h-4" />}
            label="次回実行"
            value={formatDate(source.next_run_at)}
            highlight={!isRunning}
          />
        </div>
      </div>
    </div>
  );
}

function StatItem({ icon, label, value, sub, highlight }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-muted/30 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <span className="w-4 h-4">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className={`text-sm font-semibold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
