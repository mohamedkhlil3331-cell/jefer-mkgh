import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Sidebar from "@/components/Sidebar";
import Login from "@/pages/Login";
import Notifications from "@/pages/Notifications";

// Customer pages
import Catalog from "@/pages/customer/Catalog";
import PlaceOrder from "@/pages/customer/PlaceOrder";
import MyOrders from "@/pages/customer/MyOrders";
import OrderDetail from "@/pages/customer/OrderDetail";
import Account from "@/pages/customer/Account";

// Role pages
import ReviewerOrders from "@/pages/reviewer/ReviewerOrders";
import SupervisorOrders from "@/pages/supervisor/SupervisorOrders";
import WarehouseOrders from "@/pages/warehouse/WarehouseOrders";
import DriverOrders from "@/pages/driver/DriverOrders";
import RepOrders from "@/pages/rep/RepOrders";
import AdminDashboard from "@/pages/admin/AdminDashboard";

// Legacy ERP pages
import Dashboard from "@/pages/Dashboard";
import Invoices from "@/pages/Invoices";
import Trips from "@/pages/Trips";
import FleetExpenses from "@/pages/FleetExpenses";
import PettyCash from "@/pages/PettyCash";
import Orders from "@/pages/Orders";
import Vehicles from "@/pages/Vehicles";
import Workshop from "@/pages/Workshop";
import Employees from "@/pages/Employees";
import Leaves from "@/pages/Leaves";

const queryClient = new QueryClient();

function RoleHome() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "customer") return <Catalog />;
  if (user.role === "reviewer") return <ReviewerOrders />;
  if (user.role === "supervisor") return <SupervisorOrders />;
  if (user.role === "warehouse") return <WarehouseOrders />;
  if (user.role === "driver") return <DriverOrders />;
  if (user.role === "rep") return <RepOrders />;
  if (user.role === "admin") return <AdminDashboard />;
  return <Catalog />;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={RoleHome} />

      {/* Customer */}
      <Route path="/order/:id" component={PlaceOrder} />
      <Route path="/my-orders/:id" component={OrderDetail} />
      <Route path="/my-orders" component={MyOrders} />
      <Route path="/account" component={Account} />

      {/* Role dashboards */}
      <Route path="/reviewer" component={ReviewerOrders} />
      <Route path="/supervisor" component={SupervisorOrders} />
      <Route path="/warehouse" component={WarehouseOrders} />
      <Route path="/driver" component={DriverOrders} />
      <Route path="/rep" component={RepOrders} />
      <Route path="/admin" component={AdminDashboard} />

      {/* Shared */}
      <Route path="/notifications" component={Notifications} />

      {/* Legacy ERP (admin only) */}
      <Route path="/erp" component={Dashboard} />
      <Route path="/erp/invoices" component={Invoices} />
      <Route path="/erp/trips" component={Trips} />
      <Route path="/erp/fleet-expenses" component={FleetExpenses} />
      <Route path="/erp/petty-cash" component={PettyCash} />
      <Route path="/erp/orders" component={Orders} />
      <Route path="/erp/vehicles" component={Vehicles} />
      <Route path="/erp/workshop" component={Workshop} />
      <Route path="/erp/employees" component={Employees} />
      <Route path="/erp/leaves" component={Leaves} />

      <Route>
        <div className="flex items-center justify-center h-64 text-muted-foreground">الصفحة غير موجودة</div>
      </Route>
    </Switch>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const [loc] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  // Full-screen for customer product/order pages (no sidebar chrome)
  const fullscreen = /^\/(order\/|my-orders\/)/.test(loc) && user.role === "customer";

  if (fullscreen) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <AppRoutes />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background" dir="rtl">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {user.role === "customer" ? (
          <AppRoutes />
        ) : (
          <div className="p-4 md:p-6 max-w-screen-xl">
            <AppRoutes />
          </div>
        )}
      </main>
    </div>
  );
}

function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WouterRouter base={base}>
          <AuthGate />
        </WouterRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
