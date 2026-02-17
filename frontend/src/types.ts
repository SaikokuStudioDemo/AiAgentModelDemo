export interface RAMStatus {
    last_updated: string | null;
    next_update_scheduled: string | null;
    status: string;
    doc_count: number;
    source_url: string;
}

export interface Agent {
    id: string;
    name: string;
    type: string;
    description: string;
    ram_status: RAMStatus;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    source_nodes?: string[];
}

export interface ChatResponse {
    response: string;
    source_nodes: string[];
}
