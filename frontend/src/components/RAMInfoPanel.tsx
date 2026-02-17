import { Agent } from "@/types";
import { Database, RefreshCw, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { useState } from "react";
import { triggerUpdate } from "@/lib/api";

interface RAMInfoPanelProps {
    agent: Agent;
    onUpdateTriggered: () => void;
}

export default function RAMInfoPanel({ agent, onUpdateTriggered }: RAMInfoPanelProps) {
    const [updating, setUpdating] = useState(false);

    const handleUpdate = async () => {
        setUpdating(true);
        try {
            await triggerUpdate(agent.id);
            onUpdateTriggered(); // Notify parent to maybe refresh or show status
        } catch (e) {
            console.error("Update failed", e);
        } finally {
            setTimeout(() => setUpdating(false), 2000);
        }
    };

    const statusColor = agent.ram_status.status === "Idle" ? "text-green-500" : "text-amber-500";

    return (
        <div className="border bg-card text-card-foreground rounded-xl shadow-sm p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Database className="w-5 h-5" />
                        RAM Knowledge Base
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                        Source: <a href={agent.ram_status.source_url} target="_blank" className="underline text-blue-500">{agent.ram_status.source_url}</a>
                        <span className="mx-2">|</span>
                        <a
                            href={`http://localhost:8000/api/laws/${agent.ram_status.source_url.split("/").pop()}/raw`}
                            target="_blank"
                            className="underline text-blue-500 text-xs"
                        >
                            View Raw XML
                        </a>
                    </p>
                </div>
                <button
                    onClick={handleUpdate}
                    disabled={updating || agent.ram_status.status !== "Idle"}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90 disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${updating || agent.ram_status.status !== "Idle" ? "animate-spin" : ""}`} />
                    {agent.ram_status.status === "Idle" ? "Sync Now" : "Syncing..."}
                </button>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted/30 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Status</div>
                    <div className={`font-medium flex items-center gap-2 ${statusColor}`}>
                        {agent.ram_status.status === "Idle" ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                        {agent.ram_status.status}
                    </div>
                </div>
                <div className="bg-muted/30 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Last Updated</div>
                    <div className="font-medium">
                        {agent.ram_status.last_updated
                            ? new Date(agent.ram_status.last_updated).toLocaleString()
                            : "Never"}
                    </div>
                </div>
                <div className="bg-muted/30 p-3 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-1">Documents Indexed</div>
                    <div className="font-medium">{agent.ram_status.doc_count}</div>
                </div>
            </div>

            {/* LangGraph Visualization Stub */}
            {agent.ram_status.status !== "Idle" && (
                <div className="mt-4 p-4 bg-black/5 rounded-lg border border-dashed border-zinc-300">
                    <div className="text-xs font-mono text-zinc-500 mb-2">GRAPH EXECUTION TRACE</div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-bold">FETCH</span>
                        <span className="text-zinc-400">→</span>
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-bold animate-pulse">PARSE</span>
                        <span className="text-zinc-400">→</span>
                        <span className="px-2 py-1 bg-zinc-100 text-zinc-400 rounded text-xs font-bold">EMBED</span>
                    </div>
                </div>
            )}
        </div>
    );
}
