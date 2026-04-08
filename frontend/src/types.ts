export interface RAMSource {
    url: string;
    title?: string;
    status: string;
    last_updated: string | null;
    doc_count: number;
    source_type?: string; // "e_gov" | "nta_faq"
}

export interface Agent {
    id: string;
    name: string;
    type: string;
    description: string;
    ram_sources: RAMSource[];
}

export interface SourceRef {
    type: "law" | "nta_faq";
    id: string;
    title: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    source_nodes?: string[];
    source_refs?: SourceRef[];
}

export interface ChatResponse {
    response: string;
    source_nodes: string[];
    session_id?: string;
    source_refs?: SourceRef[];
}

export interface KnowledgeLaw {
    law_id: string;
    title: string;
    law_num: string;
    promulgation_date: string | null;
}

export interface KnowledgeNTA {
    no: string;
    title: string;
    category: string;
    url: string;
    last_scraped_at: string | null;
}

export interface KnowledgeListResponse<T> {
    total: number;
    page: number;
    limit: number;
    items: T[];
    categories?: string[];
    error?: string;
}
