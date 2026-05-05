import { useEffect, useState } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import StatCard from "@/components/StatCard";
import PageHeader from "@/components/PageHeader";
import { Car, Truck, Wrench, DollarSign, Users, AlertTriangle } from "lucide-react";

interface DashboardData {
  vehicles: { status: string; c: number }[];
  orders: { status: string; c: number }[];
  workshop: { c: number };
  tripRev: { total: number | null };
  expenses: { total: number | null };
  employees: { c: number };
  expiring: { name: string; iqama_end: string; work_permit_end: string; driver_license_end: string }[];
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<DashboardData>("/dashboard").then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const vMap = Object.fromEntries((data?.vehicles ?? []).map(v => [v.status, v.c]));
  const oMap = Object.fromEntries((data?.orders ?? []).map(o => [o.status, o.c]));
  const totalVehicles = Object.values(vMap).reduce((a, b) => a + b, 0);

  return (
    <div>
      <PageHeader title="لوحة التحكم" subtitle="نظرة عامة على العمليات" />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="إجمالي المركبات" value={totalVehicles} icon={Car} color="blue" />
        <StatCard label="مركبات متاحة" value={vMap.available ?? 0} icon={Car} color="green" />
        <StatCard label="في الصيانة" value={vMap.maintenance ?? 0} icon={Wrench} color="yellow" />
        <StatCard label="طلبات الورشة" value={data?.workshop.c ?? 0} icon={Wrench} color="red" />
        <StatCard label="إيرادات الردود" value={formatCurrency(data?.tripRev.total)} icon={Truck} color="green" />
        <StatCard label="مصاريف الأسطول" value={formatCurrency(data?.expenses.total)} icon={DollarSign} color="yellow" />
        <StatCard label="صافي" value={formatCurrency((data?.tripRev.total ?? 0) - (data?.expenses.total ?? 0))} icon={DollarSign} color="blue" />
        <StatCard label="موظفون نشطون" value={data?.employees.c ?? 0} icon={Users} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-bold text-base mb-4 flex items-center gap-2"><Car size={18} className="text-primary" />حالة المركبات</h2>
          <div className="space-y-3">
            {[
              { key: "available", label: "متاح", color: "bg-green-500" },
              { key: "busy", label: "مشغول", color: "bg-blue-500" },
              { key: "maintenance", label: "صيانة", color: "bg-yellow-500" },
              { key: "broken", label: "معطل", color: "bg-red-500" },
            ].map(({ key, label, color }) => {
              const count = vMap[key] ?? 0;
              const pct = totalVehicles ? Math.round((count / totalVehicles) * 100) : 0;
              return (
                <div key={key}>
                  <div className="flex justify-between text-sm mb-1"><span>{label}</span><span className="font-medium">{count}</span></div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-bold text-base mb-4 flex items-center gap-2"><Truck size={18} className="text-primary" />حالة الطلبات</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "new", label: "جديد", color: "bg-blue-100 text-blue-800" },
              { key: "in_progress", label: "جاري", color: "bg-purple-100 text-purple-800" },
              { key: "delivered", label: "تم التسليم", color: "bg-green-100 text-green-800" },
              { key: "cancelled", label: "ملغي", color: "bg-gray-100 text-gray-800" },
            ].map(({ key, label, color }) => (
              <div key={key} className={`${color} rounded-lg p-3 text-center`}>
                <div className="text-2xl font-bold">{oMap[key] ?? 0}</div>
                <div className="text-xs mt-1">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {data?.expiring && data.expiring.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
          <h2 className="font-bold text-base mb-3 flex items-center gap-2 text-yellow-800">
            <AlertTriangle size={18} />وثائق تنتهي قريباً (خلال 60 يوماً)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-right text-yellow-700">
                  <th className="pb-2 font-semibold">الاسم</th>
                  <th className="pb-2 font-semibold">انتهاء الإقامة</th>
                  <th className="pb-2 font-semibold">انتهاء تصريح العمل</th>
                  <th className="pb-2 font-semibold">انتهاء رخصة القيادة</th>
                </tr>
              </thead>
              <tbody>
                {data.expiring.map((e, i) => (
                  <tr key={i} className="border-t border-yellow-200">
                    <td className="py-2 font-medium">{e.name}</td>
                    <td className="py-2">{e.iqama_end || "—"}</td>
                    <td className="py-2">{e.work_permit_end || "—"}</td>
                    <td className="py-2">{e.driver_license_end || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
