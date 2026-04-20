import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Sidebar from "../components/Sidebar";
import TopNav from "../components/TopNav";
import BottomNav from "../components/BottomNav";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

// Customer pages
import CustomerDashboard from "../pages/customer/Dashboard";
import PlaceOrder from "../pages/customer/PlaceOrder";
import TrackOrder from "../pages/customer/TrackOrder";
import AIChat from "../pages/customer/AIChat";

// Reviewer pages
import ReviewerDashboard from "../pages/reviewer/Dashboard";
import NewOrders from "../pages/reviewer/NewOrders";
import Inventory from "../pages/reviewer/Inventory";

// Supervisor pages
import SupervisorDashboard from "../pages/supervisor/Dashboard";
import Fleet from "../pages/supervisor/Fleet";
import Drivers from "../pages/supervisor/Drivers";

// Driver pages
import DriverDashboard from "../pages/driver/Dashboard";
import Tasks from "../pages/driver/Tasks";
import Expenses from "../pages/driver/Expenses";
import Maintenance from "../pages/driver/Maintenance";

// Shared
import Analytics from "../pages/Analytics";
import PayoutCalculator from "../pages/PayoutCalculator";

const sectionTitleKeys: Record<string, Record<string, string>> = {
  customer: {
    dashboard: "dashboard",
    "place-order": "placeOrderTitle",
    "track-order": "trackTitle",
    "ai-chat": "aiChatTitle",
  },
  reviewer: {
    dashboard: "dashboard",
    "new-orders": "ordersQueueTitle",
    inventory: "inventoryTitle",
    analytics: "analyticsTitle",
  },
  supervisor: {
    dashboard: "dashboard",
    fleet: "fleetTitle",
    drivers: "driverAssignTitle",
    analytics: "analyticsTitle",
    payout: "payoutTitle",
  },
  driver: {
    dashboard: "dashboard",
    tasks: "tasksTitle",
    expenses: "expenseTitle",
    maintenance: "maintTitle",
    payout: "myPayout",
  },
};

const defaultSection: Record<string, string> = {
  customer: "dashboard",
  reviewer: "dashboard",
  supervisor: "dashboard",
  driver: "dashboard",
};

function renderSection(role: string, section: string) {
  if (role === "customer") {
    if (section === "dashboard") return <CustomerDashboard />;
    if (section === "place-order") return <PlaceOrder />;
    if (section === "track-order") return <TrackOrder />;
    if (section === "ai-chat") return <AIChat />;
  }
  if (role === "reviewer") {
    if (section === "dashboard") return <ReviewerDashboard />;
    if (section === "new-orders") return <NewOrders />;
    if (section === "inventory") return <Inventory />;
    if (section === "analytics") return <Analytics />;
  }
  if (role === "supervisor") {
    if (section === "dashboard") return <SupervisorDashboard />;
    if (section === "fleet") return <Fleet />;
    if (section === "drivers") return <Drivers />;
    if (section === "analytics") return <Analytics />;
    if (section === "payout") return <PayoutCalculator />;
  }
  if (role === "driver") {
    if (section === "dashboard") return <DriverDashboard />;
    if (section === "tasks") return <Tasks />;
    if (section === "expenses") return <Expenses />;
    if (section === "maintenance") return <Maintenance />;
    if (section === "payout") return <PayoutCalculator />;
  }
  return <div className="text-muted-foreground text-sm">Section not found.</div>;
}

export default function DashboardLayout() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const role = user?.role ?? "customer";
  const [activeSection, setActiveSection] = useState(defaultSection[role] ?? "dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);

  const titleKey = sectionTitleKeys[role]?.[activeSection] ?? "dashboard";
  const title = t(titleKey);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        activeSection={activeSection}
        onNavigate={setActiveSection}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav title={title} onMenuToggle={() => setMobileOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 lg:pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {renderSection(role, activeSection)}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <BottomNav
        role={role}
        activeSection={activeSection}
        onNavigate={(id) => { setActiveSection(id); setMobileOpen(false); }}
      />
    </div>
  );
}
