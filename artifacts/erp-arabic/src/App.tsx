import { useEffect, useState } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth, canAccess, type User } from "@/context/AuthContext";
import { ROUTE_PERM } from "@/lib/permissions";
import { Shield } from "lucide-react";
import { LangProvider, useLang } from "@/context/LangContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Sidebar from "@/components/Sidebar";
import Login from "@/pages/Login";
import OfflineBanner from "@/components/OfflineBanner";
import Notifications from "@/pages/Notifications";
import MainHome from "@/pages/MainHome";

// Customer pages
import Catalog from "@/pages/customer/Catalog";
import PlaceOrder from "@/pages/customer/PlaceOrder";
import MyOrders from "@/pages/customer/MyOrders";
import OrderDetail from "@/pages/customer/OrderDetail";
import Account from "@/pages/customer/Account";
import ExternalRentals from "@/pages/customer/ExternalRentals";
import Profile from "@/pages/customer/Profile";
import Cart from "@/pages/customer/Cart";
import RentalTripPortal from "@/pages/customer/RentalTripPortal";
import { CartProvider } from "@/context/CartContext";

// Role pages
import ReviewerOrders from "@/pages/reviewer/ReviewerOrders";
import SupervisorOrders from "@/pages/supervisor/SupervisorOrders";
import WarehouseOrders from "@/pages/warehouse/WarehouseOrders";
import RepOrders from "@/pages/rep/RepOrders";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import BackupRestoreLogPage from "@/pages/admin/BackupRestoreLogPage";
import WarehousesPage from "@/pages/admin/WarehousesPage";
import ProductsAdmin from "@/pages/admin/ProductsAdmin";
import EmployeesPage from "@/pages/admin/EmployeesPage";
import TariffsPage from "@/pages/admin/TariffsPage";
import DriversPage from "@/pages/admin/DriversPage";
import VehicleDashboardAdmin from "@/pages/admin/VehicleDashboardAdmin";
import LegalPage from "@/pages/admin/LegalPage";
import SystemLogsPage from "@/pages/admin/SystemLogsPage";
import RatingsAnalyticsPage from "@/pages/admin/RatingsAnalyticsPage";
import LoadingPointsPage from "@/pages/admin/LoadingPointsPage";
import HRRequestsPage from "@/pages/admin/HRRequestsPage";
import AdminApprovalsPage from "@/pages/admin/AdminApprovalsPage";
import UsersPage from "@/pages/admin/UsersPage";
import ReportsPage from "@/pages/admin/ReportsPage";
import EmployeePortal from "@/pages/employee/EmployeePortal";
import WorkshopManagerPage from "@/pages/workshop/WorkshopManagerPage";
import WorkshopInventoryPage from "@/pages/workshop/WorkshopInventoryPage";
import PurchasingPage from "@/pages/purchasing/PurchasingPage";
import ReimbursementPage from "@/pages/purchasing/ReimbursementPage";
import FinancePage from "@/pages/admin/FinancePage";
import CompanySettingsPage from "@/pages/admin/CompanySettingsPage";
import RepTargetsPage from "@/pages/admin/RepTargetsPage";
import WarehouseManagerDashboard from "@/pages/warehouse/WarehouseManagerDashboard";
import AIChatWidget from "@/components/AIChatWidget";
import VehicleExpenses from "@/pages/vehicle/VehicleExpenses";
import VehicleTypeDefsPage from "@/pages/admin/VehicleTypeDefsPage";
import BulkerSupervisorPage from "@/pages/supervisor/BulkerSupervisorPage";
import BulkerDriverPage from "@/pages/supervisor/BulkerDriverPage";
import CraneSupervisorPage from "@/pages/supervisor/CraneSupervisorPage";
import DriverDocRequestsPage from "@/pages/supervisor/DriverDocRequestsPage";
import InternalRequestsPage from "@/pages/warehouse/InternalRequestsPage";
import FsohatPage from "@/pages/fsohat/FsohatPage";
import TransportationPage from "@/pages/transportation/TransportationPage";
import Trips from "@/pages/Trips";
import SystemGuidePage from "@/pages/admin/SystemGuidePage";
import ExcelImportPage from "@/pages/admin/ExcelImportPage";
import DevDashboard from "@/pages/DevDashboard";
import MkghAnalysisPage from "@/pages/mkgh/MkghAnalysisPage";
import { MutationSyncMonitor } from "@/components/MutationSyncStatus";
import RememberedScroll from "@/components/RememberedScroll";
import ChatPage from "@/pages/ChatPage";

const queryClient = new QueryClient();

/** Blocks access to a page if the user has custom permissions set that don't include `perm`.
 *  - Admin role: always passes through.
 *  - No permissions set: passes through (legacy role-based behaviour).
 *  - Permissions set: checks the specific key.
 *  - extraRoles: named roles that always bypass the perm check. */
function PermGuard({ perm, children, extraRoles = [], extraPerms = [] }: { perm: string; children: React.ReactNode; extraRoles?: string[]; extraPerms?: string[] }) {
  const { user } = useAuth();
  if (!user) return null;
  if (extraRoles.includes(user.role)) return <>{children}</>;
  if (canAccess(user, perm)) return <>{children}</>;
  if (extraPerms.some(p => canAccess(user, p))) return <>{children}</>;
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4 p-8" dir="rtl">
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
        <Shield size={36} className="text-gray-300"/>
      </div>
      <h2 className="text-xl font-black text-gray-600">عفواً، لا تملك صلاحية للوصول لهذه الشاشة</h2>
      <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
        تواصل مع مدير النظام لمنحك الصلاحية اللازمة للوصول إلى هذا القسم.
      </p>
    </div>
  );
}

function guard(perm: string, Component: React.ComponentType, extraRoles: string[] = [], extraPerms: string[] = []) {
  return () => <PermGuard perm={perm} extraRoles={extraRoles} extraPerms={extraPerms}><Component /></PermGuard>;
}


function FleetManageRedirect() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  useEffect(() => { if (user) setLocation("/supervisor"); }, [user]);
  if (!user) return null;
  return null;
}

function RoleHome() {
  const { user } = useAuth();
  if (!user) return null;

  // ── Standard role routing (unchanged for existing users) ──────────────
  if (user.role === "rental_trip_customer") return <RentalTripPortal />;
  if (user.role === "customer") return <Catalog />;
  if (user.role === "admin")    return <MainHome />;
  if (user.role === "vehicle")  return <VehicleExpenses />;
  if (user.role === "driver")        return <BulkerDriverPage />;
  if (user.role === "bulker_driver") return <BulkerDriverPage />;
  if (user.role === "reviewer") return <ReviewerOrders />;
  if (user.role === "supervisor") return <SupervisorOrders />;
  if (user.role === "warehouse")         return <WarehouseOrders />;
  if (user.role === "warehouse_manager") return <WarehouseManagerDashboard />;
  if (user.role === "rep")               return <RepOrders />;
  if (user.role === "finance")    return <FinancePage />;
  if (user.role === "workshop_manager") return <WorkshopManagerPage />;
  if (user.role === "purchasing") return <PurchasingPage />;
  if (user.role === "accountant") return <ReimbursementPage />;
  if (user.role === "bank_officer") return <ReimbursementPage />;

  // ── Custom role: route by first matched permission (new keys) ───────────
  const perms = user.permissions ?? [];
  if (perms.includes("home_main") || perms.includes("home_dashboard")) return <MainHome />;
  if (perms.includes("customer_catalog"))    return <Catalog />;
  if (perms.includes("ops_reviewer"))        return <ReviewerOrders />;
  if (perms.includes("ops_supervisor"))      return <SupervisorOrders />;
  if (perms.includes("ops_warehouse"))              return <WarehouseOrders />;
  if (perms.includes("stock_warehouse_manager"))    return <WarehouseManagerDashboard />;
  if (perms.includes("portal_driver"))        return <BulkerDriverPage />;
  if (perms.includes("portal_bulker_driver")) return <BulkerDriverPage />;
  if (perms.includes("portal_rep"))          return <RepOrders />;
  if (perms.includes("fleet_workshop"))      return <WorkshopManagerPage />;
  if (perms.includes("fleet_purchasing"))    return <PurchasingPage />;
  if (perms.includes("finance_main"))          return <FinancePage />;
  if (perms.includes("portal_employee"))       return <EmployeePortal />;
  if (perms.includes("ops_crane_supervisor"))  return <CraneSupervisorPage />;

  return <EmployeePortal />;
}

function RentalTripCustomerRoute() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role !== "rental_trip_customer") return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-4 p-8" dir="rtl">
      <Shield size={36} className="text-muted-foreground" />
      <h2 className="text-xl font-bold">هذه البوابة مخصصة لعملاء إيجار الرحلات فقط</h2>
    </div>
  );
  return <RentalTripPortal />;
}

function InternalChatRoute() {
  const { user } = useAuth();
  if (!user || user.isGuest) {
    return <Redirect to="/" replace />;
  }
  return <ChatPage />;
}

function AppRoutes() {
  const { user } = useAuth();
  if (user?.role === "rental_trip_customer") {
    return (
      <Switch>
        <Route path="/" component={RentalTripCustomerRoute} />
        <Route path="/rental-trip-portal" component={RentalTripCustomerRoute} />
        <Route path="/chat" component={InternalChatRoute} />
        <Route>
          <div className="flex min-h-screen items-center justify-center p-8 text-center" dir="rtl">
            هذه الصفحة غير متاحة لحساب عميل إيجار الرحلات.
          </div>
        </Route>
      </Switch>
    );
  }
  return (
    <Switch>
      <Route path="/" component={RoleHome} />

      {/* Keep old bookmarks working while the dashboard now lives on the homepage. */}
      <Route path="/dashboard">
        <Redirect to="/" replace />
      </Route>

      {/* Customer — no perm guard (role-based only) */}
      <Route path="/rental-trip-portal" component={RentalTripCustomerRoute} />
      <Route path="/order/:id" component={PlaceOrder} />
      <Route path="/my-orders/:id" component={OrderDetail} />
      <Route path="/my-orders" component={MyOrders} />
      <Route path="/external-rentals" component={ExternalRentals} />
      <Route path="/profile" component={Profile} />
      <Route path="/cart" component={Cart} />
      <Route path="/account" component={Account} />

      {/* Employee portal — open to all logged-in staff */}
      <Route path="/employee-portal" component={EmployeePortal} />
      <Route path="/chat" component={InternalChatRoute} />

      {/* Operations */}
      <Route path="/reviewer"   component={guard("ops_reviewer",   ReviewerOrders)} />
      <Route path="/supervisor" component={guard("ops_supervisor",  SupervisorOrders, [], ["fleet_vehicles_edit"])} />
      <Route path="/warehouse"  component={guard("ops_warehouse",   WarehouseOrders)} />

      {/* Portals */}
      <Route path="/driver" component={guard("portal_driver", BulkerDriverPage)} />
      <Route path="/rep"    component={guard("portal_rep",    RepOrders)} />

      {/* Stock */}
      <Route path="/warehouses"         component={guard("stock_warehouses",        WarehousesPage, [], ["stock_warehouse_manager"])} />
      <Route path="/warehouse-manager"  component={guard("stock_warehouse_manager", WarehouseManagerDashboard)} />
      <Route path="/products-admin"     component={guard("stock_products",          ProductsAdmin)} />
      <Route path="/tariffs"            component={guard("stock_tariffs",           TariffsPage)} />

      {/* Fleet & workshop */}
      <Route path="/drivers-manage"    component={guard("fleet_drivers", DriversPage, ["supervisor"])} />
      <Route path="/workshop-manager"   component={guard("fleet_workshop",          WorkshopManagerPage)} />
      <Route path="/workshop-inventory" component={guard("fleet_workshop_inventory", WorkshopInventoryPage, [], ["fleet_workshop"])} />
      <Route path="/purchasing"         component={guard("fleet_purchasing",         PurchasingPage)} />
      <Route path="/reimbursement"      component={guard("fleet_reimbursement",      ReimbursementPage, ["accountant", "bank_officer"])} />
      <Route path="/vehicle-analytics" component={guard("fleet_vehicle_analytics", VehicleDashboardAdmin)} />

      {/* HR */}
      <Route path="/employees"  component={guard("hr_employees", EmployeesPage)} />
      <Route path="/hr-requests" component={guard("hr_requests", HRRequestsPage)} />
      <Route path="/approvals"   component={guard("hr_approvals", AdminApprovalsPage)} />
      <Route path="/users"       component={guard("users_manage", UsersPage)} />
      <Route path="/rep-targets" component={guard("users_rep_targets", RepTargetsPage, [], ["users_manage"])} />

      {/* Reports & Finance */}
      <Route path="/reports" component={guard("reports_main", ReportsPage)} />
      <Route path="/finance"  component={guard("finance_main", FinancePage)} />

      {/* Legal & Compliance */}
      <Route path="/legal"              component={guard("legal_library",  LegalPage)} />
      <Route path="/system-logs"        component={guard("legal_logs", SystemLogsPage)} />
      <Route path="/ratings-analytics"  component={guard("legal_ratings",  RatingsAnalyticsPage)} />
      <Route path="/loading-points"     component={guard("legal_loading",  LoadingPointsPage)} />

      {/* Settings */}
      <Route path="/company-settings" component={guard("settings_company", CompanySettingsPage)} />
      <Route path="/system-guide"     component={guard("settings_system_guide", SystemGuidePage, [], ["settings_company"])} />
      <Route path="/excel-import"     component={guard("settings_excel_import", ExcelImportPage, [], ["settings_system"])} />
      <Route path="/admin"            component={guard("settings_system",  AdminDashboard)} />
      <Route path="/backup-restore-log" component={guard("settings_system", BackupRestoreLogPage)} />
      <Route path="/notifications"    component={guard("settings_notifs",  Notifications)} />

      {/* Vehicle types & cargo routing — admin */}
      <Route path="/vehicle-types-admin" component={guard("fleet_vehicle_types", VehicleTypeDefsPage)} />

      {/* Fleet manage — redirect to /supervisor (merged tab) */}
      <Route path="/fleet-manage" component={guard("fleet_vehicles_edit", FleetManageRedirect)} />

      {/* Bulker movement supervisor */}
      <Route path="/bulker-supervisor" component={guard("ops_bulker", BulkerSupervisorPage)} />
      <Route path="/bulker-driver" component={guard("portal_bulker_driver", BulkerDriverPage)} />

      {/* Crane & heavy equipment traffic supervisor */}
      <Route path="/crane-supervisor" component={guard("ops_crane_supervisor", CraneSupervisorPage)} />

      {/* Driver document requests — supervisor + admin */}
      <Route path="/driver-doc-requests" component={guard("ops_doc_requests", DriverDocRequestsPage, ["supervisor", "admin"])} />

      {/* Internal requests — warehouse manager */}
      <Route path="/internal-requests" component={guard("stock_internal_req", InternalRequestsPage, ["warehouse_manager"])} />

      {/* مسؤل الفسوحات */}
      <Route path="/fsohat" component={guard("ops_fsohat", FsohatPage, ["fsohat"])} />

      {/* قسم النقليات */}
      <Route path="/transportation" component={guard("fleet_transportation", TransportationPage, ["admin", "supervisor"])} />

      {/* MKGH Data Analysis */}
      <Route path="/mkgh-analysis" component={guard("fleet_mkgh_analysis", MkghAnalysisPage, ["admin"])} />

      {/* الردود / رحلات السيارات */}
      <Route path="/trips" component={guard("fleet_trips", Trips, ["admin", "supervisor", "reviewer"])} />

      <Route>
        <div className="flex items-center justify-center h-64 text-muted-foreground">الصفحة غير موجودة</div>
      </Route>
    </Switch>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const { t, dir } = useLang();
  const [loc, navigate] = useLocation();
  const [showAiChat, setShowAiChat] = useState<boolean>(true);

  // Fetch initial setting once on mount
  useEffect(() => {
    fetch("/api/app-settings")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setShowAiChat(!!d.show_ai_chat); })
      .catch(() => {});
  }, []);

  // React to live toggle from CompanySettingsPage (dispatches StorageEvent)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "show_ai_chat") setShowAiChat(e.newValue === "1");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  // After login, redirect from /login to returnTo or home (must be before any early returns)
  useEffect(() => {
    if (user && loc === "/login") {
      const returnTo = new URLSearchParams(window.location.search).get("returnTo") || "/";
      navigate(returnTo);
    }
  }, [user, loc, navigate]);

  // Developer dashboard — standalone, no auth required
  if (loc === "/mkgh") return <DevDashboard />;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir={dir}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (loc === "/employee-portal") return <EmployeePortal />;
    // Allow guests to view product order pages — PlaceOrder shows GuestAuthModal
    if (/^\/order\//.test(loc)) {
      return (
        <div className="min-h-screen bg-background" dir="rtl">
          <AppRoutes />
        </div>
      );
    }
    return <Login />;
  }

  const fullscreen = user.role === "rental_trip_customer" && (loc === "/" || loc === "/rental-trip-portal")
    || /^\/(order\/|my-orders\/)/.test(loc) && user.role === "customer";

  if (fullscreen) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <RememberedScroll />
        <AppRoutes />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-x-hidden bg-background" dir="rtl">
      <Sidebar />
      <main data-page-scroll className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
        <RememberedScroll />
        {user.role === "customer" ? (
          <AppRoutes />
        ) : (
          <div className="p-4 md:p-6 w-full">
            <AppRoutes />
          </div>
        )}
      </main>
      {showAiChat && <AIChatWidget />}
    </div>
  );
}

function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <QueryClientProvider client={queryClient}>
      <MutationSyncMonitor>
        <ThemeProvider>
          <LangProvider>
            <AuthProvider>
              <CartProvider>
                <OfflineBanner />
                <WouterRouter base={base}>
                  <AuthGate />
                </WouterRouter>
              </CartProvider>
            </AuthProvider>
          </LangProvider>
        </ThemeProvider>
      </MutationSyncMonitor>
    </QueryClientProvider>
  );
}

export default App;
