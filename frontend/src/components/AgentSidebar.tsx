import { Agent } from "@/types";
import { Users, Briefcase, Scale } from "lucide-react";

interface AgentSidebarProps {
    agents: Agent[];
    selectedAgentId: string | null;
    onSelect: (agent: Agent) => void;
}

export default function AgentSidebar({ agents, selectedAgentId, onSelect }: AgentSidebarProps) {
    return (
        <div className="w-64 border-r bg-muted/20 h-full flex flex-col p-4">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Users className="w-6 h-6" />
                SAIKOKU
            </h2>
            <div className="space-y-2">
                {agents.map((agent) => (
                    <button
                        key={agent.id}
                        onClick={() => onSelect(agent)}
                        className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-colors ${selectedAgentId === agent.id
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted"
                            }`}
                    >
                        {agent.type === "Tax-Agent" ? <Briefcase className="w-4 h-4" /> : <Scale className="w-4 h-4" />}
                        <div>
                            <div className="font-medium text-sm">{agent.name}</div>
                            <div className="text-xs opacity-80">{agent.type}</div>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
