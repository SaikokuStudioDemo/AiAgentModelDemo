import { Agent, ChatResponse } from "../types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export async function getAgents(): Promise<Agent[]> {
    const res = await fetch(`${API_URL}/agents`);
    if (!res.ok) throw new Error('Failed to fetch agents');
    return res.json();
}

export async function getAgent(id: string): Promise<Agent> {
    const res = await fetch(`${API_URL}/agents/${id}`);
    if (!res.ok) throw new Error('Failed to fetch agent');
    return res.json();
}

export async function createAgent(data: { name: string; type: string; description: string }): Promise<Agent> {
    const res = await fetch(`${API_URL}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to create agent');
    }
    return res.json();
}

export async function triggerUpdate(id: string, url: string): Promise<{ status: string, graph_id: string }> {
    const res = await fetch(`${API_URL}/agents/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });
    if (!res.ok) throw new Error('Failed to trigger update');
    return res.json();
}




export async function chat(agentId: string, message: string, model: string, history: { role: string, content: string }[] = []): Promise<ChatResponse> {
    const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId, message, model, history }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
}
