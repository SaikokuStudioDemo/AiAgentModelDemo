interface TabButtonProps {
    active: boolean;
    onClick: () => void;
    icon?: React.ReactNode;
    label: string;
    count?: number;
}

export default function TabButton({ active, onClick, icon, label, count }: TabButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground"
            }`}
        >
            {icon}
            {label}
            {count !== undefined && count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {count.toLocaleString()}
                </span>
            )}
        </button>
    );
}
