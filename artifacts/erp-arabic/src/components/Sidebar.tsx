import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, FileText, Truck, Wallet, Users, CalendarDays,
  ShoppingCart, Car, Wrench, ChevronLeft, Menu, X
} from "lucide-react";
import { useState } from "react";

const NAV = [
  { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/invoices", label: "الفواتير", icon: FileText },
  { href: "/trips", label: "الردود", icon: Truck },
  { href: "/fleet-expenses", label: "مصاريف الأسطول", icon: Wallet },
  { href: "/petty-cash", label: "العهدة", icon: Wallet },
  { href: "/orders", label: "الطلبات", icon: ShoppingCart },
  { href: "/vehicles", label: "المركبات", icon: Car },
  { href: "/workshop", label: "الورشة", icon: Wrench },
  { href: "/employees", label: "الموظفون", icon: Users },
  { href: "/leaves", label: "طلبات الإجازة", icon: CalendarDays },
];

export default function Sidebar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const SidebarContent = () => (
    <nav className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-white font-bold text-sm">ERP</span>
        </div>
        <div>
          <div className="font-bold text-sm text-foreground">نظام الإدارة</div>
          <div className="text-xs text-muted-foreground">الإصدار 1.0</div>
        </div>
        <button onClick={() => setOpen(false)} className="md:hidden mr-auto p-1 rounded hover:bg-muted">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? location === "/" : location.startsWith(href);
          return (
            <Link key={href} href={href} onClick={() => setOpen(false)}>
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                active
                  ? "bg-primary text-white font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
                <Icon size={18} />
                <span className="text-sm">{label}</span>
                {active && <ChevronLeft size={14} className="mr-auto opacity-70" />}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="px-4 py-4 border-t border-border">
        <div className="text-xs text-muted-foreground text-center">
          {new Date().toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>
    </nav>
  );

  return (
    <>
      <button
        className="md:hidden fixed top-3 right-3 z-50 p-2 bg-primary text-white rounded-lg shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
      )}

      <aside className={`fixed md:relative inset-y-0 right-0 z-40 w-60 bg-card border-l border-border shadow-sm flex-shrink-0
        flex flex-col transition-transform duration-200
        ${open ? "translate-x-0" : "translate-x-full md:translate-x-0"}`}>
        <SidebarContent />
      </aside>
    </>
  );
}
