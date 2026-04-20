import { Menu, Bell, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const roleColors: Record<string, string> = {
  customer: "bg-blue-500",
  reviewer: "bg-green-500",
  supervisor: "bg-purple-500",
  driver: "bg-orange-500",
};

const roleLabels: Record<string, string> = {
  customer: "Customer",
  reviewer: "Reviewer",
  supervisor: "Transport Supervisor",
  driver: "Driver",
};

const roleBadgeStyle: Record<string, string> = {
  customer: "bg-blue-100 text-blue-700",
  reviewer: "bg-green-100 text-green-700",
  supervisor: "bg-purple-100 text-purple-700",
  driver: "bg-orange-100 text-orange-700",
};

interface TopNavProps {
  title: string;
  onMenuToggle: () => void;
}

export default function TopNav({ title, onMenuToggle }: TopNavProps) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-4 lg:px-6 h-16 flex items-center gap-4 shadow-xs">
      {/* Mobile menu */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Title */}
      <h1 className="text-base font-semibold text-foreground truncate flex-1">{title}</h1>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Notification */}
        <button className="relative p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground hidden sm:flex">
          <Bell className="w-4.5 h-4.5" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[#f97316] rounded-full" />
        </button>

        {/* User badge */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-border ml-1">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-medium text-foreground leading-tight">{user?.name}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${roleBadgeStyle[user?.role ?? "customer"]}`}>
              {roleLabels[user?.role ?? "customer"]}
            </span>
          </div>
          <div className={`w-8 h-8 rounded-full ${roleColors[user?.role ?? "customer"]} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
            {user?.avatar}
          </div>
        </div>
      </div>
    </header>
  );
}
