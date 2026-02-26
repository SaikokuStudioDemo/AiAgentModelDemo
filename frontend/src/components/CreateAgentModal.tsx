import { useState } from "react";
import { X } from "lucide-react";

interface CreateAgentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { name: string; type: string; description: string }) => void;
}

export default function CreateAgentModal({ isOpen, onClose, onSubmit }: CreateAgentModalProps) {
    const [name, setName] = useState("");
    const [type, setType] = useState("Tax-Agent");
    const [description, setDescription] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSubmit({ name, type, description });
            setName("");
            setType("Tax-Agent");
            setDescription("");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background border rounded-xl shadow-lg w-full max-w-md p-6 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
                >
                    <X className="w-5 h-5" />
                </button>
                <h2 className="text-xl font-bold mb-6">Create New Agent</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Agent Name</label>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full border rounded-md p-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="e.g., Corporate Tax Expert"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Agent Type</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="w-full border rounded-md p-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <option value="Tax-Agent">Tax Agent</option>
                            <option value="Legal-Agent">Legal Agent</option>
                            <option value="Labor-Agent">Labor Agent</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Description</label>
                        <textarea
                            required
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full border rounded-md p-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary h-24 resize-none"
                            placeholder="Briefly describe the agent's specialty..."
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border rounded-md hover:bg-muted"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                        >
                            {isSubmitting ? "Creating..." : "Create Agent"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
