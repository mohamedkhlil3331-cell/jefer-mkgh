import { useEffect, useState } from "react";
import { RefreshCw, Plus, Edit2, Trash2, Phone, Truck, Search, X, Save, FileText, Shield } from "lucide-react";

/* ── colour tokens matching attached design ─────────────────────────────────── */
const P  = "#103c68";   // primary dark-blue
const S  = "#0eb5cb";   // secondary cyan
const BG = "#f4f7f6";   // page background

interface Driver {
  id: number; vehicle_plate?: string; driver_name: string; phone?: string;
  branch?: string; email?: string; license_url?: string;
  operation_card_url?: string; driver_card_url?: string;
  insurance_url?: string; status?: string; notes?: string; synced_at?: string;
}

interface Stats {
  total: number; active: number; onTrip: number; noDoc: number;
  recentOrders: { driver_name: string; vehicle_plate: string; order_number: string; delivery_location: string; stage: string; created_at: string }[];
}

const STATUS_STYLE: Record<string, string> = {
  "نشط":     "bg-green-100 text-green-700",
  "في رحلة": "bg-blue-100  text-blue-700",
  "إجازة":   "bg-yellow-100 text-yellow-700",
  "موقوف":   "bg-red-100   text-red-700",
};
const STATUS_OPTIONS = ["نشط", "في رحلة", "إجازة", "موقوف"];

const EMPTY: Partial<Driver> = { status: "نشط", branch: "النقليات" };

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [search,  setSearch]  = useState("");
  const [filterStatus, setFilterStatus] = useState("الكل");
  const [modal, setModal] = useState<{ open: boolean; d: Partial<Driver> }>({ open: false, d: {} });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/drivers").then(r => r.json()),
      fetch("/api/drivers/stats").then(r => r.json()),
    ]).then(([drvs, st]) => { setDrivers(drvs); setStats(st); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true); setSyncMsg("");
    const r = await fetch("/api/drivers/sync", { method: "POST" });
    const d = await r.json();
    setSyncMsg(d.message || d.error);
    if (d.imported) load();
    setSyncing(false);
  };

  const save = async () => {
    setSaving(true);
    const { id, ...body } = modal.d;
    await fetch(id ? `/api/drivers/${id}` : "/api/drivers", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false); setModal({ open: false, d: {} }); load();
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا السائق؟")) return;
    await fetch(`/api/drivers/${id}`, { method: "DELETE" }); load();
  };

  const filtered = drivers.filter(d => {
    const matchSt = filterStatus === "الكل" || d.status === filterStatus;
    const q = search.toLowerCase();
    return matchSt && (!q || d.driver_name.toLowerCase().includes(q) || (d.vehicle_plate||"").includes(q) || (d.phone||"").includes(q));
  });

  const kpis = [
    { label: "إجمالي السائقين", val: stats?.total ?? 0,  icon: "👥", color: S,        border: S },
    { label: "السائقون النشطون", val: stats?.active ?? 0, icon: "✅", color: "#16a34a", border: "#16a34a" },
    { label: "في رحلة الآن",   val: stats?.onTrip ?? 0, icon: "🚛", color: "#ea580c", border: "#ea580c" },
    { label: "إجمالي السيارات", val: drivers.filter(d => d.vehicle_plate).length, icon: "🚚", color: P, border: P },
  ];

  return (
    <div dir="rtl" style={{ backgroundColor: BG }} className="min-h-screen p-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm px-6 py-4 flex items-center justify-between"
           style={{ borderBottom: `3px solid ${S}` }}>
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: P }}>أسطول السائقين</h1>
          <p className="text-sm mt-0.5" style={{ color: S }}>
            {drivers.length} سائق مسجّل
            {drivers[0]?.synced_at ? ` — آخر تحديث: ${drivers[0].synced_at.slice(0,16).replace("T"," ")}` : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => setModal({ open: true, d: { ...EMPTY } })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: P }}>
            <Plus size={14} />إضافة سائق
          </button>
          <button onClick={sync} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: S }}>
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "جاري المزامنة..." : "مزامنة من جوجل شيت"}
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${syncMsg.includes("فشل") || syncMsg.includes("خطأ") ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`}>
          {syncMsg}
        </div>
      )}

      {/* ── KPI Cards ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md transition-shadow"
               style={{ borderBottom: `4px solid ${k.border}` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-500">{k.label}</span>
              <div className="text-2xl p-2 rounded-lg" style={{ backgroundColor: k.border + "15" }}>
                {k.icon}
              </div>
            </div>
            <div className="text-3xl font-extrabold" style={{ color: P }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* ── Body: table + activity ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Drivers table */}
        <div className="bg-white rounded-xl shadow-sm lg:col-span-2 overflow-hidden">
          {/* Table header / filters */}
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <h3 className="text-base font-extrabold" style={{ color: P, borderRight: `4px solid ${S}`, paddingRight: "10px" }}>
              قائمة السائقين
            </h3>
            <div className="flex gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="بحث..."
                  className="border border-gray-200 rounded-lg pr-8 pl-3 py-1.5 text-sm focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": S } as React.CSSProperties} />
              </div>
              {/* Status filter */}
              {["الكل", ...STATUS_OPTIONS].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${filterStatus === s ? "text-white" : "bg-white text-gray-500 border-gray-200"}`}
                  style={filterStatus === s ? { backgroundColor: S, borderColor: S } : {}}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-9 h-9 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${S} transparent ${S} ${S}` }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <div className="text-5xl mb-3">🚛</div>
              <p className="font-medium">لا يوجد سائقون بعد</p>
              <button onClick={sync} className="mt-4 px-5 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: S }}>
                مزامنة من جوجل شيت
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: P + "08" }}>
                  <tr>
                    {["السيارة", "اسم السائق", "الجوال", "الفرع", "الوثائق", "الحالة", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-bold" style={{ color: P }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50/60 transition-colors">
                      {/* Vehicle plate */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                               style={{ backgroundColor: S }}>
                            <Truck size={14} />
                          </div>
                          <span className="font-mono font-bold text-gray-700">{d.vehicle_plate || "—"}</span>
                        </div>
                      </td>
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-extrabold flex-shrink-0"
                               style={{ backgroundColor: P }}>
                            {d.driver_name[0]}
                          </div>
                          <span className="font-semibold text-gray-800">{d.driver_name}</span>
                        </div>
                      </td>
                      {/* Phone */}
                      <td className="px-4 py-3">
                        {d.phone ? (
                          <a href={`tel:${d.phone}`} className="flex items-center gap-1 text-xs" style={{ color: S }}>
                            <Phone size={12} />{d.phone}
                          </a>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      {/* Branch */}
                      <td className="px-4 py-3 text-xs text-gray-500">{d.branch || "—"}</td>
                      {/* Documents */}
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {d.license_url && (
                            <span title="الرخصة" className="w-6 h-6 rounded flex items-center justify-center text-white text-xs"
                                  style={{ backgroundColor: "#16a34a" }}>
                              <FileText size={11} />
                            </span>
                          )}
                          {d.driver_card_url && (
                            <span title="كرت السائق" className="w-6 h-6 rounded flex items-center justify-center text-white text-xs"
                                  style={{ backgroundColor: S }}>
                              <FileText size={11} />
                            </span>
                          )}
                          {d.insurance_url && (
                            <span title="التأمين" className="w-6 h-6 rounded flex items-center justify-center text-white text-xs"
                                  style={{ backgroundColor: "#ea580c" }}>
                              <Shield size={11} />
                            </span>
                          )}
                          {!d.license_url && !d.driver_card_url && !d.insurance_url && (
                            <span className="text-gray-300 text-xs">لا وثائق</span>
                          )}
                        </div>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_STYLE[d.status || "نشط"] || STATUS_STYLE["نشط"]}`}>
                          {d.status || "نشط"}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setModal({ open: true, d: { ...d } })}
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                            <Edit2 size={13} className="text-gray-400" />
                          </button>
                          <button onClick={() => del(d.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 size={13} className="text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent activity feed */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-base font-extrabold mb-4" style={{ color: P, borderRight: `4px solid ${S}`, paddingRight: "10px" }}>
            آخر الرحلات والعمليات
          </h3>
          <div className="space-y-3">
            {stats?.recentOrders && stats.recentOrders.length > 0 ? (
              stats.recentOrders.map((o, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: BG }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
                       style={{ backgroundColor: o.stage === "delivered" ? "#16a34a" : o.stage === "loaded" ? S : P }}>
                    <Truck size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{o.driver_name}</p>
                    <p className="text-xs text-gray-500 truncate">{o.delivery_location || o.order_number}</p>
                    <p className="text-xs text-gray-400">{o.vehicle_plate} · {o.created_at?.slice(0,10)}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${
                    o.stage === "delivered" ? "bg-green-100 text-green-700" :
                    o.stage === "loaded"    ? "bg-blue-100  text-blue-700"  :
                    "bg-gray-100 text-gray-500"}`}>
                    {o.stage === "delivered" ? "مكتمل" : o.stage === "loaded" ? "قيد التنفيذ" : o.stage}
                  </span>
                </div>
              ))
            ) : (
              /* placeholder activity items */
              [
                { icon: "🚛", text: "لا توجد رحلات مسجلة بعد", sub: "قم بمزامنة البيانات أو أضف طلبات", status: "info" },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: BG }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0 text-xl"
                       style={{ backgroundColor: S }}>{item.icon}</div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">{item.text}</p>
                    <p className="text-xs text-gray-400">{item.sub}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick stats summary */}
          {stats && (
            <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
              {[
                { label: "نشط",     val: stats.active,             color: "#16a34a" },
                { label: "في رحلة", val: stats.onTrip,             color: S },
                { label: "الكل",    val: stats.total,              color: P },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 font-medium">{row.label}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 rounded-full overflow-hidden bg-gray-100" style={{ width: "80px" }}>
                      <div className="h-full rounded-full" style={{
                        width: `${stats.total ? (row.val / stats.total) * 100 : 0}%`,
                        backgroundColor: row.color,
                      }} />
                    </div>
                    <span className="font-bold w-5 text-right" style={{ color: row.color }}>{row.val}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Edit / Add Modal ────────────────────────────────────────────────────── */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModal({ open: false, d: {} })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 rounded-t-2xl" style={{ backgroundColor: P }}>
              <h2 className="font-extrabold text-white text-lg flex items-center gap-2">
                <Truck size={18} />{modal.d.id ? "تعديل بيانات السائق" : "إضافة سائق جديد"}
              </h2>
              <button onClick={() => setModal({ open: false, d: {} })} className="text-white/80 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 grid grid-cols-2 gap-4">
              {([
                ["اسم السائق *", "driver_name", "text"],
                ["رقم السيارة", "vehicle_plate", "text"],
                ["رقم الجوال", "phone", "text"],
                ["الفرع", "branch", "text"],
                ["البريد الإلكتروني", "email", "email"],
              ] as [string, keyof Driver, string][]).map(([lbl, k, t]) => (
                <div key={k} className={k === "driver_name" || k === "email" ? "col-span-2" : ""}>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">{lbl}</label>
                  <input type={t} value={String(modal.d[k] ?? "")}
                    onChange={e => setModal(m => ({ ...m, d: { ...m.d, [k]: e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": S } as React.CSSProperties} />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">الحالة</label>
                <select value={modal.d.status ?? "نشط"}
                  onChange={e => setModal(m => ({ ...m, d: { ...m.d, status: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white">
                  {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">ملاحظات</label>
                <textarea value={modal.d.notes ?? ""} rows={2}
                  onChange={e => setModal(m => ({ ...m, d: { ...m.d, notes: e.target.value } }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none" />
              </div>
            </div>

            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setModal({ open: false, d: {} })}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
              <button onClick={save} disabled={saving || !modal.d.driver_name}
                className="flex-1 py-2.5 rounded-xl text-sm font-extrabold text-white disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: P }}>
                <Save size={14} />{saving ? "جاري الحفظ..." : modal.d.id ? "تحديث" : "إضافة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
