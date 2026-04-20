import { motion } from "framer-motion";
import {
  LayoutDashboard, Package, MapPin, MessageSquare, ClipboardList,
  BarChart3, Truck, Users, ListTodo, Receipt, Wrench, Boxes
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const navByRole: Record<string, NavItem[]> = {
  customer: [
    { id: "dashboard", label: "Home", icon: LayoutDashboard },
    { id: "place-order", label: "Order", icon: Package },
    { id: "track-order", label: "Track", icon: MapPin },
    { id: "ai-chat", label: "AI Chat", icon: MessageSquare },
  ],
  reviewer: [
    { id: "dashboard", label: "Home", icon: LayoutDashboard },
    { id: "new-orders", label: "Orders", icon: ClipboardList },
    { id: "inventory", label: "Stock", icon: Boxes },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ],
  supervisor: [
    { id: "dashboard", label: "Home", icon: LayoutDashboard },
    { id: "fleet", label: "Fleet", icon: Truck },
    { id: "drivers", label: "Drivers", icon: Users },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ],
  driver: [
    { id: "dashboard", label: "Home", icon: LayoutDashboard },
    { id: "tasks", label: "Tasks", icon: ListTodo },
    { id: "expenses", label: "Expenses", icon: Receipt },
    { id: "maintenance", label: "Report", icon: Wrench },
  ],
};

interface BottomNavProps {
  role: string;
  activeSection: string;
  onNavigate: (id: string) => void;
}

export default function BottomNav({ role, activeSection, onNavigate }: BottomNavProps) {
  const items = navByRole[role] ?? navByRole.customer;

  return (
    <nav className="bottom-nav lg:hidden fixed bottom-0 left-0 right-0 z-40 px-2 py-2 safe-area-pb">
      <div className="flex items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl relative min-w-0 flex-1"
            >
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-pill"
                  className="absolute inset-0 rounded-xl bg-[#f97316]/15"
                  transition={{ type: "spring", damping: 24, stiffness: 300 }}
                />
              )}
              <Icon
                className={`w-5 h-5 relative z-10 transition-colors ${
                  isActive ? "text-[#f97316]" : "text-white/40"
                }`}
              />
              <span
                className={`text-[10px] font-medium relative z-10 transition-colors leading-none ${
                  isActive ? "text-[#f97316]" : "text-white/35"
                }`}
              >
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-dot"
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#f97316]"
                  transition={{ type: "spring", damping: 24, stiffness: 300 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
