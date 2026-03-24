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
    const [syncState, setSyncState] = useState({ is_syncing: false, mode: null, current: 0, total: 0, message: "", eta_seconds: null as number | null });
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

    const fetchSyncStatus = async () => {
        try {
            const res = await fetch(`${API_URL}/library/sync_status`);
            if (res.ok) {
                const data = await res.json();
                setSyncState(prev => {
                    // Refresh laws if sync just finished
                    if (prev.is_syncing && !data.is_syncing) fetchLaws();
                    return data;
                });
            }
        } catch (e) {
            console.error("Failed to fetch sync status", e);
        }
    };

    useEffect(() => {
        fetchLaws();
        fetchSyncStatus();
        const interval = setInterval(fetchSyncStatus, 2000);
        return () => clearInterval(interval);
    }, []);

    const handleSyncIncremental = async () => {
        try {
            await fetch(`${API_URL}/library/sync_incremental`, { method: 'POST' });
            fetchSyncStatus();
        } catch (error) {
            console.error("Failed to start incremental sync", error);
        }
    };

    const handleSyncFull = async () => {
        if (!confirm("Are you sure? This will delete all downloaded full-text data and re-download all existing laws at a slow rate to respect API limits. This process will take hours.")) return;
        try {
            await fetch(`${API_URL}/library/sync_full`, { method: 'POST' });
            fetchSyncStatus();
        } catch (error) {
            console.error("Failed to start full sync", error);
        }
    };

    const formatETA = (seconds: number | null) => {
        if (seconds === null || seconds < 0) return "Calculating...";
        if (seconds < 60) return `${seconds}s remaining`;
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}m ${secs}s remaining`;
    };


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

        // Send API request
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
            // Ideally re-fetch or rely on optimistic
        } catch (error) {
            console.error("Failed to toggle mapping", error);
            // Revert on failure
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
        <div className="relative flex flex-col h-full bg-background rounded-l-3xl p-8 overflow-y-auto">
            {syncState.is_syncing && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-start pt-[20vh] flex-col p-8">
                    <div className="bg-card w-full max-w-xl rounded-2xl p-8 shadow-2xl border text-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-primary/20">
                            <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${syncState.total ? (syncState.current / syncState.total) * 100 : 0}%` }}></div>
                        </div>
                        <RefreshCw className="w-12 h-12 animate-spin mx-auto mb-6 text-primary" />
                        <h2 className="text-2xl font-bold mb-3 tracking-tight">
                            {syncState.mode === 'full' ? 'Full Text Database Sync' : 'Incremental Sync'}
                        </h2>
                        <p className="text-muted-foreground mb-8 text-base font-medium">{syncState.message}</p>

                        {syncState.total > 0 && (
                            <div className="mb-6 bg-muted/30 p-4 rounded-xl border border-border/50">
                                <div className="flex justify-between text-sm font-semibold mb-2">
                                    <span className="text-foreground">{syncState.current.toLocaleString()} / {syncState.total.toLocaleString()}</span>
                                    <span className="text-primary">{formatETA(syncState.eta_seconds)}</span>
                                </div>
                                <div className="h-3 bg-muted overflow-hidden rounded-full">
                                    <div className="h-full bg-primary transition-all duration-300 ease-out" style={{ width: `${(syncState.current / syncState.total) * 100}%` }}></div>
                                </div>
                            </div>
                        )}
                        <p className="text-sm text-amber-600 dark:text-amber-500 font-medium">Please wait. Other actions are safely disabled during this process.</p>
                    </div>
                </div>
            )}
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Law Library Matrix</h1>
                    <p className="text-muted-foreground text-lg">
                        Manage your local Master DB of Japanese Laws and map them to specialized Agents.
                    </p>
                </div>

                <div className="flex gap-3 relative z-40">
                    <button
                        onClick={handleSyncIncremental}
                        disabled={syncState.is_syncing}
                        className="bg-card text-foreground border px-4 py-2 rounded-xl text-sm font-medium hover:bg-muted/80 flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${syncState.is_syncing && syncState.mode === 'incremental' ? "animate-spin" : ""}`} />
                        Incremental Update
                    </button>
                    <button
                        onClick={handleSyncFull}
                        disabled={syncState.is_syncing}
                        className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90 flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${syncState.is_syncing && syncState.mode === 'full' ? "animate-spin" : ""}`} />
                        Full Text Download
                    </button>
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
                    <span className="text-sm text-muted-foreground ml-auto shrink-0">Showing {filteredLaws.length} laws (limit 1,000 in prototype mode)</span>
                </div>

                <div className="border rounded-xl overflow-hidden flex-1 flex flex-col">
                    <div className="overflow-y-auto w-full">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b z-10 text-sm font-semibold text-muted-foreground">
                                <tr>
                                    <th className="p-4 w-[400px]">Law Title & Info</th>
                                    {agents.map(agent => {
                                        const assignedCount = agent.ram_sources?.length || 0;
                                        return (
                                            <th key={agent.id} className="p-4 text-center border-l bg-card relative">
                                                <div className="font-semibold text-foreground">{agent.name}</div>
                                                <div className="text-xs font-normal text-muted-foreground mt-1 truncate max-w-[150px] mx-auto">{agent.type}</div>
                                                <div className="text-xs font-bold text-primary mt-1">({assignedCount} Laws Assigned)</div>
                                                <label className={`flex items-center justify-center gap-1.5 mt-2 text-xs font-medium text-muted-foreground cursor-pointer select-none bg-muted/40 py-1.5 px-2.5 rounded-md mx-auto w-max transition-colors border border-transparent ${syncState.is_syncing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted/60 hover:border-border'}`}>
                                                    <input
                                                        type="checkbox"
                                                        disabled={syncState.is_syncing}
                                                        checked={showOnlyAssignedAgentId === agent.id}
                                                        onChange={(e) => setShowOnlyAssignedAgentId(e.target.checked ? agent.id : null)}
                                                        className="w-3.5 h-3.5 rounded border-input text-primary focus:ring-primary/20 cursor-pointer disabled:cursor-not-allowed"
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
                                            No laws found in local DB. Click "Sync Latest from e-Gov" to populate.
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
                                                                className="w-5 h-5 rounded border-input text-primary focus:ring-primary/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                                                checked={isChecked}
                                                                disabled={syncState.is_syncing}
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
