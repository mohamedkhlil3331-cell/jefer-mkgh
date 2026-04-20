import { statusColors } from "../data.js";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const colorClass = statusColors[status as keyof typeof statusColors] ?? "bg-slate-100 text-slate-600 border-slate-200";
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${colorClass} ${sizeClass}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 flex-shrink-0" />
      {status}
    </span>
  );
}
