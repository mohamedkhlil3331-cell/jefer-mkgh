import { useState } from "react";
import { Users, Building2 } from "lucide-react";
import Catalog from "@/pages/customer/Catalog";
import ReviewerOrders from "@/pages/reviewer/ReviewerOrders";
import SupervisorOrders from "@/pages/supervisor/SupervisorOrders";
import WarehouseOrders from "@/pages/warehouse/WarehouseOrders";
import RepOrders from "@/pages/rep/RepOrders";
import { useAuth } from "@/context/AuthContext";

function InternalHome() {
  const { user } = useAuth();
  if (user?.role === "reviewer") return <ReviewerOrders />;
  if (user?.role === "supervisor") return <SupervisorOrders />;
  if (user?.role === "warehouse") return <WarehouseOrders />;
  if (user?.role === "rep") return <RepOrders />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[
        { label: "إجمالي الطلبات اليوم", val: "—", color: "bg-blue-50 border-blue-200", text: "text-blue-700" },
        { label: "السيارات المتاحة", val: "—", color: "bg-green-50 border-green-200", text: "text-green-700" },
        { label: "طلبات معلّقة", val: "—", color: "bg-yellow-50 border-yellow-200", text: "text-yellow-700" },
      ].map((c, i) => (
        <div key={i} className={`border rounded-xl p-5 ${c.color}`}>
          <div className={`text-2xl font-bold ${c.text}`}>{c.val}</div>
          <div className="text-sm text-gray-500 mt-1">{c.label}</div>
        </div>
      ))}
      <p className="col-span-full text-sm text-gray-400 text-center py-4">سجّل دخولك بحساب دور محدد لرؤية مهامك</p>
    </div>
  );
}

export default function MainHome() {
  const [tab, setTab] = useState<"customer" | "internal">("customer");

  return (
    <div className="space-y-6" dir="rtl">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setTab("customer")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            tab === "customer" ? "bg-white text-blue-700 shadow-sm font-semibold" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Users size={16} />طلبات العملاء
        </button>
        <button
          onClick={() => setTab("internal")}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
            tab === "internal" ? "bg-white text-blue-700 shadow-sm font-semibold" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Building2 size={16} />داخل الشركة
        </button>
      </div>

      {tab === "customer" ? <Catalog /> : <InternalHome />}
    </div>
  );
}
