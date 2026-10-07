import { useState, useEffect, useMemo } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import { FileText, CheckCircle, Clock, X, Search, RefreshCw, Filter, User } from "lucide-react";

type DocRequest = {
  id: number;
  driver_id: number | null;
  driver_name: string | null;
  driver_phone: string | null;
  request_type: string;
  request_label: string;
  date: string | null;
  loading_lat: number | null;
  loading_lng: number | null;
  loading_location_name: string | null;
  cargo_type: string | null;
  status: string;
  created_at: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:   { label: "قيد الانتظار", color: "bg-amber-100 text-amber-700 border-amber-200" },
  done:      { label: "منجز",        color: "bg-green-100 text-green-700 border-green-200" },
  cancelled: { label: "ملغى",        color: "bg-red-100 text-red-600 border-red-200" },
};

export default function DriverDocRequestsPage() {
  const [requests, setRequests] = useState<DocRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const [filterStatus, setFilterStatus] = useRememberedState("driver-doc-status-filter", "" as "" | "pending" | "done" | "cancelled");
  const [filterDriver, setFilterDriver] = useRememberedState("driver-doc-driver-filter", "");
  const [filterDate,   setFilterDate]   = useRememberedState("driver-doc-date-filter", "");

  const load = () => {
    setLoading(true);
    fetch("/api/driver-doc-requests")
      .then(r => r.json())
      .then(data => setRequests(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const changeStatus = async (id: number, status: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/driver-doc-requests/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert((body as { error?: string }).error || "حدث خطأ أثناء التحديث");
        return;
      }
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch {
      alert("تعذّر الاتصال بالخادم");
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = useMemo(() => {
    return requests.filter(r => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterDriver) {
        const q = filterDriver.toLowerCase();
        const name  = (r.driver_name  || "").toLowerCase();
        const phone = (r.driver_phone || "").toLowerCase();
        if (!name.includes(q) && !phone.includes(q)) return false;
      }
      if (filterDate && !(r.date || r.created_at || "").startsWith(filterDate)) return false;
      return true;
    });
  }, [requests, filterStatus, filterDriver, filterDate]);

  const pendingCount = requests.filter(r => r.status === "pending").length;

  const uniqueDrivers = useMemo(() => {
    const seen = new Set<string>();
    return requests.filter(r => {
      const key = r.driver_phone || r.driver_name || "";
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [requests]);

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <FileText size={22} className="text-blue-600" />
            طلبات المستندات
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">طلبات مستندات السائقين — مراجعة وتحديث الحالة</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50 transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          تحديث
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "إجمالي الطلبات", value: requests.length,                                  color: "bg-blue-50 text-blue-700" },
          { label: "قيد الانتظار",   value: pendingCount,                                      color: "bg-amber-50 text-amber-700" },
          { label: "منجز",           value: requests.filter(r => r.status === "done").length,  color: "bg-green-50 text-green-700" },
        ].map(s => (
          <div key={s.label} className={`${s.color} rounded-2xl px-4 py-3 text-center`}>
            <div className="text-2xl font-black">{s.value}</div>
            <div className="text-xs font-semibold mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-600">
          <Filter size={14} />فلترة
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">الحالة</label>
            <select value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as "" | "pending" | "done" | "cancelled")}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
              <option value="">الكل</option>
              <option value="pending">قيد الانتظار</option>
              <option value="done">منجز</option>
              <option value="cancelled">ملغى</option>
            </select>
          </div>

          {/* Driver */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">السائق</label>
            <div className="relative">
              <Search size={13} className="absolute top-1/2 -translate-y-1/2 end-3 text-gray-400 pointer-events-none" />
              <input
                list="driver-list"
                value={filterDriver}
                onChange={e => setFilterDriver(e.target.value)}
                placeholder="اسم أو رقم جوال"
                className="w-full px-3 pe-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
              <datalist id="driver-list">
                {uniqueDrivers.map(d => (
                  <option key={d.driver_phone || d.driver_name} value={d.driver_name || d.driver_phone || ""}>
                    {d.driver_name} — {d.driver_phone}
                  </option>
                ))}
              </datalist>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">التاريخ</label>
            <input type="date" value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
          </div>
        </div>

        {(filterStatus || filterDriver || filterDate) && (
          <button
            onClick={() => { setFilterStatus(""); setFilterDriver(""); setFilterDate(""); }}
            className="mt-3 flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors">
            <X size={12} />مسح الفلاتر
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-600" />
            <h2 className="font-bold text-gray-800">قائمة الطلبات</h2>
            {filtered.length !== requests.length && (
              <span className="text-xs text-gray-400">({filtered.length} من {requests.length})</span>
            )}
          </div>
          {pendingCount > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              {pendingCount} بانتظار المعالجة
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-10 text-center">
            <RefreshCw size={28} className="mx-auto animate-spin text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">جاري التحميل...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <FileText size={32} className="mx-auto text-gray-200 mb-3" />
            <p className="text-sm text-gray-400">لا توجد طلبات مستندات مطابقة</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map(req => {
              const sc = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
              const isPending = req.status === "pending";
              return (
                <div key={req.id} className={`px-5 py-4 hover:bg-gray-50 transition-colors ${isPending ? "border-r-2 border-amber-400" : ""}`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Request label + status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900 text-sm">{req.request_label}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${sc.color}`}>
                          {sc.label}
                        </span>
                        {req.request_type && req.request_type !== req.request_label && (
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{req.request_type}</span>
                        )}
                      </div>

                      {/* Driver info */}
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <User size={13} className="text-gray-400 flex-shrink-0" />
                        <span className="font-medium">{req.driver_name || "—"}</span>
                        {req.driver_phone && (
                          <a href={`tel:${req.driver_phone}`}
                            className="font-mono text-xs text-blue-600 hover:underline" dir="ltr">
                            {req.driver_phone}
                          </a>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                        {req.date && <span>📅 {req.date}</span>}
                        {req.cargo_type && <span>📦 {req.cargo_type}</span>}
                        {req.loading_location_name && <span>📍 {req.loading_location_name}</span>}
                        <span className="text-gray-300">•</span>
                        <span>طُلب في: {req.created_at?.slice(0, 16).replace("T", " ")}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isPending && (
                        <button
                          onClick={() => changeStatus(req.id, "done")}
                          disabled={updatingId === req.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap">
                          <CheckCircle size={13} />
                          {updatingId === req.id ? "..." : "تحديد كـ منجز"}
                        </button>
                      )}
                      {req.status === "done" && (
                        <button
                          onClick={() => changeStatus(req.id, "pending")}
                          disabled={updatingId === req.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 whitespace-nowrap">
                          <Clock size={13} />إعادة فتح
                        </button>
                      )}
                      {isPending && (
                        <button
                          onClick={() => changeStatus(req.id, "cancelled")}
                          disabled={updatingId === req.id}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
