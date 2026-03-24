import { Agent, RAMSource } from "@/types";
import { Database, RefreshCw, CheckCircle, Clock, ExternalLink, BookOpen } from "lucide-react";
import { useState } from "react";
import { triggerUpdate } from "@/lib/api";

interface RAMInfoPanelProps {
    agent: Agent;
    onUpdateTriggered: () => void;
}

export default function RAMInfoPanel({ agent, onUpdateTriggered }: RAMInfoPanelProps) {
    const [updatingUrl, setUpdatingUrl] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleUpdate = async (url: string) => {
        setUpdatingUrl(url);
        try {
            await triggerUpdate(agent.id, url);
            onUpdateTriggered(); // Notify parent to refresh status
        } catch (e) {
            console.error("Update failed", e);
        } finally {
            setTimeout(() => setUpdatingUrl(null), 2000);
        }
    };

    return (
        <div className="border bg-card text-card-foreground rounded-xl shadow-sm p-6 mb-6">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Database className="w-5 h-5" />
                        RAM Knowledge Base
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Sources feeding this agent's brain. Manage these sources from the Law Library.
                    </p>
                </div>
            </div>

            {errorMsg && <p className="text-red-500 text-sm mb-4">{errorMsg}</p>}

            {/* Sources List */}
            <div className="space-y-4">
                {agent.ram_sources && agent.ram_sources.length > 0 ? (
                    agent.ram_sources.map((source: RAMSource) => {
                        const isNtaFaq = source.source_type === "nta_faq";

                        if (isNtaFaq) {
                            return (
                                <div key={source.url} className="border rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                <BookOpen className="w-4 h-4 text-blue-600" />
                                                <h3 className="font-semibold text-base text-foreground">
                                                    {source.title}
                                                </h3>
                                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                                                    NTA FAQ
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <a href={source.url} target="_blank" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                                                    <span>国税庁タックスアンサー</span>
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                            <div className="flex items-center gap-2 mt-2 text-sm">
                                                <span className="text-muted-foreground">Status:</span>
                                                <span className="font-medium text-green-500 flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3" /> Synced (自動更新: 毎週月曜 2:00)
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        }

                        const isUpdating = updatingUrl === source.url || source.status !== "Synced";
                        const statusColor = source.status === "Synced" ? "text-green-500" : "text-amber-500";
                        const urlParts = source.url.split("/");
                        const lawId = urlParts[urlParts.length - 1];
                        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001/api";

                        return (
                            <div key={source.url} className={`border rounded-lg p-4 bg-muted/10 transition-opacity`}>
                                <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1 min-w-0">
                                        {/* Title Row */}
                                        <div className="mb-2">
                                            <h3 className="font-semibold text-lg text-foreground">
                                                {source.title || <span className="text-muted-foreground italic text-sm">未設定 (Sync to generate title)</span>}
                                            </h3>
                                        </div>

                                        {/* Links Row */}
                                        <div className="flex items-center gap-2 mb-3 w-full">
                                            <a href={source.url} target="_blank" className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1 max-w-[220px]" title={source.url}>
                                                <span className="truncate">{source.url}</span>
                                                <ExternalLink className="w-3 h-3 shrink-0" />
                                            </a>
                                            <span className="text-xs text-muted-foreground shrink-0">|</span>
                                            <a
                                                href={`${apiUrl}/laws/${lawId}/raw?t=${Date.now()}`}
                                                target="_blank"
                                                className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                                            >
                                                View Document
                                            </a>
                                        </div>

                                        {/* Metadata Row */}
                                        <div className="flex items-center gap-6 text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground">Status:</span>
                                                <span className={`font-medium flex items-center gap-1 ${statusColor}`}>
                                                    {source.status === "Synced" ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3 animate-pulse" />}
                                                    {source.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground">Docs:</span>
                                                <span className="font-medium">{source.doc_count}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground">Updated:</span>
                                                <span className="font-medium">
                                                    {source.last_updated ? new Date(source.last_updated).toLocaleDateString() : "Never"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-2">
                                        <button
                                            onClick={() => handleUpdate(source.url)}
                                            disabled={isUpdating}
                                            className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md text-xs font-medium hover:bg-secondary/80 disabled:opacity-50"
                                        >
                                            <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? "animate-spin" : ""}`} />
                                            {source.status === "Synced" ? "Sync Now" : "Syncing..."}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                        No sources added yet. Assign laws to this agent from the Law Library.
                    </div>
                )}
            </div >

            {/* LangGraph Visualization Note */}
            < div className="mt-6 text-xs text-muted-foreground border-t pt-4" >
                Note: Syncing triggers the LangGraph process to Fetch, Parse, and Embed the documents.
            </div >
        </div >
    );
}
