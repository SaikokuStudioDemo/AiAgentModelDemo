export interface RAMSource {
    url: string;
    title?: string;
    status: string;
    last_updated: string | null;
    doc_count: number;
}

export interface Agent {
    id: string;
    name: string;
    type: string;
    description: string;
    ram_sources: RAMSource[];
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
