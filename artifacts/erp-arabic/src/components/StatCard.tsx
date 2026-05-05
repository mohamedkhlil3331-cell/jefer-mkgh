import { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: "blue" | "green" | "yellow" | "red" | "purple";
  sub?: string;
}

const COLORS = {
  blue:   { bg: "bg-blue-50",   icon: "bg-blue-100 text-blue-600",   val: "text-blue-700" },
  green:  { bg: "bg-green-50",  icon: "bg-green-100 text-green-600",  val: "text-green-700" },
  yellow: { bg: "bg-yellow-50", icon: "bg-yellow-100 text-yellow-600", val: "text-yellow-700" },
  red:    { bg: "bg-red-50",    icon: "bg-red-100 text-red-600",    val: "text-red-700" },
  purple: { bg: "bg-purple-50", icon: "bg-purple-100 text-purple-600", val: "text-purple-700" },
};

export default function StatCard({ label, value, icon: Icon, color = "blue", sub }: Props) {
  const c = COLORS[color];
  return (
    <div className={`${c.bg} rounded-xl p-4 flex items-center gap-4`}>
      <div className={`${c.icon} rounded-lg p-3 flex-shrink-0`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <div className={`text-2xl font-bold ${c.val} leading-none`}>{value}</div>
        <div className="text-sm text-muted-foreground mt-1">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
