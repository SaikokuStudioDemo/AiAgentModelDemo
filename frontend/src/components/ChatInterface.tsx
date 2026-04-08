import { Agent, ChatMessage, SourceRef } from "@/types";
import { Send, Bot, BookOpen } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { chat } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';

function mapToMessage(m: { role: string; content: string }): ChatMessage {
    return {
        role: m.role as "user" | "assistant",
        content: m.content,
    };
}

interface ChatInterfaceProps {
    agent: Agent;
    model: string;
    userId: string;
    onOpenRef: (ref: SourceRef) => void;
}

export default function ChatInterface({ agent, model, userId, onOpenRef }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMessages([]);
        setSessionId(null);
        setPage(1);
        setHasMore(false);

        const fetchSession = async () => {
            try {
                const res = await fetch(`${API_URL}/sessions?user_id=${userId}&agent_id=${agent.id}`);
                const data = await res.json();
                if (data.sessions?.length > 0) {
                    setSessionId(data.sessions[0].session_id);
                }
            } catch (e) {
                console.error("Failed to fetch session", e);
            }
        };
        fetchSession();
    }, [agent.id]);

    useEffect(() => {
        if (!sessionId) return;
        const fetchInitialMessages = async () => {
            try {
                const res = await fetch(
                    `${API_URL}/sessions/${sessionId}/messages?page=1`
                );
                const data = await res.json();
                if (data.messages.length > 0) {
                    setMessages(data.messages.map(mapToMessage));
                    setHasMore(data.messages.length === 20);
                }
            } catch (e) {
                console.error("Failed to fetch messages", e);
            }
        };
        fetchInitialMessages();
    }, [sessionId]);

    useEffect(() => {
        if (loadingMore) return;
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
        if (e.currentTarget.scrollTop !== 0 || !hasMore || loadingMore || !sessionId) return;
        setLoadingMore(true);
        try {
            const nextPage = page + 1;
            const res = await fetch(
                `${API_URL}/sessions/${sessionId}/messages?page=${nextPage}`
            );
            const data = await res.json();
            if (data.messages.length > 0) {
                setMessages(prev => [...data.messages.map(mapToMessage), ...prev]);
                setPage(nextPage);
                setHasMore(data.messages.length === 20);
            } else {
                setHasMore(false);
            }
        } catch (e) {
            console.error("Failed to load more messages", e);
        } finally {
            setLoadingMore(false);
        }
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setLoading(true);

        try {
            const history = messages.map(m => ({
                role: m.role,
                content: m.content
            }));
            const res = await chat(agent.id, userMsg.content, model, history, userId);
            if (res.session_id && !sessionId) {
                setSessionId(res.session_id);
            }
            const aiMsg: ChatMessage = {
                role: 'assistant',
                content: res.response,
                source_nodes: res.source_nodes,
                source_refs: res.source_refs || []
            };
            setMessages(prev => [...prev, aiMsg]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', content: "Error: Failed to get response." }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full border rounded-xl bg-card overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-muted/20 font-medium flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Chat with {agent.name}
            </div>

            <div
                className="flex-1 overflow-y-auto p-4 space-y-4"
                ref={scrollRef}
                onScroll={handleScroll}
            >
                {loadingMore && (
                    <div className="text-center text-muted-foreground text-sm py-2">
                        読み込み中...
                    </div>
                )}

                {messages.length === 0 && (
                    <div className="text-center text-muted-foreground py-10">
                        Ask about {agent.type === "Tax-Agent" ? "taxes" : "laws"}...
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-lg p-3 ${msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                            }`}>
                            <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                            {msg.role === "assistant" && msg.source_refs && msg.source_refs.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {msg.source_refs.map((ref, i) => (
                                        <button
                                            key={i}
                                            onClick={() => onOpenRef(ref)}
                                            className="text-xs px-2 py-0.5 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors flex items-center gap-1"
                                        >
                                            <BookOpen className="w-3 h-3" />
                                            {ref.title || ref.id}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-muted max-w-[80%] rounded-lg p-3 flex items-center gap-2">
                            <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                            <div className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 border-t bg-background flex gap-2">
                <textarea
                    className="flex-1 bg-muted px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[44px] max-h-[120px]"
                    placeholder="Type your question... (Shift+Enter to send)"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') {
                            if (e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }
                    }}
                    disabled={loading}
                    rows={1}
                />
                <button
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    className="bg-primary text-primary-foreground p-2 rounded-md hover:opacity-90 disabled:opacity-50 h-[44px] w-[44px] flex items-center justify-center"
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
}
