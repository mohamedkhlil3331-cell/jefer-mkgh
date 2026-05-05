import { useEffect, useState } from "react";
import {
  RefreshCw, Download, Plus, Edit2, Trash2, Save, X, MapPin, Truck, Search
} from "lucide-react";

interface Tariff {
  id: number;
  row_id?: number;
  loading_place: string;
  unloading_place: string;
  driver_expense: number;
  rental: number;
  notes?: string;
  synced_at?: string;
}

const EMPTY: Partial<Tariff> = { loading_place: "", unloading_place: "", driver_expense: 0, rental: 0 };

export default function TariffsPage() {
  const [rows, setRows] = useState<Tariff[]>([]);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [filterLoading, setFilterLoading] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; row: Partial<Tariff> }>({ open: false, row: {} });
  const [saving, setSaving] = useState(false);
  const [editInline, setEditInline] = useState<Record<number, Partial<Tariff>>>({});

  const load = () => {
    setLoading(true);
    fetch("/api/tariffs")
      .then(r => r.json())
      .then(d => { setRows(d.rows || []); setSyncedAt(d.synced_at); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true); setSyncMsg("");
    try {
      const r = await fetch("/api/tariffs/sync", { method: "POST" });
      const d = await r.json();
      setSyncMsg(d.message || d.error);
      if (d.imported) load();
    } finally { setSyncing(false); }
  };

  const loadingPlaces = [...new Set(rows.map(r => r.loading_place))].sort();

  const filtered = rows.filter(r => {
    const matchPlace = !filterLoading || r.loading_place === filterLoading;
    const q = search.toLowerCase();
    const matchSearch = !q || r.loading_place.toLowerCase().includes(q) || r.unloading_place.toLowerCase().includes(q);
    return matchPlace && matchSearch;
  });

  const saveInline = async (id: number) => {
    const patch = editInline[id];
    if (!patch) return;
    setSaving(true);
    const orig = rows.find(r => r.id === id)!;
    await fetch(`/api/tariffs/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...orig, ...patch }),
    });
    setSaving(false);
    setEditInline(e => { const n = { ...e }; delete n[id]; return n; });
    load();
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذا السطر؟")) return;
    await fetch(`/api/tariffs/${id}`, { method: "DELETE" });
    load();
  };

  const saveModal = async () => {
    setSaving(true);
    const { id, ...body } = modal.row;
    const url = id ? `/api/tariffs/${id}` : "/api/tariffs";
    await fetch(url, { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    setModal({ open: false, row: {} });
    load();
  };

  const exportCSV = () => {
    const headers = ["مكان التحميل", "مكان التنزيل", "مصروف السائق", "الإيجار"];
    const csvRows = filtered.map(r => [r.loading_place, r.unloading_place, r.driver_expense, r.rental].join(","));
    const csv = [headers.join(","), ...csvRows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `tariffs-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const setInline = (id: number, k: keyof Tariff, v: string | number) =>
    setEditInline(e => ({ ...e, [id]: { ...e[id], [k]: v } }));

  return (
    <div className="space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">التعريفة — أماكن التحميل والتنزيل</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {rows.length} سطر{syncedAt ? ` — آخر مزامنة: ${syncedAt.slice(0,16).replace("T"," ")}` : " — لم تتم المزامنة بعد"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 shadow-sm">
            <Download size={14} />تصدير CSV
          </button>
          <button onClick={() => setModal({ open: true, row: { ...EMPTY } })} className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 shadow-sm">
            <Plus size={14} />إضافة يدوي
          </button>
          <button
            onClick={sync} disabled={syncing}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-sm disabled:opacity-60"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "جاري المزامنة..." : "مزامنة من جوجل شيت"}
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${syncMsg.includes("فشل") ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
          {syncMsg}
        </div>
      )}

      {/* Summary cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
            <div className="text-2xl font-bold text-blue-600">{rows.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">إجمالي المسارات</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
            <div className="text-2xl font-bold text-green-600">{loadingPlaces.length}</div>
            <div className="text-xs text-gray-500 mt-0.5">أماكن التحميل</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
            <div className="text-xl font-bold text-orange-600">{Math.min(...rows.map(r => r.driver_expense))} – {Math.max(...rows.map(r => r.driver_expense))}</div>
            <div className="text-xs text-gray-500 mt-0.5">نطاق مصروف السائق (ريال)</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
            <div className="text-xl font-bold text-purple-600">{Math.min(...rows.map(r => r.rental))} – {Math.max(...rows.map(r => r.rental))}</div>
            <div className="text-xs text-gray-500 mt-0.5">نطاق الإيجار (ريال)</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث في أماكن التحميل والتنزيل..."
            className="w-full border border-gray-200 rounded-xl pr-9 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilterLoading("")} className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${!filterLoading ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
            الكل ({rows.length})
          </button>
          {loadingPlaces.slice(0, 6).map(p => (
            <button key={p} onClick={() => setFilterLoading(p === filterLoading ? "" : p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${filterLoading === p ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
              {p.replace("*/*", " / ")} ({rows.filter(r => r.loading_place === p).length})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-16 text-center">
          <MapPin size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">لا توجد بيانات تعريفة بعد</p>
          <p className="text-gray-400 text-sm mt-1">اضغط "مزامنة من جوجل شيت" لاستيراد التعريفة</p>
          <button onClick={sync} disabled={syncing} className="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">
            <RefreshCw size={14} className={`inline ml-2 ${syncing ? "animate-spin" : ""}`} />مزامنة الآن
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm text-gray-600 font-medium">{filtered.length} مسار</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">#</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600">
                    <MapPin size={11} className="inline ml-1" />مكان التحميل
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-green-600">
                    <MapPin size={11} className="inline ml-1" />مكان التنزيل
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-orange-600">
                    <Truck size={11} className="inline ml-1" />مصروف السائق (ريال)
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-purple-600">الإيجار (ريال)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r, i) => {
                  const isDirty = !!editInline[r.id];
                  const get = (k: keyof Tariff) => editInline[r.id]?.[k] !== undefined ? editInline[r.id][k] : r[k];
                  return (
                    <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${isDirty ? "bg-yellow-50/40" : ""}`}>
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                        {String(r.loading_place).replace("*/*", " / ")}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.unloading_place}</td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number" min="0" step="1"
                          value={Number(get("driver_expense"))}
                          onChange={e => setInline(r.id, "driver_expense", parseFloat(e.target.value) || 0)}
                          className={`w-24 px-2 py-1 text-sm text-center border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 ${isDirty ? "border-orange-300 bg-orange-50" : "border-gray-200"}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number" min="0" step="1"
                          value={Number(get("rental"))}
                          onChange={e => setInline(r.id, "rental", parseFloat(e.target.value) || 0)}
                          className={`w-24 px-2 py-1 text-sm text-center border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 ${isDirty ? "border-purple-300 bg-purple-50" : "border-gray-200"}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          {isDirty ? (
                            <>
                              <button onClick={() => saveInline(r.id)} disabled={saving}
                                className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                                <Save size={11} />حفظ
                              </button>
                              <button onClick={() => setEditInline(e => { const n = { ...e }; delete n[r.id]; return n; })}
                                className="p-1.5 hover:bg-gray-100 rounded-lg">
                                <X size={12} className="text-gray-400" />
                              </button>
                            </>
                          ) : (
                            <button onClick={() => del(r.id)} className="p-1.5 hover:bg-red-50 rounded-lg">
                              <Trash2 size={13} className="text-red-400" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setModal({ open: false, row: {} })}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900 text-lg">إضافة مسار جديد</h2>
              <button onClick={() => setModal({ open: false, row: {} })} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              {([
                ["مكان التحميل *", "loading_place", "text"],
                ["مكان التنزيل *", "unloading_place", "text"],
                ["مصروف السائق (ريال)", "driver_expense", "number"],
                ["الإيجار (ريال)", "rental", "number"],
              ] as [string, keyof Tariff, string][]).map(([lbl, k, t]) => (
                <div key={k}>
                  <label className="text-xs font-medium text-gray-600 block mb-1">{lbl}</label>
                  <input
                    type={t} value={String(modal.row[k] ?? "")}
                    onChange={e => setModal(m => ({ ...m, row: { ...m.row, [k]: t === "number" ? parseFloat(e.target.value) || 0 : e.target.value } }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModal({ open: false, row: {} })} className="flex-1 py-2.5 border rounded-xl text-sm">إلغاء</button>
              <button onClick={saveModal} disabled={saving || !modal.row.loading_place || !modal.row.unloading_place}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50">
                {saving ? "جاري الحفظ..." : "إضافة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
