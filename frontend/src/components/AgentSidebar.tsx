import { useState } from "react";
import { Agent } from "@/types";
import { Users, Briefcase, Scale, Library, Plus } from "lucide-react";
import CreateAgentModal from "./CreateAgentModal";

interface AgentSidebarProps {
    agents: Agent[];
    selectedAgentId: string | null;
    onSelect: (agent: Agent) => void;
    globalModel: string;
    onModelChange: (model: string) => void;
    currentView: "workspace" | "library";
    onViewChange: (view: "workspace" | "library") => void;
    onCreateAgent: (data: { name: string; type: string; description: string }) => Promise<void>;
}

export default function AgentSidebar({ agents, selectedAgentId, onSelect, globalModel, onModelChange, currentView, onViewChange, onCreateAgent }: AgentSidebarProps) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    return (
        <div className="w-64 border-r bg-muted/20 h-full flex flex-col p-4 flex-shrink-0">
            <div className="flex items-center gap-3 mb-4">
                <img src="/logo-saikoku.png" alt="SAIKOKU STUDIO" className="h-10 w-auto object-contain" />
                <img src="/logo-lab.png" alt="LAB+" className="h-10 w-auto object-contain" />
            </div>

            <div className="mb-6">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Global API Model
                </label>
                <select
                    value={globalModel}
                    onChange={(e) => onModelChange(e.target.value)}
                    className="w-full text-sm bg-background border rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                    <option value="gemini-2.5-flash-lite">Gemini Flash Lite</option>
                    <option value="gemini-2.5-flash">Gemini Flash</option>
                    <option value="gemini-2.5-pro">Gemini Pro</option>
                </select>
            </div>

            <div className="space-y-2 mb-6 text-sm">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 ml-1">
                    Management
                </div>
                <button
                    onClick={() => onViewChange("library")}
                    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-colors ${currentView === "library"
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                        }`}
                >
                    <Library className="w-4 h-4" />
                    <div className="font-medium">Law Library (Master)</div>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
                <div className="flex items-center justify-between mt-4 mb-2 ml-1 pr-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Agents
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title="Create New Agent"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
                {agents.map((agent) => (
                    <button
                        key={agent.id}
                        onClick={() => { onSelect(agent); onViewChange("workspace"); }}
                        className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-colors ${currentView === "workspace" && selectedAgentId === agent.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                            }`}
                    >
                        {agent.type === "Tax-Agent" ? <Briefcase className="w-4 h-4" /> : <Scale className="w-4 h-4" />}
                        <div className="flex-1 flex justify-between items-center">
                            <div>
                                <div className="font-medium text-sm">{agent.name}</div>
                                <div className="text-xs opacity-80">{agent.type}</div>
                            </div>
                            <div className="bg-background/50 text-xs px-2 py-0.5 rounded-full font-mono border border-border/50" title={`${agent.ram_sources?.length || 0} laws assigned`}>
                                {agent.ram_sources?.length || 0}
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            <CreateAgentModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSubmit={async (data) => {
                    await onCreateAgent(data);
                    setIsCreateModalOpen(false);
                }}
            />
        </div>
    );
}
