import { useCallback, useEffect, useState } from "react";
import {
  Building2, Car, FileText, PackageCheck, RefreshCw, Wrench,
} from "lucide-react";
import type { BranchDashboardResponse } from "@workspace/api-client-react";
import MainDashboard from "@/pages/admin/MainDashboard";

function formatNumber(value: number): string {
  return value.toLocaleString("ar-SA");
}

function formatAmount(value: number): string {
  return `${value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

export default function BranchDashboard({
  branchId,
  branchName,
  token,
}: {
  branchId: number | null;
  branchName?: string;
  token: string | null;
}) {
  const [data, setData] = useState<BranchDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false, signal?: AbortSignal) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const query = branchId === null ? "" : `?branchId=${encodeURIComponent(branchId)}`;
      const response = await fetch(`/api/branch-dashboard${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "تعذر تحميل مؤشرات الفرع");
      setData(result as BranchDashboardResponse);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "تعذر تحميل مؤشرات الفرع");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [branchId, token]);

  useEffect(() => {
    const controller = new AbortController();
    void load(false, controller.signal);
    return () => controller.abort();
  }, [load]);

  const isAllBranches = branchId === null;
  const displayName = data?.branch?.entity_name || branchName || "الفرع";
  const metrics = data ? [
    {
      label: "السيارات المسجلة",
      value: formatNumber(data.vehicles.total),
      sub: `متاحة ${formatNumber(data.vehicles.available)} · مشغولة ${formatNumber(data.vehicles.busy)} · صيانة ${formatNumber(data.vehicles.maintenance)} · متعطلة ${formatNumber(data.vehicles.broken)}`,
      icon: Car,
      color: "bg-orange-500",
    },
    {
      label: "سجلات الصيانة",
      value: formatNumber(data.maintenance.count),
      sub: `إجمالي المبالغ: ${formatAmount(data.maintenance.amount)}`,
      icon: Wrench,
      color: "bg-amber-600",
    },
    {
      label: "فواتير المشتريات",
      value: formatNumber(data.purchase_invoices.count),
      sub: `إجمالي شامل الضريبة: ${formatAmount(data.purchase_invoices.amount)}`,
      icon: FileText,
      color: "bg-blue-600",
    },
    {
      label: "كشوف الاستعاضة غير الملغاة",
      value: formatNumber(data.reimbursement_claims.count),
      sub: `إجمالي شامل الضريبة: ${formatAmount(data.reimbursement_claims.amount)}`,
      icon: PackageCheck,
      color: "bg-emerald-600",
    },
  ] : [];

  return (
    <div className="space-y-5" dir="rtl">
      {isAllBranches && <MainDashboard />}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${isAllBranches ? "bg-[#103c68]" : "bg-[#103c68]/10"}`}>
            <Building2 size={20} className={isAllBranches ? "text-white" : "text-[#103c68]"} />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-gray-800">
              {isAllBranches ? "بيانات الفروع المسجلة" : `مؤشرات فرع ${displayName}`}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {isAllBranches
                ? "مجموع البيانات المرتبطة مباشرةً بالفروع النشطة"
                : `البيانات المرتبطة مباشرةً بفرع ${displayName}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
            className="me-auto inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            تحديث
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map(item => (
              <div key={item} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ label, value, sub, icon: Icon, color }) => (
              <article key={label} className="flex min-h-28 items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${color}`}>
                  <Icon size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-black leading-tight text-gray-900">{value}</div>
                  <h3 className="mt-1 text-sm font-semibold text-gray-700">{label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">{sub}</p>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          الطلبات والرحلات والموظفون غير موزعين على الفروع في هذه المؤشرات؛ ستتم إضافتهم بعد اعتماد مصدر موثوق لربطهم بكل فرع.
        </p>
      </section>
    </div>
  );
}