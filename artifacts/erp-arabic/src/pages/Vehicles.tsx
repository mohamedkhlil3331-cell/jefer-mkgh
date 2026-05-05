import { useEffect, useState, useRef } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import Badge from "@/components/Badge";
import { Plus, Pencil, Trash2, Upload, FileSpreadsheet, Link2, X, CheckCircle2, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";

interface Vehicle {
  id: number; plate_number: string; vehicle_type: string;
  status: string; driver_name: string; notes: string;
}

const STATUSES = ["available", "busy", "maintenance", "broken"];
const STATUS_AR: Record<string, string> = { available: "متاح", busy: "مشغول", maintenance: "صيانة", broken: "معطل" };

/* ─── column auto-map ─────────────────────────────────────────────────────────── */
function mapRow(raw: Record<string, string>): Record<string, string> {
  const MAP: Record<string, string> = {
    "رقم اللوحة": "plate_number", "plate_number": "plate_number",
    "رقم السيارة": "plate_number", "اللوحة": "plate_number", "لوحة": "plate_number",
    "نوع المركبة": "vehicle_type", "vehicle_type": "vehicle_type", "النوع": "vehicle_type", "نوع": "vehicle_type",
    "الحالة": "status", "status": "status",
    "السائق": "driver_name", "driver_name": "driver_name",
    "اسم السائق": "driver_name", "اسم": "driver_name",
    "ملاحظات": "notes", "notes": "notes",
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const norm = MAP[k.trim()] ?? MAP[k.trim().toLowerCase()];
    if (norm) out[norm] = String(v ?? "").trim();
  }
  return out;
}

function parseCSVText(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map(line => {
    const vals: string[] = [];
    let cur = ""; let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === "," && !inQ) { vals.push(cur); cur = ""; }
      else cur += ch;
    }
    vals.push(cur);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").replace(/^"|"$/g, "").trim(); });
    return row;
  });
}

/* ─── Import Modal ───────────────────────────────────────────────────────────── */
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [tab, setTab]               = useState<"file" | "gsheet">("file");
  const [preview, setPreview]       = useState<Record<string, string>[]>([]);
  const [gid, setGid]               = useState("");
  const [status, setStatus]         = useState<"idle" | "loading" | "done" | "error">("idle");
  const [msg, setMsg]               = useState("");
  const [dragging, setDragging]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* parse file (CSV or XLSX) */
  const handleFile = (file: File) => {
    const reader = new FileReader();
    if (file.name.endsWith(".csv")) {
      reader.onload = e => setPreview(parseCSVText(String(e.target?.result)));
      reader.readAsText(file, "utf-8");
    } else {
      reader.onload = e => {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        setPreview(rows);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  /* drag-and-drop */
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  /* fetch from Google Sheets GID */
  const fetchSheet = async () => {
    const raw = gid.trim();
    const match = raw.match(/gid=(\d+)/) ?? raw.match(/\/(\d{5,})$/);
    const resolvedGid = match ? match[1] : raw.replace(/\D/g, "");
    if (!resolvedGid) return void setMsg("أدخل GID صحيح أو رابط جوجل شيت");
    setStatus("loading"); setMsg("");
    try {
      const r = await fetch(`/api/sheets/${resolvedGid}`);
      const d = await r.json();
      if (d.rows?.length) { setPreview(d.rows); setStatus("idle"); }
      else setMsg("لم يتم العثور على بيانات في هذه الورقة");
    } catch { setMsg("فشل الاتصال بالشيت"); }
    setStatus("idle");
  };

  /* submit import */
  const doImport = async () => {
    if (!preview.length) return;
    setStatus("loading"); setMsg("");
    const rows = preview.map(mapRow).filter(r => r.plate_number);
    if (!rows.length) { setStatus("error"); setMsg("لم يتم العثور على عمود 'رقم اللوحة' في البيانات"); return; }
    try {
      const r = await fetch("/api/vehicles/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: preview }),
      });
      const d = await r.json();
      if (d.imported > 0) { setStatus("done"); setMsg(d.message); onDone(); }
      else { setStatus("error"); setMsg("لم يتم استيراد أي مركبة — تحقق من أسماء الأعمدة"); }
    } catch { setStatus("error"); setMsg("خطأ في الاتصال بالخادم"); }
  };

  const mappedCols = preview.length ? Object.keys(mapRow(preview[0])) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-extrabold text-lg text-gray-800 flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-green-600" />استيراد المركبات
          </h2>
          <button onClick={onClose}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          {([["file", "📁 رفع ملف (CSV / Excel)"], ["gsheet", "🔗 جوجل شيت"]] as const).map(([key, lbl]) => (
            <button key={key} onClick={() => { setTab(key); setPreview([]); setMsg(""); }}
              className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${tab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
              {lbl}
            </button>
          ))}
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {/* File upload */}
          {tab === "file" && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                ${dragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"}`}>
              <Upload size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="font-semibold text-gray-600">اسحب الملف هنا أو اضغط للاختيار</p>
              <p className="text-xs text-gray-400 mt-1">CSV · Excel (.xlsx / .xls)</p>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}

          {/* Google Sheets */}
          {tab === "gsheet" && (
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-700">رابط جوجل شيت أو رقم GID</label>
              <div className="flex gap-2">
                <input value={gid} onChange={e => setGid(e.target.value)}
                  placeholder="مثال: 702903959 أو الرابط الكامل"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <button onClick={fetchSheet} disabled={status === "loading"}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold disabled:opacity-60 hover:bg-blue-700">
                  <Link2 size={14} />{status === "loading" ? "جاري..." : "جلب"}
                </button>
              </div>
              <p className="text-xs text-gray-400">
                ورقة السائقين الافتراضية: <button onClick={() => { setGid("702903959"); }} className="text-blue-500 underline">702903959</button>
              </p>
            </div>
          )}

          {/* Status messages */}
          {msg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium
              ${status === "done" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {status === "done" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {msg}
            </div>
          )}

          {/* Preview table */}
          {preview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  معاينة: <span className="text-blue-600">{preview.length}</span> صف
                  {mappedCols.length > 0 && (
                    <span className="text-gray-400 font-normal"> · أعمدة مُعرَّفة: {mappedCols.join(", ")}</span>
                  )}
                </p>
                <button onClick={() => setPreview([])} className="text-xs text-gray-400 hover:text-red-500">
                  مسح
                </button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {Object.keys(preview[0]).slice(0, 6).map(h => (
                        <th key={h} className="px-3 py-2 text-right font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.slice(0, 8).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/50">
                        {Object.keys(preview[0]).slice(0, 6).map(h => (
                          <td key={h} className="px-3 py-2 text-gray-700 max-w-[120px] truncate">{row[h] || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 8 && (
                <p className="text-xs text-gray-400 text-center">... و {preview.length - 8} صف آخر</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            إلغاء
          </button>
          <button onClick={doImport} disabled={!preview.length || status === "loading" || status === "done"}
            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-extrabold disabled:opacity-50 hover:bg-green-700 flex items-center justify-center gap-2">
            <FileSpreadsheet size={15} />
            {status === "loading" ? "جاري الاستيراد..." : status === "done" ? "✓ تم الاستيراد" : `استيراد ${preview.length} صف`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function Vehicles() {
  const [rows,       setRows]       = useState<Vehicle[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [open,       setOpen]       = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing,    setEditing]    = useState<Vehicle | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    plate_number: "", vehicle_type: "شاحنة نقل", status: "available", driver_name: "", notes: "",
  });

  const load = () => {
    setLoading(true);
    apiFetch<Vehicle[]>("/vehicles").then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openAdd  = () => { setEditing(null); setForm({ plate_number: "", vehicle_type: "شاحنة نقل", status: "available", driver_name: "", notes: "" }); setOpen(true); };
  const openEdit = (v: Vehicle) => { setEditing(v); setForm({ plate_number: v.plate_number, vehicle_type: v.vehicle_type, status: v.status, driver_name: v.driver_name || "", notes: v.notes || "" }); setOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    try {
      if (editing) await apiFetch(`/vehicles/${editing.id}`, { method: "PUT",  body: JSON.stringify(form) });
      else         await apiFetch("/vehicles",                { method: "POST", body: JSON.stringify(form) });
      setOpen(false); load();
    } catch (err) { alert((err as Error).message); }
    finally { setSubmitting(false); }
  };

  const del = async (id: number) => {
    if (!confirm("حذف هذه المركبة؟")) return;
    await apiFetch(`/vehicles/${id}`, { method: "DELETE" }); load();
  };

  const statusGroups = STATUSES.map(s => ({ status: s, label: STATUS_AR[s], count: rows.filter(r => r.status === s).length }));

  return (
    <div>
      <PageHeader
        title="المركبات"
        subtitle={`${rows.length} مركبة`}
        action={
          <div className="flex gap-2">
            <button onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 border border-green-600 text-green-600 hover:bg-green-50 px-4 py-2 rounded-lg text-sm font-medium">
              <FileSpreadsheet size={15} />استيراد من شيت / Excel
            </button>
            <button onClick={openAdd}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 text-sm">
              <Plus size={16} />إضافة مركبة
            </button>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {statusGroups.map(({ status, label, count }) => (
          <div key={status} className="bg-card border border-border rounded-xl p-4 text-center">
            <Badge status={status} />
            <div className="text-2xl font-bold mt-2">{count}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(v => (
            <div key={v.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-bold text-lg">{v.plate_number}</div>
                  <div className="text-sm text-muted-foreground">{v.vehicle_type}</div>
                </div>
                <Badge status={v.status} />
              </div>
              {v.driver_name && <div className="text-sm"><span className="text-muted-foreground">السائق: </span>{v.driver_name}</div>}
              {v.notes && <div className="text-sm text-muted-foreground mt-1 truncate">{v.notes}</div>}
              <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                <button onClick={() => openEdit(v)} className="flex items-center gap-1 text-sm text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg">
                  <Pencil size={13} />تعديل
                </button>
                <button onClick={() => del(v.id)} className="flex items-center gap-1 text-sm text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg mr-auto">
                  <Trash2 size={13} />حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "تعديل مركبة" : "إضافة مركبة"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">رقم اللوحة *</label>
            <input required value={form.plate_number} onChange={e => setForm(f => ({ ...f, plate_number: e.target.value }))}
              placeholder="ABC-1234"
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">نوع المركبة</label>
            <input value={form.vehicle_type} onChange={e => setForm(f => ({ ...f, vehicle_type: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">الحالة</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm">
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_AR[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">السائق المعين</label>
            <input value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">ملاحظات</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm resize-none" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={submitting}
              className="flex-1 bg-primary text-white py-2 rounded-lg hover:bg-primary/90 disabled:opacity-60 text-sm font-medium">
              {submitting ? "جاري الحفظ..." : "حفظ"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="flex-1 bg-muted text-foreground py-2 rounded-lg text-sm">إلغاء</button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      {importOpen && (
        <ImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); load(); }} />
      )}
    </div>
  );
}
