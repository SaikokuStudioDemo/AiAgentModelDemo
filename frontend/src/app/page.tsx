"use client";

import { useEffect, useState } from "react";
import AgentSidebar from "@/components/AgentSidebar";
import RAMInfoPanel from "@/components/RAMInfoPanel";
import ChatInterface from "@/components/ChatInterface";
import { Agent } from "@/types";
import { getAgents } from "@/lib/api";

export default function Dashboard() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchAgents = async () => {
        try {
            const data = await getAgents();
            setAgents(data);
            if (data.length > 0 && !selectedAgent) {
                setSelectedAgent(data[0]);
            } else if (selectedAgent) {
                // Refresh selected agent data
                const updated = data.find(a => a.id === selectedAgent.id);
                if (updated) setSelectedAgent(updated);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAgents();
        // Poll every 5s to check RAM status updates
        const interval = setInterval(fetchAgents, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading && agents.length === 0) {
        return <div className="flex h-screen items-center justify-center">Loading SAIKOKU STUDIO...</div>;
    }

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            <AgentSidebar
                agents={agents}
                selectedAgentId={selectedAgent?.id || null}
                onSelect={(agent) => setSelectedAgent(agent)}
            />

            <main className="flex-1 flex flex-col p-8 overflow-y-auto">
                <header className="mb-8">
                    <h1 className="text-3xl font-bold tracking-tight">Agent Workspace</h1>
                    <p className="text-muted-foreground mt-2">
                        Manage your autonomous agents, monitor their RAM status, and test their logic.
                    </p>
                </header>

                {selectedAgent ? (
                    <div className="max-w-4xl w-full mx-auto">
                        <section className="mb-8">
                            <h2 className="text-xl font-semibold mb-4">{selectedAgent.name} Overview</h2>
                            <p className="text-muted-foreground mb-4">{selectedAgent.description}</p>
                            <RAMInfoPanel
                                agent={selectedAgent}
                                onUpdateTriggered={fetchAgents}
                            />
                        </section>

                        <section>
                            <ChatInterface agent={selectedAgent} />
                        </section>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        Select an agent to begin.
                    </div>
                )}
            </main>
        </div>
    );
}
