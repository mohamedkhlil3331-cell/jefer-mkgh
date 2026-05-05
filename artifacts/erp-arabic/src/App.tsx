import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sidebar from "@/components/Sidebar";
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

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/invoices" component={Invoices} />
      <Route path="/trips" component={Trips} />
      <Route path="/fleet-expenses" component={FleetExpenses} />
      <Route path="/petty-cash" component={PettyCash} />
      <Route path="/orders" component={Orders} />
      <Route path="/vehicles" component={Vehicles} />
      <Route path="/workshop" component={Workshop} />
      <Route path="/employees" component={Employees} />
      <Route path="/leaves" component={Leaves} />
      <Route>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          الصفحة غير موجودة
        </div>
      </Route>
    </Switch>
  );
}

function App() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={base}>
        <div className="flex h-screen overflow-hidden bg-background" dir="rtl">
          <Sidebar />
          <main className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-6 max-w-screen-2xl">
              <AppRoutes />
            </div>
          </main>
        </div>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
