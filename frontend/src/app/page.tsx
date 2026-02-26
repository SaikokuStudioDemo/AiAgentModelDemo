"use client";

import { useEffect, useState } from "react";
import AgentSidebar from "@/components/AgentSidebar";
import RAMInfoPanel from "@/components/RAMInfoPanel";
import ChatInterface from "@/components/ChatInterface";
import LawLibrary from "@/components/LawLibrary";
import { Agent } from "@/types";
import { getAgents, createAgent } from "@/lib/api";

export default function Dashboard() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [loading, setLoading] = useState(true);
    const [globalModel, setGlobalModel] = useState("gemini-2.5-flash-lite");
    const [currentView, setCurrentView] = useState<"workspace" | "library">("workspace");

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

    const handleCreateAgent = async (data: { name: string; type: string; description: string }) => {
        try {
            const newAgent = await createAgent(data);
            await fetchAgents();
            setSelectedAgent(newAgent);
            setCurrentView("workspace");
        } catch (e) {
            console.error(e);
            alert("Failed to create agent: " + (e as Error).message);
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
                onSelect={(agent) => { setSelectedAgent(agent); setCurrentView("workspace"); }}
                globalModel={globalModel}
                onModelChange={setGlobalModel}
                currentView={currentView}
                onViewChange={setCurrentView}
                onCreateAgent={handleCreateAgent}
            />

            <main className="flex-1 flex flex-col p-8 overflow-y-auto">
                {currentView === "library" ? (
                    <LawLibrary agents={agents} />
                ) : (
                    <>
                        <header className="mb-8">
                            <h1 className="text-3xl font-bold tracking-tight">Agent Workspace</h1>
                            <p className="text-muted-foreground mt-2">
                                Manage your autonomous agents, monitor their RAM status, and test their logic.
                            </p>
                        </header>

                        {selectedAgent ? (
                            <div className="flex gap-6 max-w-[1400px] w-full mx-auto h-[calc(100vh-160px)]">
                                {/* Center Column: Chat */}
                                <section className="flex-1 flex flex-col min-w-[400px]">
                                    <h2 className="text-xl font-semibold mb-4">Chat with {selectedAgent.name}</h2>
                                    <ChatInterface agent={selectedAgent} model={globalModel} />
                                </section>

                                {/* Right Column: RAM Info */}
                                <section className="w-[450px] shrink-0 flex flex-col border rounded-xl bg-card overflow-hidden shadow-sm">
                                    <div className="p-4 border-b bg-muted/20">
                                        <h2 className="text-xl font-semibold">{selectedAgent.name} Overview</h2>
                                        <p className="text-sm text-muted-foreground mt-1">{selectedAgent.description}</p>
                                    </div>
                                    <div className="p-4 flex-1 overflow-y-auto">
                                        <RAMInfoPanel
                                            agent={selectedAgent}
                                            onUpdateTriggered={fetchAgents}
                                        />
                                    </div>
                                </section>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-muted-foreground">
                                Select an agent to begin.
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
