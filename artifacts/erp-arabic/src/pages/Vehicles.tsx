import { useEffect, useState, useRef } from "react";
import { useRememberedState } from "@/hooks/useRememberedState";
import * as XLSX from "xlsx";
import {
  Car, Plus, Pencil, Trash2, RefreshCw, X, Save,
  FileSpreadsheet, Link2, Upload, CheckCircle2, AlertCircle,
  User, FileText, Wrench, CheckCircle, AlertTriangle,
  Package, Send,
} from "lucide-react";

interface Vehicle {
  id: number; plate_number: string; vehicle_type: string;
  status: string; driver_name: string; notes: string;
}

const STATUSES = ["available", "busy", "maintenance", "broken"];
const STATUS_AR: Record<string, string> = { available: "متاح", busy: "مشغول", maintenance: "صيانة", broken: "معطل" };
const STATUS_COLOR: Record<string, string> = {
  available:   "bg-green-100 text-green-700 border-green-200",
  busy:        "bg-blue-100 text-blue-700 border-blue-200",
  maintenance: "bg-amber-100 text-amber-700 border-amber-200",
  broken:      "bg-red-100 text-red-700 border-red-200",
};
const STATUS_BG: Record<string, string> = {
  available: "bg-green-500", busy: "bg-blue-500", maintenance: "bg-amber-500", broken: "bg-red-500",
};

/* ── Column auto-map ── */
function mapRow(raw: Record<string, string>): Record<string, string> {
  const MAP: Record<string, string> = {
    "رقم اللوحة": "plate_number", "plate_number": "plate_number", "رقم السيارة": "plate_number", "اللوحة": "plate_number",
    "نوع المركبة": "vehicle_type", "vehicle_type": "vehicle_type", "النوع": "vehicle_type",
    "الحالة": "status", "status": "status", "السائق": "driver_name", "driver_name": "driver_name", "ملاحظات": "notes",
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const norm = MAP[k.trim()] ?? MAP[k.trim().toLowerCase()];
    if (norm) out[norm] = String(v ?? "").trim();
  }
  return out;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map(line => {
    const vals: string[] = []; let cur = ""; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; } else if (ch === "," && !inQ) { vals.push(cur); cur = ""; } else cur += ch;
    }
    vals.push(cur);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
    return row;
  });
}

/* ── Load Request target label ── */
function loadTarget(vehicleType: string): string {
  if (/بلكر/i.test(vehicleType)) return "مسؤول الفسحات";
  if (/سطحة|قلاب|لوبد|lowbed/i.test(vehicleType)) return "مشرف النقليات";
  return "مسئول حركة البرح";
}

/* ── Import Modal ── */
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [tab,      setTab]      = useState<"file" | "gsheet">("file");
  const [preview,  setPreview]  = useState<Record<string, string>[]>([]);
  const [gid,      setGid]      = useState("");
  const [status,   setStatus]   = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg,      setMsg]      = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    if (file.name.endsWith(".csv")) {
      reader.onload = e => setPreview(parseCSV(String(e.target?.result)));
      reader.readAsText(file, "utf-8");
    } else {
      reader.onload = e => {
        const wb   = XLSX.read(e.target?.result, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        setPreview(rows);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const fetchSheet = async () => {
    const raw   = gid.trim();
    const match = raw.match(/gid=(\d+)/) ?? raw.match(/\/(\d{5,})$/);
    const id    = match ? match[1] : raw.replace(/\D/g, "");
    if (!id) return void setMsg("أدخل GID صحيح");
    setStatus("loading"); setMsg("");
    try {
      const r = await fetch(`/api/sheets/${id}`); const d = await r.json();
      if (d.rows?.length) { setPreview(d.rows); setStatus("idle"); }
      else setMsg("لا توجد بيانات في هذه الورقة");
    } catch { setMsg("فشل الاتصال"); }
    setStatus("idle");
  };

  const doImport = async () => {
    if (!preview.length) return;
    setStatus("loading"); setMsg("");
    const rows = preview.map(mapRow).filter(r => r.plate_number);
    if (!rows.length) { setStatus("error"); setMsg("لم يتم التعرف على عمود رقم اللوحة"); return; }
    try {
      const r = await fetch("/api/fleet-vehicles/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview }),
      });
      const d = await r.json();
      if (d.imported > 0) { setStatus("done"); setMsg(d.message); onDone(); }
      else { setStatus("error"); setMsg("لم يتم استيراد أي مركبة"); }
    } catch { setStatus("error"); setMsg("خطأ في الاتصال"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-black text-lg flex items-center gap-2"><FileSpreadsheet size={20} className="text-green-600" />استيراد المركبات</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="flex gap-1 px-6 pt-4 border-b border-gray-100 pb-0">
          {([["file", "رفع ملف (CSV / Excel)"], ["gsheet", "جوجل شيت"]] as const).map(([key, lbl]) => (
            <button key={key} onClick={() => { setTab(key); setPreview([]); setMsg(""); }}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors mb-[-1px] ${tab === key ? "border-[#103c68] text-[#103c68]" : "border-transparent text-gray-400"}`}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {tab === "file" && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${dragging ? "border-[#103c68] bg-[#103c68]/5" : "border-gray-200 hover:border-[#103c68]/50 hover:bg-gray-50"}`}>
              <Upload size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="font-bold text-gray-600">اسحب الملف هنا أو اضغط للاختيار</p>
              <p className="text-xs text-gray-400 mt-1">CSV · Excel (.xlsx / .xls)</p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}
          {tab === "gsheet" && (
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-700">رابط جوجل شيت أو رقم GID</label>
              <div className="flex gap-2">
                <input value={gid} onChange={e => setGid(e.target.value)}
                  placeholder="مثال: 702903959 أو الرابط الكامل"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 bg-gray-50" />
                <button onClick={fetchSheet} disabled={status === "loading"}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-semibold disabled:opacity-60 hover:bg-[#0d2e50]">
                  <Link2 size={14} />{status === "loading" ? "جاري..." : "جلب"}
                </button>
              </div>
            </div>
          )}
          {msg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${status === "done" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {status === "done" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}{msg}
            </div>
          )}
          {preview.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">معاينة: <span className="text-[#103c68]">{preview.length}</span> صف</p>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>{Object.keys(preview[0]).slice(0, 6).map(h => <th key={h} className="px-3 py-2 text-right font-semibold text-gray-500">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 6).map((row, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        {Object.keys(preview[0]).slice(0, 6).map(h => <td key={h} className="px-3 py-2 text-gray-700 max-w-[120px] truncate">{row[h] || "—"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium">إلغاء</button>
          <button onClick={doImport} disabled={!preview.length || status === "loading" || status === "done"}
            className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-black disabled:opacity-50 hover:bg-green-700 flex items-center justify-center gap-2">
            <FileSpreadsheet size={15} />
            {status === "loading" ? "جاري الاستيراد..." : status === "done" ? "تم الاستيراد" : `استيراد ${preview.length} صف`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function Vehicles() {
  const [rows,        setRows]       = useState<Vehicle[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [openForm,    setOpenForm]   = useState(false);
  const [importOpen,  setImportOpen] = useState(false);
  const [editing,     setEditing]    = useState<Vehicle | null>(null);
  const [submitting,  setSubmitting] = useState(false);
  const [formError,   setFormError]  = useState("");
  const [form, setForm] = useState({ plate_number: "", vehicle_type: "شاحنة نقل", status: "available", driver_name: "", notes: "" });
  const [vehicleTypes, setVehicleTypes] = useState<{ id: number; name: string; icon: string; is_active: number }[]>([]);
  const [typeFilter,   setTypeFilter]   = useRememberedState("vehicles-type-filter", "all");

  // Load Request state
  const [loadReqVehicle, setLoadReqVehicle] = useState<Vehicle | null>(null);
  const [loadReqNotes,   setLoadReqNotes]   = useState("");
  const [loadReqSending, setLoadReqSending] = useState(false);
  const [loadReqDone,    setLoadReqDone]    = useState<{ targetLabel: string; sent: number; warn?: string } | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/fleet-vehicles").then(r => r.json()).then(setRows).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    fetch("/api/vehicle-type-defs")
      .then(r => r.json())
      .then((data: { id: number; name: string; icon: string; is_active: number }[]) =>
        setVehicleTypes(data.filter(t => t.is_active !== 0))
      )
      .catch(() => {});
  }, []);

  const openAdd  = () => { setEditing(null); setForm({ plate_number: "", vehicle_type: "شاحنة نقل", status: "available", driver_name: "", notes: "" }); setFormError(""); setOpenForm(true); };
  const openEdit = (v: Vehicle) => { setEditing(v); setForm({ plate_number: v.plate_number, vehicle_type: v.vehicle_type, status: v.status, driver_name: v.driver_name || "", notes: v.notes || "" }); setOpenForm(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) {
      const dup = rows.find(v => v.plate_number.trim() === form.plate_number.trim());
      if (dup) { setFormError("رقم اللوحة مسجّل مسبقاً في دفتر السيارات"); return; }
    }
    setSubmitting(true);
    try {
      let res: Response;
      if (editing) {
        res = await fetch(`/api/fleet-vehicles/${encodeURIComponent(editing.plate_number)}/info`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, new_plate_number: form.plate_number }),
        });
      } else {
        res = await fetch("/api/fleet-vehicles/create", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || "حدث خطأ"); return; }
      setOpenForm(false); setFormError(""); load();
    } catch (err) { setFormError((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const del = async (plate: string) => {
    if (!confirm("حذف هذه المركبة؟")) return;
    await fetch(`/api/fleet-vehicles/${encodeURIComponent(plate)}`, { method: "DELETE" }); load();
  };

  const openLoadReq = (v: Vehicle) => { setLoadReqVehicle(v); setLoadReqNotes(""); setLoadReqDone(null); };
  const closeLoadReq = () => { setLoadReqVehicle(null); setLoadReqNotes(""); setLoadReqDone(null); };

  const sendLoadRequest = async () => {
    if (!loadReqVehicle) return;
    setLoadReqSending(true);
    try {
      const r = await fetch(`/api/fleet-vehicles/${encodeURIComponent(loadReqVehicle.plate_number)}/load-request`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: loadReqNotes }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "فشل الإرسال");
      setLoadReqDone({ targetLabel: d.targetLabel, sent: d.sent, warn: d.warn });
    } catch (err) { alert((err as Error).message); }
    finally { setLoadReqSending(false); }
  };

  const filteredRows = typeFilter === "all" ? rows : rows.filter(r => r.vehicle_type === typeFilter);

  const statusGroups = STATUSES.map(s => ({ s, label: STATUS_AR[s], count: rows.filter(r => r.status === s).length }));

  return (
    <div dir="rtl" className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Car size={22} className="text-[#103c68]" />المركبات
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">{rows.length} مركبة</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
            <RefreshCw size={15} className={loading ? "animate-spin text-gray-400" : "text-gray-400"} />
          </button>
          <button onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 border border-green-600 text-green-600 hover:bg-green-50 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
            <FileSpreadsheet size={15} />استيراد
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 bg-[#103c68] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2e50] transition-colors shadow-sm">
            <Plus size={16} />إضافة مركبة
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {statusGroups.map(({ s, label, count }) => (
          <div key={s} className={`${STATUS_BG[s]} text-white rounded-2xl p-4 text-center shadow-sm`}>
            <div className="text-2xl font-black">{count}</div>
            <div className="text-xs opacity-80 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Type filter buttons */}
      {vehicleTypes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTypeFilter("all")}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
              typeFilter === "all"
                ? "bg-[#103c68] text-white border-[#103c68] shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:border-[#103c68]/40"
            }`}
          >
            الكل
            <span className={`text-xs tabular-nums font-black ${typeFilter === "all" ? "text-white/80" : "text-gray-400"}`}>
              {rows.length}
            </span>
          </button>
          {vehicleTypes.map(t => {
            const count = rows.filter(r => r.vehicle_type === t.name).length;
            const active = typeFilter === t.name;
            return (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.name)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  active
                    ? "bg-[#103c68] text-white border-[#103c68] shadow-sm"
                    : "bg-white text-gray-600 border-gray-200 hover:border-[#103c68]/40"
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.name}</span>
                <span className={`text-xs tabular-nums font-black ${active ? "text-white/80" : "text-gray-400"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Grid of vehicles */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-32 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <Car size={40} className="mx-auto text-gray-200 mb-3" />
          <p className="text-gray-400">{rows.length === 0 ? "لا توجد مركبات مسجّلة" : "لا توجد مركبات من هذا النوع"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRows.map(v => (
            <div key={v.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-black text-gray-900 text-lg font-mono">{v.plate_number}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{v.vehicle_type}</div>
                </div>
                <span className={`text-xs px-2.5 py-1.5 rounded-xl font-semibold border ${STATUS_COLOR[v.status] || "bg-gray-100 text-gray-600"}`}>
                  {STATUS_AR[v.status] || v.status}
                </span>
              </div>
              {v.driver_name && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <User size={12} className="text-gray-400" />{v.driver_name}
                </div>
              )}
              {v.notes && <div className="text-xs text-gray-400 truncate mb-3">{v.notes}</div>}
              <div className="flex gap-2 mt-3 pt-3 border-t border-gray-50 flex-wrap">
                <button onClick={() => openLoadReq(v)}
                  className="flex items-center gap-1.5 text-sm text-emerald-600 hover:bg-emerald-50 px-3 py-2 rounded-xl font-bold border border-emerald-200 transition-colors">
                  <Package size={13} />طلب حمولة
                </button>
                <button onClick={() => openEdit(v)}
                  className="flex items-center gap-1.5 text-sm text-[#103c68] hover:bg-[#103c68]/10 px-3 py-2 rounded-xl font-semibold transition-colors">
                  <Pencil size={13} />تعديل
                </button>
                <button onClick={() => del(v.plate_number)}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl font-semibold mr-auto transition-colors">
                  <Trash2 size={13} />حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {openForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={() => setOpenForm(false)}>
          <div className="bg-white rounded-t-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-black text-lg flex items-center gap-2">
                <Car size={18} className="text-[#103c68]" />{editing ? "تعديل مركبة" : "إضافة مركبة"}
              </h2>
              <button onClick={() => setOpenForm(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">رقم اللوحة *</label>
                <input required value={form.plate_number} onChange={e => {
                  const val = e.target.value;
                  setForm(f => ({ ...f, plate_number: val }));
                  if (!editing) {
                    const dup = rows.find(v => v.plate_number.trim() === val.trim());
                    setFormError(dup ? "رقم اللوحة مسجّل مسبقاً في دفتر السيارات" : "");
                  }
                }}
                  placeholder="ABC-1234"
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 font-mono ${formError && !editing ? "border-red-400 focus:ring-red-300" : "border-gray-200 focus:ring-[#103c68]/30"}`} />
                {formError && !editing && <p className="text-red-600 text-xs mt-1 font-semibold">⚠️ {formError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">نوع المركبة</label>
                  {vehicleTypes.length > 0 ? (
                    <select
                      value={form.vehicle_type}
                      onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30"
                    >
                      {vehicleTypes.map(t => (
                        <option key={t.id} value={t.name}>{t.icon} {t.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={form.vehicle_type}
                      onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">الحالة</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30">
                    {STATUSES.map(s => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">السائق المعين</label>
                <input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">ملاحظات</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#103c68]/30 resize-none" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={submitting || (!!formError && !editing)}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#103c68] text-white py-3.5 rounded-xl font-bold disabled:opacity-60">
                  <Save size={16} />{submitting ? "جاري الحفظ..." : "حفظ"}
                </button>
                <button type="button" onClick={() => setOpenForm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3.5 rounded-xl font-medium">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />}

      {/* ── Load Request Modal ── */}
      {loadReqVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={closeLoadReq}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 bg-emerald-50 border-b border-emerald-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-black text-gray-900 flex items-center gap-2">
                  <Package size={18} className="text-emerald-600" />طلب حمولة
                </h3>
                <button onClick={closeLoadReq} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-white/70">
                  <X size={16} />
                </button>
              </div>
              <div className="bg-white rounded-2xl border border-emerald-100 px-4 py-3">
                <div className="font-black text-gray-900 text-lg font-mono">{loadReqVehicle.plate_number}</div>
                <div className="text-sm text-gray-500">{loadReqVehicle.vehicle_type || "—"}</div>
              </div>
            </div>

            {loadReqDone ? (
              <div className="px-6 py-5 text-center space-y-3">
                {loadReqDone.sent > 0 ? (
                  <>
                    <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                      <CheckCircle2 size={28} className="text-emerald-600" />
                    </div>
                    <p className="font-black text-gray-800">تم إرسال الطلب</p>
                    <p className="text-sm text-gray-500">
                      أُرسل إلى <span className="font-bold text-emerald-700">{loadReqDone.targetLabel}</span>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                      <AlertTriangle size={28} className="text-amber-500" />
                    </div>
                    <p className="font-bold text-gray-700">لا يوجد {loadReqDone.targetLabel} مسجّل حالياً</p>
                    <p className="text-xs text-gray-400">{loadReqDone.warn}</p>
                  </>
                )}
                <button onClick={closeLoadReq}
                  className="w-full py-3 bg-gray-100 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors">
                  إغلاق
                </button>
              </div>
            ) : (
              <div className="px-6 py-5 space-y-4">
                <div className="bg-[#103c68]/5 rounded-xl px-4 py-3 text-sm">
                  <span className="text-gray-500">سيُرسَل الطلب إلى: </span>
                  <span className="font-black text-[#103c68]">{loadTarget(loadReqVehicle.vehicle_type)}</span>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1.5">ملاحظات (اختياري)</label>
                  <textarea
                    rows={2}
                    value={loadReqNotes}
                    onChange={e => setLoadReqNotes(e.target.value)}
                    placeholder="أي تفاصيل إضافية..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={closeLoadReq}
                    className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
                    إلغاء
                  </button>
                  <button onClick={sendLoadRequest} disabled={loadReqSending}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2 transition-colors">
                    {loadReqSending
                      ? <><RefreshCw size={14} className="animate-spin" />جاري الإرسال...</>
                      : <><Send size={14} />إرسال الطلب</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
