"use client";

import { useEffect, useState } from "react";
import AgentSidebar from "@/components/AgentSidebar";
import ChatInterface from "@/components/ChatInterface";
import LawLibrary from "@/components/LawLibrary";
import KnowledgeBase from "@/components/KnowledgeBase";
import SyncManager from "@/components/SyncManager";
import { Agent, SourceRef } from "@/types";
import { getAgents, createAgent } from "@/lib/api";
import { MessageSquare, BookOpen } from "lucide-react";
import TabButton from "@/components/ui/TabButton";

const DEFAULT_MODEL = process.env.NEXT_PUBLIC_DEFAULT_MODEL ?? "claude-sonnet-4-6";

type AgentTab = "chat" | "knowledge";

export default function Dashboard() {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [loading, setLoading] = useState(true);
    const [currentView, setCurrentView] = useState<"workspace" | "library" | "knowledge" | "sync">("workspace");
    const [agentTab, setAgentTab] = useState<AgentTab>("chat");
    const [pendingRef, setPendingRef] = useState<SourceRef | null>(null);

    const fetchAgents = async () => {
        try {
            const data = await getAgents();
            setAgents(data);
            if (data.length > 0 && !selectedAgent) {
                setSelectedAgent(data[0]);
            } else if (selectedAgent) {
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
            setAgentTab("chat");
        } catch (e) {
            console.error(e);
            alert("Failed to create agent: " + (e as Error).message);
        }
    };

    useEffect(() => {
        fetchAgents();
        const interval = setInterval(fetchAgents, 5000);
        return () => clearInterval(interval);
    }, []);

    // エージェント切り替え時はチャットタブに戻す
    const handleSelectAgent = (agent: Agent) => {
        setSelectedAgent(agent);
        setCurrentView("workspace");
        setAgentTab("chat");
    };

    if (loading && agents.length === 0) {
        return <div className="flex h-screen items-center justify-center">Loading AI Agent...</div>;
    }

    // エージェントがNTAソースを持つかどうか
    const agentHasNTA = selectedAgent?.ram_sources?.some(s => s.source_type === "nta_faq") ?? false;

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            <AgentSidebar
                agents={agents}
                selectedAgentId={selectedAgent?.id || null}
                onSelect={handleSelectAgent}
                currentView={currentView}
                onViewChange={setCurrentView}
                onCreateAgent={handleCreateAgent}
            />

            <main className="flex-1 flex flex-col overflow-hidden">
                {currentView === "library" ? (
                    <div className="flex-1 p-8 overflow-y-auto">
                        <LawLibrary agents={agents} />
                    </div>
                ) : currentView === "knowledge" ? (
                    <div className="flex-1 p-8 overflow-y-auto">
                        <KnowledgeBase />
                    </div>
                ) : currentView === "sync" ? (
                    <div className="flex-1 overflow-y-auto">
                        <SyncManager />
                    </div>
                ) : (
                    // Workspace
                    <>
                        {selectedAgent ? (
                            <div className="flex flex-col h-full">
                                {/* エージェントヘッダー + タブ */}
                                <div className="px-8 pt-6 pb-0 border-b bg-background shrink-0">
                                    <div className="flex items-end justify-between mb-0">
                                        <div>
                                            <h1 className="text-2xl font-bold tracking-tight">{selectedAgent.name}</h1>
                                            <p className="text-sm text-muted-foreground mt-0.5">{selectedAgent.description}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 mt-4">
                                        <TabButton
                                            active={agentTab === "chat"}
                                            onClick={() => setAgentTab("chat")}
                                            icon={<MessageSquare className="w-4 h-4" />}
                                            label="Chat"
                                        />
                                        <TabButton
                                            active={agentTab === "knowledge"}
                                            onClick={() => setAgentTab("knowledge")}
                                            icon={<BookOpen className="w-4 h-4" />}
                                            label="Knowledge Base"
                                        />
                                    </div>
                                </div>

                                {/* タブコンテンツ */}
                                <div className="flex-1 overflow-hidden">
                                    {agentTab === "chat" ? (
                                        <div className="h-full p-8">
                                            <ChatInterface
                                            agent={selectedAgent}
                                            model={DEFAULT_MODEL}
                                            userId="dev_user"
                                            onOpenRef={(ref) => {
                                                setPendingRef(ref);
                                                setAgentTab("knowledge");
                                            }}
                                        />
                                        </div>
                                    ) : (
                                        <KnowledgeBase
                                            agentId={selectedAgent.id}
                                            hasNTA={agentHasNTA}
                                            compact={true}
                                            pendingRef={pendingRef}
                                            onPendingRefHandled={() => setPendingRef(null)}
                                        />
                                    )}
                                </div>
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

