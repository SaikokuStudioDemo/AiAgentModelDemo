"use client";

import { useState, useEffect } from 'react';
import { Agent } from '../types';
import { RefreshCw, ExternalLink, Search } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

interface LawMatrixItem {
    law_id: string;
    law_num: string;
    title: string;
    promulgation_date: string | null;
    mappings: Record<string, string>; // agent_id -> status
}

interface LawLibraryProps {
    agents: Agent[];
}

export default function LawLibrary({ agents }: LawLibraryProps) {
    const [laws, setLaws] = useState<LawMatrixItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [showOnlyAssignedAgentId, setShowOnlyAssignedAgentId] = useState<string | null>(null);

    const fetchLaws = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_URL}/library/laws`);
            if (res.ok) {
                const data = await res.json();
                setLaws(data);
            }
        } catch (error) {
            console.error("Failed to fetch laws matrix", error);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchLaws();
    }, []);

    const handleToggleMapping = async (lawId: string, agentId: string, currentlyChecked: boolean) => {
        const newCheckedState = !currentlyChecked;

        // Optimistic UI update
        setLaws(prev => prev.map(law => {
            if (law.law_id === lawId) {
                const newMappings = { ...law.mappings };
                if (newCheckedState) {
                    newMappings[agentId] = "Pending";
                } else {
                    delete newMappings[agentId];
                }
                return { ...law, mappings: newMappings };
            }
            return law;
        }));

        try {
            await fetch(`${API_URL}/library/mappings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agent_id: agentId,
                    law_id: lawId,
                    checked: newCheckedState
                })
            });
        } catch (error) {
            console.error("Failed to toggle mapping", error);
            fetchLaws();
        }
    };

    const filteredLaws = laws.filter(l => {
        const matchesSearch = l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.law_num.toLowerCase().includes(searchQuery.toLowerCase());

        if (showOnlyAssignedAgentId) {
            return matchesSearch && showOnlyAssignedAgentId in l.mappings;
        }
        return matchesSearch;
    });

    return (
        <div className="flex flex-col h-full bg-background rounded-l-3xl p-8 overflow-y-auto">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Law Library Matrix</h1>
                    <p className="text-muted-foreground text-lg">
                        ローカルDBの法令一覧。エージェントへの割り当てを管理します。
                    </p>
                </div>
            </div>

            <div className="bg-card border rounded-2xl p-6 shadow-sm mb-6 flex-1 flex flex-col min-h-0">
                <div className="mb-4 flex gap-4 items-center justify-between">
                    <div className="flex gap-4 items-center flex-1">
                        <div className="relative w-72">
                            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search by Title or Law No..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-muted/30 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                    </div>
                    <span className="text-sm text-muted-foreground ml-auto shrink-0">Showing {filteredLaws.length} laws</span>
                </div>

                <div className="border rounded-xl overflow-hidden flex-1 flex flex-col">
                    <div className="overflow-y-auto w-full">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b z-10 text-sm font-semibold text-muted-foreground">
                                <tr>
                                    <th className="p-4 w-[400px]">Law Title & Info</th>
                                    {agents.map(agent => {
                                        const assignedCount = agent.ram_sources?.filter(s => s.source_type !== "nta_faq").length || 0;
                                        return (
                                            <th key={agent.id} className="p-4 text-center border-l bg-card relative">
                                                <div className="font-semibold text-foreground">{agent.name}</div>
                                                <div className="text-xs font-normal text-muted-foreground mt-1 truncate max-w-[150px] mx-auto">{agent.type}</div>
                                                <div className="text-xs font-bold text-primary mt-1">({assignedCount} Laws Assigned)</div>
                                                <label className="flex items-center justify-center gap-1.5 mt-2 text-xs font-medium text-muted-foreground cursor-pointer select-none bg-muted/40 py-1.5 px-2.5 rounded-md mx-auto w-max transition-colors border border-transparent hover:bg-muted/60 hover:border-border">
                                                    <input
                                                        type="checkbox"
                                                        checked={showOnlyAssignedAgentId === agent.id}
                                                        onChange={(e) => setShowOnlyAssignedAgentId(e.target.checked ? agent.id : null)}
                                                        className="w-3.5 h-3.5 rounded border-input text-primary focus:ring-primary/20 cursor-pointer"
                                                    />
                                                    Filter
                                                </label>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y text-sm">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={agents.length + 1} className="p-8 text-center text-muted-foreground">
                                            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                                            Loading Library...
                                        </td>
                                    </tr>
                                ) : filteredLaws.length === 0 ? (
                                    <tr>
                                        <td colSpan={agents.length + 1} className="p-8 text-center text-muted-foreground">
                                            No laws found in local DB.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLaws.map(law => (
                                        <tr key={law.law_id} className="hover:bg-muted/10 transition-colors">
                                            <td className="p-4">
                                                <div className="font-semibold text-base mb-1 text-foreground">{law.title}</div>
                                                <div className="flex gap-4 text-xs">
                                                    <span className="text-muted-foreground font-mono bg-muted/30 px-2 py-0.5 rounded">{law.law_num}</span>
                                                    <span className="text-muted-foreground flex items-center gap-1">
                                                        施行日: {law.promulgation_date ? law.promulgation_date : 'N/A'}
                                                    </span>
                                                    <a
                                                        href={`${API_URL}/laws/${law.law_id}/raw?t=${Date.now()}`}
                                                        target="_blank"
                                                        className="text-blue-500 hover:text-blue-600 flex items-center gap-1 font-medium ml-auto"
                                                    >
                                                        Review <ExternalLink className="w-3 h-3" />
                                                    </a>
                                                </div>
                                            </td>
                                            {agents.map(agent => {
                                                const isChecked = agent.id in law.mappings;
                                                const status = law.mappings[agent.id];

                                                return (
                                                    <td key={agent.id} className="p-4 text-center border-l align-middle">
                                                        <div className="flex flex-col items-center justify-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                className="w-5 h-5 rounded border-input text-primary focus:ring-primary/20 cursor-pointer"
                                                                checked={isChecked}
                                                                onChange={() => handleToggleMapping(law.law_id, agent.id, isChecked)}
                                                            />
                                                            {isChecked && (
                                                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status === 'Synced' ? 'bg-green-100 text-green-700' :
                                                                    status === 'Syncing' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                                                                        'bg-amber-100 text-amber-700'
                                                                    }`}>
                                                                    {status} RAM Mode
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
