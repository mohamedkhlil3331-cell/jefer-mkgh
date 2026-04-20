import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Package, MapPin, MessageSquare, ClipboardList,
  BarChart3, Truck, Users, ListTodo, Receipt, Wrench, LogOut, X, ChevronRight, Boxes, Calculator
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

interface NavItem {
  id: string;
  labelKey: string;
  icon: React.ElementType;
}

const navByRole: Record<string, NavItem[]> = {
  customer: [
    { id: "dashboard",    labelKey: "dashboard",    icon: LayoutDashboard },
    { id: "place-order",  labelKey: "placeOrder",   icon: Package },
    { id: "track-order",  labelKey: "trackOrders",  icon: MapPin },
    { id: "ai-chat",      labelKey: "aiAssistant",  icon: MessageSquare },
  ],
  reviewer: [
    { id: "dashboard",   labelKey: "dashboard",   icon: LayoutDashboard },
    { id: "new-orders",  labelKey: "ordersQueue", icon: ClipboardList },
    { id: "inventory",   labelKey: "inventory",   icon: Boxes },
    { id: "analytics",   labelKey: "analytics",   icon: BarChart3 },
  ],
  supervisor: [
    { id: "dashboard", labelKey: "dashboard",    icon: LayoutDashboard },
    { id: "fleet",     labelKey: "fleetMgmt",    icon: Truck },
    { id: "drivers",   labelKey: "driverAssign", icon: Users },
    { id: "analytics", labelKey: "analytics",    icon: BarChart3 },
    { id: "payout",    labelKey: "payoutCalc",   icon: Calculator },
  ],
  driver: [
    { id: "dashboard",   labelKey: "dashboard",     icon: LayoutDashboard },
    { id: "tasks",       labelKey: "myTasks",        icon: ListTodo },
    { id: "expenses",    labelKey: "expenseReport",  icon: Receipt },
    { id: "maintenance", labelKey: "maintenance",    icon: Wrench },
    { id: "payout",      labelKey: "myPayout",       icon: Calculator },
  ],
};

interface SidebarProps {
  activeSection: string;
  onNavigate: (id: string) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({ activeSection, onNavigate, mobileOpen, onMobileClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const { t, isRTL } = useLanguage();
  const navItems = navByRole[user?.role ?? "customer"] ?? [];

  const roleColors: Record<string, string> = {
    customer: "bg-blue-500",
    reviewer: "bg-green-500",
    supervisor: "bg-purple-500",
    driver: "bg-orange-500",
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg mkgh-gradient-orange flex items-center justify-center shadow flex-shrink-0">
            <Truck className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <span className="text-white font-bold text-lg tracking-wide">MKGH</span>
            <p className="text-white/35 text-[10px] tracking-widest uppercase leading-none mt-0.5">{t("appTagline")}</p>
          </div>
        </div>
        {onMobileClose && (
          <button onClick={onMobileClose} className="lg:hidden text-white/50 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* User Info */}
      <div className="px-5 py-4 mx-3 mt-4 rounded-xl bg-white/5 border border-white/8">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full ${roleColors[user?.role ?? "customer"]} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
            {user?.avatar}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-white/45 text-xs truncate">{t(user?.role ?? "customer")}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-white/25 text-[10px] font-semibold tracking-widest uppercase px-3 mb-3">{t("navigation")}</p>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); onMobileClose?.(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group relative ${
                isActive
                  ? "bg-[#f97316] text-white shadow-md"
                  : "text-white/60 hover:text-white hover:bg-white/8"
              }`}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" />
              <span className={`flex-1 ${isRTL ? "text-right" : "text-left"}`}>{t(item.labelKey)}</span>
              {isActive && <ChevronRight className={`w-3.5 h-3.5 opacity-70 ${isRTL ? "rotate-180" : ""}`} />}
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-white/10">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/8 transition-all"
        >
          <LogOut className="w-4.5 h-4.5" />
          {t("signOut")}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="mkgh-sidebar hidden lg:flex flex-col w-64 flex-shrink-0 h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onMobileClose}
              className="lg:hidden fixed inset-0 bg-black/60 z-40"
            />
            <motion.aside
              initial={{ x: isRTL ? 280 : -280 }}
              animate={{ x: 0 }}
              exit={{ x: isRTL ? 280 : -280 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="mkgh-sidebar lg:hidden fixed left-0 top-0 h-full w-64 z-50 flex flex-col"
            >
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
