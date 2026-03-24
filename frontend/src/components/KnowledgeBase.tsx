"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, ExternalLink, ChevronLeft, ChevronRight, X, BookOpen, FileText } from "lucide-react";
import { getKnowledgeLaws, getKnowledgeNTA } from "@/lib/api";
import { KnowledgeLaw, KnowledgeNTA } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";
const LIMIT = 50;

type Tab = "laws" | "nta";

interface PanelState {
  type: "nta";
  id: string;
  title: string;
}

interface OverlayState {
  id: string;
  title: string;
}

interface KnowledgeBaseProps {
  agentId?: string;       // 指定するとそのエージェントの法令のみ表示
  hasNTA?: boolean;       // タックスアンサータブを表示するか
  compact?: boolean;      // エージェントワークスペース内表示モード
}

export default function KnowledgeBase({ agentId, hasNTA = true, compact = false }: KnowledgeBaseProps) {
  const [tab, setTab] = useState<Tab>(hasNTA ? "nta" : "laws");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  // Laws state
  const [laws, setLaws] = useState<KnowledgeLaw[]>([]);
  const [lawsTotal, setLawsTotal] = useState(0);
  const [lawsLoading, setLawsLoading] = useState(false);

  // NTA state
  const [ntaItems, setNtaItems] = useState<KnowledgeNTA[]>([]);
  const [ntaTotal, setNtaTotal] = useState(0);
  const [ntaCategories, setNtaCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [ntaLoading, setNtaLoading] = useState(false);
  const [ntaError, setNtaError] = useState<string | null>(null);

  // NTA スライドパネル
  const [panel, setPanel] = useState<PanelState | null>(null);
  // 法令 フルスクリーンオーバーレイ
  const [overlay, setOverlay] = useState<OverlayState | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page on tab change
  useEffect(() => {
    setPage(1);
    setSearchQuery("");
    setDebouncedQuery("");
    setSelectedCategory("");
  }, [tab]);

  const fetchLaws = useCallback(async () => {
    setLawsLoading(true);
    try {
      const data = await getKnowledgeLaws(debouncedQuery, page, LIMIT, agentId ?? "");
      setLaws(data.items);
      setLawsTotal(data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLawsLoading(false);
    }
  }, [debouncedQuery, page, agentId]);

  const fetchNTA = useCallback(async () => {
    setNtaLoading(true);
    setNtaError(null);
    try {
      const data = await getKnowledgeNTA(debouncedQuery, selectedCategory, page, LIMIT);
      if (data.error) {
        setNtaError(data.error);
        setNtaItems([]);
        setNtaTotal(0);
      } else {
        setNtaItems(data.items);
        setNtaTotal(data.total);
        if (data.categories && data.categories.length > 0) {
          setNtaCategories(data.categories);
        }
      }
    } catch (e) {
      console.error(e);
      setNtaError("データの取得に失敗しました");
    } finally {
      setNtaLoading(false);
    }
  }, [debouncedQuery, selectedCategory, page]);

  // 常に両方フェッチ（件数をタブに常時表示するため）
  useEffect(() => {
    fetchLaws();
  }, [fetchLaws]);

  useEffect(() => {
    if (hasNTA) fetchNTA();
  }, [fetchNTA, hasNTA]);

  const totalPages = tab === "laws"
    ? Math.ceil(lawsTotal / LIMIT)
    : Math.ceil(ntaTotal / LIMIT);

  const openOverlay = (id: string, title: string) => {
    setOverlay({ id, title });
  };

  const openPanel = (id: string, title: string) => {
    setPanel({ type: "nta", id, title });
  };

  return (
    <div className="relative flex h-full bg-background overflow-hidden" style={{ borderRadius: compact ? undefined : "1.5rem 0 0 1.5rem" }}>
      {/* Main content */}
      <div className={`flex flex-col flex-1 overflow-hidden transition-all duration-300 ${compact ? "p-0" : "p-8"} ${panel ? "mr-[480px]" : ""}`}>
        {/* Header - グローバル表示時のみ */}
        {!compact && (
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight text-foreground mb-1">Knowledge Base</h1>
            <p className="text-muted-foreground">法令・タックスアンサーの一覧・検索・閲覧</p>
          </div>
        )}

        {/* Tabs */}
        <div className={`flex gap-1 border-b ${compact ? "px-4 pt-3" : "mb-5"}`}>
          {hasNTA && (
            <TabButton active={tab === "nta"} onClick={() => setTab("nta")} icon={<BookOpen className="w-4 h-4" />} label="タックスアンサー" count={ntaTotal} />
          )}
          <TabButton active={tab === "laws"} onClick={() => setTab("laws")} icon={<FileText className="w-4 h-4" />} label="法令" count={lawsTotal} />
        </div>
        {compact && <div className="mb-4" />}

        {/* Search & Filter */}
        <div className={`flex gap-3 mb-4 items-center ${compact ? "px-4" : ""}`}>
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={tab === "laws" ? "タイトル・法令番号で検索..." : "タイトル・内容で検索..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-muted/30 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          {tab === "nta" && ntaCategories.length > 0 && (
            <select
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setPage(1); }}
              className="text-sm bg-muted/30 border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 max-w-[220px]"
            >
              <option value="">すべてのカテゴリ</option>
              {ntaCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          <span className="text-sm text-muted-foreground ml-auto shrink-0">
            {tab === "laws" ? `${lawsTotal.toLocaleString()} 件` : `${ntaTotal.toLocaleString()} 件`}
          </span>
        </div>

        {/* Table */}
        <div className={`flex-1 border overflow-hidden flex flex-col bg-card shadow-sm ${compact ? "rounded-none mx-0" : "rounded-2xl"}`}>
          <div className="overflow-y-auto flex-1">
            {tab === "laws" ? (
              <LawTable laws={laws} loading={lawsLoading} onOpen={(l) => openOverlay(l.law_id, l.title)} />
            ) : (
              <NTATable items={ntaItems} loading={ntaLoading} error={ntaError} onOpen={(n) => openPanel(n.no, n.title)} />
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t px-4 py-3 flex items-center justify-between bg-muted/10 shrink-0">
              <span className="text-xs text-muted-foreground">
                {page} / {totalPages} ページ
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="p-1.5 rounded-lg border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="p-1.5 rounded-lg border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* タックスアンサー スライドパネル */}
      {panel && (
        <div className="fixed top-0 right-0 h-full w-[480px] border-l bg-background shadow-2xl flex flex-col z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20 shrink-0">
            <span className="text-sm font-semibold text-foreground truncate pr-4">{panel.title}</span>
            <button onClick={() => setPanel(null)} className="p-1.5 rounded-lg hover:bg-muted shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <iframe
            key={`nta-${panel.id}`}
            src={`${API_URL}/knowledge/nta/${panel.id}/view`}
            className="flex-1 border-none w-full"
            title={panel.title}
          />
        </div>
      )}

      {/* 法令 フルスクリーンオーバーレイ */}
      {overlay && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/20 shrink-0">
            <span className="text-sm font-semibold text-foreground truncate pr-4">{overlay.title}</span>
            <button
              onClick={() => setOverlay(null)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
              閉じる
            </button>
          </div>
          <iframe
            key={`law-overlay-${overlay.id}`}
            src={`${API_URL}/laws/${overlay.id}/raw`}
            className="flex-1 border-none w-full"
            title={overlay.title}
          />
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label, count }: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
      }`}
    >
      {icon}
      {label}
      {count > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

function LawTable({ laws, loading, onOpen }: {
  laws: KnowledgeLaw[];
  loading: boolean;
  onOpen: (law: KnowledgeLaw) => void;
}) {
  if (loading) return <TableSkeleton />;
  if (laws.length === 0) return <EmptyState message="法令が見つかりませんでした" />;

  return (
    <table className="w-full text-left border-collapse text-sm">
      <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b z-10">
        <tr>
          <th className="p-4 font-semibold text-muted-foreground">タイトル</th>
          <th className="p-4 font-semibold text-muted-foreground w-48">法令番号</th>
          <th className="p-4 font-semibold text-muted-foreground w-32">施行日</th>
          <th className="p-4 w-20"></th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {laws.map((law) => (
          <tr key={law.law_id} className="hover:bg-muted/10 transition-colors">
            <td className="p-4 font-medium text-foreground">{law.title}</td>
            <td className="p-4 text-muted-foreground font-mono text-xs">{law.law_num}</td>
            <td className="p-4 text-muted-foreground text-xs">{law.promulgation_date ?? "—"}</td>
            <td className="p-4">
              <button
                onClick={() => onOpen(law)}
                className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 whitespace-nowrap"
              >
                表示 <ExternalLink className="w-3 h-3" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NTATable({ items, loading, error, onOpen }: {
  items: KnowledgeNTA[];
  loading: boolean;
  error: string | null;
  onOpen: (item: KnowledgeNTA) => void;
}) {
  if (loading) return <TableSkeleton />;
  if (error) return (
    <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground text-sm">
      <span className="text-amber-600">データの取得に失敗しました</span>
      <span className="text-xs opacity-70">{error}</span>
    </div>
  );
  if (items.length === 0) return <EmptyState message="タックスアンサーが見つかりませんでした。先に同期を実行してください。" />;

  return (
    <table className="w-full text-left border-collapse text-sm">
      <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b z-10">
        <tr>
          <th className="p-4 font-semibold text-muted-foreground w-20">No.</th>
          <th className="p-4 font-semibold text-muted-foreground">タイトル</th>
          <th className="p-4 font-semibold text-muted-foreground w-48">カテゴリ</th>
          <th className="p-4 font-semibold text-muted-foreground w-32">最終取得</th>
          <th className="p-4 w-20"></th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {items.map((item) => (
          <tr key={item.no} className="hover:bg-muted/10 transition-colors">
            <td className="p-4 text-muted-foreground font-mono text-xs">{item.no}</td>
            <td className="p-4 font-medium text-foreground">{item.title}</td>
            <td className="p-4">
              {item.category && (
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                  {item.category}
                </span>
              )}
            </td>
            <td className="p-4 text-muted-foreground text-xs">
              {item.last_scraped_at ? new Date(item.last_scraped_at).toLocaleDateString("ja-JP") : "—"}
            </td>
            <td className="p-4">
              <button
                onClick={() => onOpen(item)}
                className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 whitespace-nowrap"
              >
                表示 <ExternalLink className="w-3 h-3" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TableSkeleton() {
  return (
    <div className="p-8 space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
      {message}
    </div>
  );
}
