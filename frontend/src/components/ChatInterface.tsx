import { Agent, ChatMessage } from "@/types";
import { Send, Bot, User as UserIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { chat } from "@/lib/api";

interface ChatInterfaceProps {
    agent: Agent;
}

export default function ChatInterface({ agent }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Reset chat when agent changes
        setMessages([]);
    }, [agent.id]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: ChatMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setLoading(true);

        try {
            const res = await chat(agent.id, userMsg.content);
            const aiMsg: ChatMessage = {
                role: 'assistant',
                content: res.response,
                source_nodes: res.source_nodes
            };
            setMessages(prev => [...prev, aiMsg]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'assistant', content: "Error: Failed to get response." }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[600px] border rounded-xl bg-card overflow-hidden shadow-sm">
            <div className="p-4 border-b bg-muted/20 font-medium flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Chat with {agent.name}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
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
                            {msg.source_nodes && msg.source_nodes.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-black/10 text-xs opacity-70 flex gap-1 items-center">
                                    Graph Nodes:
                                    {msg.source_nodes.map(node => (
                                        <span key={node} className="bg-black/10 px-1 rounded">{node}</span>
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
                            // Default behavior (no shift) is newline
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
