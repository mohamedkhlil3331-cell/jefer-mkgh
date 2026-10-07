import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Boxes, Plus, Search, RefreshCw, ArrowDownCircle, ArrowUpCircle,
  AlertTriangle, PackageX, TrendingDown, Pencil, Trash2, X, Save,
  ShoppingCart, ChevronDown, Filter, Download, Upload, FileSpreadsheet,
  CheckCircle, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRememberedState } from "@/hooks/useRememberedState";

type InventoryItem = {
  id: number; item_name: string; item_code?: string; category: string;
  quantity: number; unit: string; min_stock: number; cost_per_unit: number;
  supplier?: string; last_updated: string; created_at: string;
  updated_by?: string | null;
};
type Transaction = {
  id: number; item_id: number; item_name: string; item_code?: string; type: "in" | "out";
  quantity: number; cost_per_unit: number;
  reason?: string; reference_no?: string; created_by?: string; vehicle_no?: string; created_at: string;
};

const CATEGORIES = ["عام", "زيوت وفلاتر", "إطارات", "كهرباء", "هيكل وميكانيكا", "أدوات", "قطع غيار أخرى"];
const UNITS      = ["قطعة", "لتر", "كيلو", "متر", "صندوق", "زوج", "طقم"];

function statusOf(item: InventoryItem) {
  if (item.quantity <= 0) return "zero";
  if (item.min_stock > 0 && item.quantity <= item.min_stock) return "low";
  return "ok";
}
const STATUS_CLS  = { ok: "bg-green-100 text-green-700", low: "bg-amber-100 text-amber-700", zero: "bg-red-100 text-red-700" };
const STATUS_LBL  = { ok: "✅ متوفر", low: "⚠️ منخفض", zero: "🔴 نفذ" };

const REASON_MAP: Record<string, string> = {
  رصيد_أولي: "رصيد أولي", استلام_مشتريات: "استلام مشتريات", إضافة_يدوية: "إضافة يدوية",
  صرف_أمر_عمل: "صرف أمر عمل", صرف_يدوي: "صرف يدوي",
};
function fmtReason(r?: string) { return r ? (REASON_MAP[r] ?? r.replace(/_/g, " ")) : "—"; }
function fmtDate(d: string)     { return new Date(d).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function fmtNum(n: number)       { return n.toLocaleString("ar-SA"); }

// ─── Modal: Add / Edit Item ────────────────────────────────────────────────
function ItemModal({ item, onClose, onSave }: {
  item?: InventoryItem; onClose: () => void; onSave: () => void;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    item_name: item?.item_name || "", item_code: item?.item_code || "",
    category: item?.category || "عام", quantity: item?.quantity ?? 0,
    unit: item?.unit || "قطعة", min_stock: item?.min_stock ?? 0,
    cost_per_unit: item?.cost_per_unit ?? 0, supplier: item?.supplier || "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.item_name.trim()) return alert("اسم الصنف مطلوب");
    setSaving(true);
    try {
      const url    = item ? `/api/workshop-inventory/${item.id}` : "/api/workshop-inventory";
      const method = item ? "PUT" : "POST";
      await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          created_by: user?.name || user?.phone,
          ...(item ? { updated_by: user?.name || user?.phone } : {}),
        }),
      });
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-gray-900">{item ? "تعديل الصنف" : "إضافة صنف جديد"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">اسم الصنف *</label>
            <input value={form.item_name} onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="مثال: فلتر زيت..." />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">كود الصنف</label>
            <input value={form.item_code} onChange={e => setForm(f => ({ ...f, item_code: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="اختياري" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">الفئة</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">الكمية الحالية</label>
            <input type="number" min="0" step="0.1" value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">الوحدة</label>
            <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">الحد الأدنى للتنبيه</label>
            <input type="number" min="0" step="0.1" value={form.min_stock}
              onChange={e => setForm(f => ({ ...f, min_stock: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">تكلفة الوحدة (ر.س)</label>
            <input type="number" min="0" step="0.01" value={form.cost_per_unit}
              onChange={e => setForm(f => ({ ...f, cost_per_unit: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">المورد</label>
            <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="اسم المورد" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">إلغاء</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <Save size={15}/>{saving ? "جاري الحفظ..." : (item ? "تحديث" : "إضافة")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Adjust Stock (وارد / منصرف يدوي) ─────────────────────────────
function AdjustModal({ item, defaultType = "in", onClose, onSave }: {
  item: InventoryItem; defaultType?: "in" | "out"; onClose: () => void; onSave: () => void;
}) {
  const { user } = useAuth();
  const [type, setType]           = useState<"in" | "out">(defaultType);
  const [qty, setQty]             = useState(1);
  const [cost, setCost]           = useState(item.cost_per_unit || 0);
  const [reason, setReason]       = useState("");
  const [refNo, setRefNo]         = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [trailerNo, setTrailerNo] = useState("");
  const [saving, setSaving]       = useState(false);

  const save = async () => {
    if (qty <= 0) return alert("الكمية يجب أن تكون أكبر من صفر");
    if (type === "out" && !vehicleNo.trim()) return alert("رقم السيارة مطلوب للمنصرف");
    setSaving(true);
    try {
      await fetch(`/api/workshop-inventory/${item.id}/adjust`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type, qty,
          cost_per_unit: type === "in" ? cost : undefined,
          reason: reason || undefined,
          // for out: vehicle_no = plate, reference_no = trailer; for in: reference_no = invoice ref
          vehicle_no:   type === "out" ? (vehicleNo.trim() || undefined) : undefined,
          reference_no: type === "out"
            ? (trailerNo.trim() || undefined)
            : (refNo.trim() || undefined),
          created_by: user?.name || user?.phone,
        }),
      });
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">حركة مخزون</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <p className="text-sm text-gray-500 mb-4">الصنف: <span className="font-semibold text-gray-800">{item.item_name}</span> — المتوفر: {item.quantity} {item.unit}</p>

        {/* Type toggle */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setType("in")}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${type === "in" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            <ArrowDownCircle size={16}/> وارد
          </button>
          <button onClick={() => setType("out")}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${type === "out" ? "bg-red-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            <ArrowUpCircle size={16}/> منصرف
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">الكمية *</label>
            <input type="number" min="0.1" step="0.1" value={qty} onChange={e => setQty(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          {type === "in" && (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                سعر الوردية (ر.س / وحدة) —{" "}
                <span className="text-gray-400 font-normal">المتوسط الحالي: {fmtNum(item.cost_per_unit)}</span>
              </label>
              <input type="number" min="0" step="0.01" value={cost} onChange={e => setCost(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-emerald-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none" />
              {cost > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  إجمالي الوردية: {fmtNum(qty * cost)} ر.س
                  {item.cost_per_unit > 0 && cost !== item.cost_per_unit && (
                    <span className="text-blue-500 mr-2">← سيُحدَّث المتوسط المرجح تلقائياً</span>
                  )}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">السبب</label>
            <input value={reason} onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder={type === "in" ? "استلام من المورد..." : "صرف للصيانة..."} />
          </div>

          {type === "out" ? (
            <>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">رقم السيارة *</label>
                <input value={vehicleNo} onChange={e => setVehicleNo(e.target.value)}
                  className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm focus:ring-2 focus:ring-red-400 outline-none"
                  placeholder="مثال: ABC-1234" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">رقم التيدر (اختياري)</label>
                <input value={trailerNo} onChange={e => setTrailerNo(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="مثال: TR-5678" />
              </div>
            </>
          ) : (
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">رقم مرجعي (اختياري)</label>
              <input value={refNo} onChange={e => setRefNo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="رقم فاتورة، أمر عمل..." />
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">إلغاء</button>
          <button onClick={save} disabled={saving}
            className={`flex-1 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 ${type === "in" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>
            {saving ? "جاري الحفظ..." : (type === "in" ? "إضافة للمخزون" : "صرف من المخزون")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Quick Purchase Request ────────────────────────────────────────
function PurchaseReqModal({ item, onClose, onSave }: {
  item: InventoryItem; onClose: () => void; onSave: () => void;
}) {
  const { user } = useAuth();
  const [qty, setQty]         = useState(Math.max(1, (item.min_stock - item.quantity)));
  const [reason, setReason]   = useState("مخزون منخفض — طلب تعبئة");
  const [saving, setSaving]   = useState(false);

  const save = async () => {
    if (qty <= 0) return alert("الكمية مطلوبة");
    setSaving(true);
    try {
      await fetch("/api/purchase-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: item.item_name, quantity: qty, unit: item.unit,
          reason, requested_by: user?.name || user?.phone || "مدير الورشة",
          estimated_cost: qty * item.cost_per_unit, supplier: item.supplier || undefined,
        }),
      });
      onSave();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">طلب شراء</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-sm text-amber-800">
          <span className="font-bold">{item.item_name}</span> — المتوفر: {item.quantity} {item.unit} / الحد الأدنى: {item.min_stock} {item.unit}
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">الكمية المطلوبة *</label>
            <input type="number" min="1" step="1" value={qty} onChange={e => setQty(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">السبب</label>
            <input value={reason} onChange={e => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          {item.cost_per_unit > 0 && (
            <p className="text-xs text-gray-500">التكلفة التقديرية: {fmtNum(qty * item.cost_per_unit)} ر.س</p>
          )}
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">إلغاء</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
            {saving ? "جاري الإرسال..." : "إرسال للمشتريات"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ══════════════════════════════════════════════════════════════════
// ─── Modal: Import Transactions from Excel (in / out) ─────────────────────
type TxImportRow = {
  item_name: string; quantity: number; reason: string; reference_no: string;
  cost_per_unit: number; vehicle_no: string; matched: boolean; err?: string;
};

function TxImportModal({ type, items, createdBy, onClose, onDone }: {
  type: "in" | "out"; items: InventoryItem[]; createdBy: string;
  onClose: () => void; onDone: () => void;
}) {
  const isIn = type === "in";
  const [rows, setRows]     = useState<TxImportRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; skipped_details: { name: string; reason: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const itemMap = new Map(items.map(i => [i.item_name.trim().toLowerCase(), i]));
  const [parseErr, setParseErr] = useState<string | null>(null);

  // Detect a column index from header row by matching any keyword (partial, trimmed)
  const detectCol = (header: string[], ...keywords: string[]) => {
    for (let i = 0; i < header.length; i++) {
      const h = String(header[i] ?? "").trim().toLowerCase();
      if (keywords.some(k => h.includes(k.toLowerCase()) || h === k.toLowerCase())) return i;
    }
    return -1;
  };

  const parseFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setParseErr(null);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb      = XLSX.read(ev.target?.result as ArrayBuffer, { type: "array" });
        const ws      = wb.Sheets[wb.SheetNames[0]];
        // Read as raw 2-D array to handle any header encoding
        const grid    = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
        if (grid.length < 2) { setRows([]); setParseErr("الملف فارغ أو لا يحتوي بيانات"); setResult(null); return; }

        const header  = (grid[0] as string[]).map(c => String(c ?? "").trim());
        // Detect columns by keyword — fallback to position
        const dc = (fallback: number, ...kw: string[]) => {
          const i = detectCol(header, ...kw);
          return i !== -1 ? i : fallback;
        };
        const colName    = dc(0, "اسم الصنف", "اسم", "item_name", "name");
        const colQty     = dc(1, "الكمية", "كمية", "quantity", "qty");
        const colCost    = dc(2, "سعر الوحدة", "سعر", "cost");
        const colReason  = dc(isIn ? 3 : 3, "السبب", "reason");
        const colRef     = dc(isIn ? 4 : 4, "رقم المرجع", "مرجع", "reference");
        const colVehicle = dc(isIn ? 5 : 5, "الجهة", "السيارة", "vehicle");

        const defReason = isIn ? "إضافة_يدوية" : "صرف_يدوي";
        const dataRows  = grid.slice(1) as unknown[][];

        const parsed = dataRows.map(r => {
          const name    = String(r[colName]    ?? "").trim();
          const qty     = Number(r[colQty]     ?? 0) || 0;
          const cost    = Number(r[colCost]    ?? 0) || 0;
          const reason  = String(r[colReason]  ?? "").trim() || defReason;
          const ref     = String(r[colRef]     ?? "").trim();
          const vehicle = String(r[colVehicle] ?? "").trim();
          const matched = !!name && itemMap.has(name.toLowerCase());
          let err: string | undefined;
          if (!name)         err = "اسم الصنف فارغ";
          else if (!matched) err = "غير موجود في المخزون";
          else if (qty <= 0) err = "الكمية يجب أن تكون أكبر من صفر";
          return { item_name: name, quantity: qty, reason, reference_no: ref, cost_per_unit: cost, vehicle_no: vehicle, matched, err };
        }).filter(r => r.item_name);

        if (parsed.length === 0) setParseErr("لم يُعثر على بيانات — تأكد أن الملف يحتوي صفوف تحت رأس الجدول");
        setRows(parsed);
        setResult(null);
      } catch {
        setParseErr("تعذّر قراءة الملف — تأكد أنه بصيغة xlsx أو xls");
        setRows([]);
        setResult(null);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const headers = isIn
      ? ["اسم الصنف", "الكمية", "سعر الوحدة", "السبب", "رقم المرجع", "الجهة (السيارة)"]
      : ["اسم الصنف", "الكمية", "سعر الوحدة", "السبب", "رقم المرجع", "الجهة (السيارة)"];
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ...items.slice(0, 3).map(i => [i.item_name, 1, i.cost_per_unit || 0, isIn ? "إضافة_يدوية" : "صرف_يدوي", "", ""]),
    ]);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, isIn ? "الوارد" : "المنصرف");
    XLSX.writeFile(wb, `نموذج_استيراد_${isIn ? "الوارد" : "المنصرف"}.xlsx`);
  };

  const validRows   = rows.filter(r => r.matched && r.quantity > 0);
  const invalidRows = rows.filter(r => !!r.err);

  const doImport = async () => {
    if (!validRows.length) return;
    setSaving(true);
    try {
      const endpoint = isIn
        ? "/api/workshop-inventory/transactions/bulk-in"
        : "/api/workshop-inventory/transactions/bulk-out";
      const res  = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: validRows, created_by: createdBy }),
      });
      const data = await res.json() as { ok: boolean; inserted: number; skipped: number; skipped_details: { name: string; reason: string }[] };
      if (data.ok) { setResult(data); onDone(); }
    } finally { setSaving(false); }
  };

  const clrBg  = isIn ? "bg-emerald-50"  : "bg-red-50";
  const clrIco = isIn ? "text-emerald-600": "text-red-500";
  const clrBtn = isIn ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700";
  const clrQty = isIn ? "text-emerald-600" : "text-red-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${clrBg} flex items-center justify-center`}>
              {isIn ? <ArrowDownCircle size={20} className={clrIco}/> : <ArrowUpCircle size={20} className={clrIco}/>}
            </div>
            <div>
              <h2 className="font-black text-gray-900 text-base">استيراد {isIn ? "الوارد" : "المنصرف"} من Excel</h2>
              <p className="text-xs text-gray-400 mt-0.5">حدد ملف Excel ثم راجع البيانات قبل الحفظ</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100"><X size={18}/></button>
        </div>

        <div className="px-6 py-3 border-b border-gray-50 shrink-0 flex gap-3 flex-wrap items-center">
          <button onClick={() => fileRef.current?.click()}
            className={`flex items-center gap-2 px-4 py-2 ${clrBtn} text-white rounded-xl text-sm font-semibold`}>
            <Upload size={15}/> اختر ملف Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={parseFile}/>
          <button onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            <Download size={15}/> تحميل نموذج فارغ
          </button>
          {rows.length > 0 && (
            <div className="mr-auto flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 text-emerald-600 font-semibold"><CheckCircle size={14}/> {validRows.length} صالح</span>
              {invalidRows.length > 0 && <span className="flex items-center gap-1 text-red-500 font-semibold"><AlertCircle size={14}/> {invalidRows.length} خطأ</span>}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {result ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle size={32} className="text-emerald-600"/>
              </div>
              <h3 className="text-lg font-black text-gray-900">تم الاستيراد بنجاح</h3>
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-3xl font-black text-emerald-600">{result.inserted}</p>
                  <p className="text-xs text-gray-400 mt-1">سجل {isIn ? "وارد" : "منصرف"} أُضيف</p>
                </div>
                {result.skipped > 0 && (
                  <div>
                    <p className="text-3xl font-black text-red-500">{result.skipped}</p>
                    <p className="text-xs text-gray-400 mt-1">صف تجاهله</p>
                  </div>
                )}
              </div>
              {result.skipped_details?.length > 0 && (
                <div className="w-full max-w-sm bg-red-50 rounded-xl p-3 text-xs text-red-700 space-y-1">
                  {result.skipped_details.map((d, i) => (
                    <div key={i} className="flex justify-between gap-2">
                      <span className="font-semibold truncate">{d.name}</span>
                      <span className="text-red-400 shrink-0">{d.reason}</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={onClose} className="px-6 py-2.5 bg-[#103c68] text-white rounded-xl font-semibold text-sm">إغلاق</button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
              <FileSpreadsheet size={40} className="opacity-30"/>
              {parseErr ? (
                <p className="text-sm text-red-500 font-semibold flex items-center gap-1"><AlertCircle size={16}/> {parseErr}</p>
              ) : (
                <p className="text-sm">اختر ملف Excel لمعاينة البيانات</p>
              )}
              <p className="text-xs text-gray-300">الأعمدة: اسم الصنف، الكمية{isIn ? "، سعر الوحدة (اختياري)" : ""} — السبب ورقم المرجع اختياريان</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {["#", "اسم الصنف", "الكمية", "سعر الوحدة", "السبب", "رقم المرجع", "الجهة (السيارة)", "الحالة"].map(h => (
                    <th key={h} className="px-3 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r, i) => (
                  <tr key={i} className={r.err ? "bg-red-50/60" : "hover:bg-gray-50"}>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2.5 font-semibold text-gray-800">{r.item_name || <span className="text-gray-300">—</span>}</td>
                    <td className={`px-3 py-2.5 font-bold ${clrQty}`}>
                      {r.quantity > 0 ? `${isIn ? "+" : "-"}${r.quantity}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{r.cost_per_unit > 0 ? `${r.cost_per_unit} ر.س` : "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500">{fmtReason(r.reason)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{r.reference_no || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400">{r.vehicle_no || "—"}</td>
                    <td className="px-3 py-2.5">
                      {r.err
                        ? <span className="flex items-center gap-1 text-xs text-red-500 font-semibold"><AlertCircle size={12}/> {r.err}</span>
                        : <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold"><CheckCircle size={12}/> صالح</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!result && rows.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between gap-3">
            <p className="text-xs text-gray-400">
              سيتم حفظ <span className="font-bold text-gray-700">{validRows.length}</span> سجل {isIn ? "وارد" : "منصرف"} فقط — الصفوف بالخطأ ستُتجاهل
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">إلغاء</button>
              <button onClick={doImport} disabled={saving || validRows.length === 0}
                className={`flex items-center gap-2 px-5 py-2 ${clrBtn} text-white rounded-xl text-sm font-bold disabled:opacity-50`}>
                {saving ? <RefreshCw size={14} className="animate-spin"/> : isIn ? <ArrowDownCircle size={14}/> : <ArrowUpCircle size={14}/>}
                {saving ? "جاري الحفظ..." : `حفظ ${validRows.length} سجل`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal: Edit a single transaction ────────────────────────────────────────
function TxEditModal({ tx, onClose, onSave }: { tx: Transaction; onClose: () => void; onSave: () => void }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    quantity:      tx.quantity,
    cost_per_unit: tx.cost_per_unit || 0,
    reason:        tx.reason || (tx.type === "in" ? "إضافة_يدوية" : "صرف_يدوي"),
    reference_no:  tx.reference_no || "",
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState("");

  const reasons = tx.type === "in"
    ? ["إضافة_يدوية", "استلام_مشتريات", "رصيد_أولي"]
    : ["صرف_يدوي", "صرف_أمر_عمل"];

  const doSave = async () => {
    if (form.quantity <= 0) { setErr("الكمية يجب أن تكون أكبر من صفر"); return; }
    setSaving(true);
    try {
      const res  = await fetch(`/api/workshop-inventory/transactions/${tx.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, updated_by: user?.name || user?.phone }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) onSave();
      else setErr(data.error || "خطأ في الحفظ");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-black text-gray-900 text-base">تعديل حركة مخزون</h2>
            <p className="text-xs text-gray-400 mt-0.5">{tx.item_name} — {tx.type === "in" ? "وارد" : "منصرف"}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100"><X size={18}/></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">الكمية</label>
            <input type="number" min="0.01" step="0.01" value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: Number(e.target.value) }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
          </div>
          {tx.type === "in" && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">سعر الوحدة (ر.س)</label>
              <input type="number" min="0" step="0.01" value={form.cost_per_unit}
                onChange={e => setForm(f => ({ ...f, cost_per_unit: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">السبب</label>
            <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              {reasons.map(r => <option key={r} value={r}>{fmtReason(r)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">رقم المرجع</label>
            <input value={form.reference_no} onChange={e => setForm(f => ({ ...f, reference_no: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="اختياري"/>
          </div>
          {err && <p className="text-xs text-red-500 font-semibold bg-red-50 px-3 py-2 rounded-xl">{err}</p>}
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">إلغاء</button>
          <button onClick={doSave} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-semibold disabled:opacity-50">
            {saving ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>}
            {saving ? "جاري الحفظ..." : "حفظ التعديل"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkshopInventoryPage() {
  const { user } = useAuth();
  const [tab, setTab]         = useRememberedState<"available" | "in" | "out">("workshop-inventory-tab", "available");
  const [items, setItems]     = useState<InventoryItem[]>([]);
  const [txs, setTxs]         = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [search, setSearch]   = useRememberedState("workshop-inventory-search", "");
  const [catFilter, setCatFilter] = useRememberedState("workshop-inventory-category-filter", "all");
  const [stockFilter, setStockFilter] = useRememberedState<"all" | "zero" | "low">("workshop-inventory-stock-filter", "all");
  const [txSearch, setTxSearch]   = useRememberedState("workshop-inventory-transaction-search", "");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [addOpen, setAddOpen]     = useState(false);
  const [editItem, setEditItem]   = useState<InventoryItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<{ item: InventoryItem; type: "in" | "out" } | null>(null);
  const [purchaseItem, setPurchaseItem] = useState<InventoryItem | null>(null);
  const [deleteId, setDeleteId]   = useState<number | null>(null);
  const [selectedIds, setSelectedIds]       = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting]     = useState(false);
  const [importType, setImportType] = useState<"in" | "out" | null>(null);
  const [editTx, setEditTx]       = useState<Transaction | null>(null);
  const [deleteTxId, setDeleteTxId] = useState<number | null>(null);
  const [selectedTxIds, setSelectedTxIds]   = useState<Set<number>>(new Set());
  const [bulkDeletingTx, setBulkDeletingTx] = useState(false);
  const [txCounts, setTxCounts] = useState<{ in: number; out: number }>({ in: 0, out: 0 });

  const loadTxCounts = useCallback(() => {
    fetch("/api/workshop-inventory/transactions/counts")
      .then(r => r.json())
      .then(d => setTxCounts({ in: d.in ?? 0, out: d.out ?? 0 }))
      .catch(() => {});
  }, []);

  const loadItems = useCallback((silent?: boolean) => {
    if (!silent) setLoading(true);
    fetch("/api/workshop-inventory", { cache: "no-store" }).then(r => r.json()).then(d => {
      setItems(Array.isArray(d) ? d : []);
      if (!silent) setLoading(false);
    }).catch(() => { if (!silent) setLoading(false); });
  }, []);

  const loadTxs = useCallback((type?: "in" | "out", silent?: boolean) => {
    if (!silent) setTxLoading(true);
    const q = type ? `?type=${type}` : "";
    fetch(`/api/workshop-inventory/transactions${q}`).then(r => r.json()).then(d => {
      setTxs(Array.isArray(d) ? d : []);
      if (!silent) setTxLoading(false);
    }).catch(() => { if (!silent) setTxLoading(false); });
  }, []);

  useEffect(() => { loadItems(); loadTxCounts(); }, [loadItems, loadTxCounts]);

  useEffect(() => {
    if (tab === "in")  loadTxs("in");
    if (tab === "out") loadTxs("out");
    setSelectedTxIds(new Set()); // reset on tab switch
  }, [tab, loadTxs]);

  const doBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`حذف ${selectedIds.size} صنف؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    const toDelete = new Set(selectedIds);
    // optimistic: remove immediately
    setItems(prev => prev.filter(i => !toDelete.has(i.id)));
    setSelectedIds(new Set());
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/workshop-inventory/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...toDelete] }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      alert("فشل حذف الأصناف");
      loadItems(); // restore real state on error
    }
    finally { setBulkDeleting(false); }
  };

  const doDelete = async (id: number) => {
    // optimistic: remove immediately
    setItems(prev => prev.filter(i => i.id !== id));
    setDeleteId(null);
    const res = await fetch(`/api/workshop-inventory/${id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("فشل الحذف");
      loadItems();
    }
  };

  const doDeleteTx = async (id: number) => {
    const removedType = txs.find(t => t.id === id)?.type as "in" | "out" | undefined;
    // optimistic: remove immediately + decrement count
    setTxs(prev => prev.filter(t => t.id !== id));
    if (removedType) setTxCounts(prev => ({ ...prev, [removedType]: Math.max(0, prev[removedType] - 1) }));
    setDeleteTxId(null);
    const res = await fetch(`/api/workshop-inventory/transactions/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleted_by: user?.name || user?.phone }),
    });
    if (!res.ok) {
      alert("فشل الحذف");
      if (tab === "in" || tab === "out") loadTxs(tab);
      loadTxCounts();
    }
  };

  const doBulkDeleteTx = async () => {
    if (selectedTxIds.size === 0) return;
    if (!confirm(`حذف ${selectedTxIds.size} سجل؟ سيتم عكس تأثيرها على رصيد المخزون. لا يمكن التراجع.`)) return;
    const toDelete = new Set(selectedTxIds);
    const deletedTxs = txs.filter(t => toDelete.has(t.id));
    const inDelta  = deletedTxs.filter(t => t.type === "in").length;
    const outDelta = deletedTxs.filter(t => t.type === "out").length;
    // optimistic: remove immediately + decrement counts
    setTxs(prev => prev.filter(t => !toDelete.has(t.id)));
    setTxCounts(prev => ({ in: Math.max(0, prev.in - inDelta), out: Math.max(0, prev.out - outDelta) }));
    setSelectedTxIds(new Set());
    setBulkDeletingTx(true);
    try {
      const res = await fetch("/api/workshop-inventory/transactions/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...toDelete], deleted_by: user?.name || user?.phone }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      alert("فشل حذف السجلات");
      if (tab === "in" || tab === "out") loadTxs(tab);
      loadTxCounts();
    }
    finally { setBulkDeletingTx(false); }
  };

  // ── Export helpers ─────────────────────────────────────────────────────────
  const exportInventory = () => {
    window.open("/api/workshop-inventory/export", "_blank");
  };
  const exportTxs = (type?: "in" | "out") => {
    const q = type ? `?type=${type}` : "";
    window.open(`/api/workshop-inventory/transactions/export${q}`, "_blank");
  };

  // ── Import Excel ───────────────────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("created_by", user?.name || user?.phone || "");
      const res = await fetch("/api/workshop-inventory/import", { method: "POST", body: fd });
      const data = await res.json() as { ok?: boolean; inserted?: number; skipped?: number; error?: string };
      if (data.ok) {
        setImportMsg({ ok: true, text: `✅ تم الاستيراد: ${data.inserted} صنف. تجاهل: ${data.skipped ?? 0}` });
        loadItems();
      } else {
        setImportMsg({ ok: false, text: `❌ ${data.error || "خطأ في الاستيراد"}` });
      }
    } catch {
      setImportMsg({ ok: false, text: "❌ فشل الاتصال بالخادم" });
    } finally { setImporting(false); }
  };

  // ── KPI ──────────────────────────────────────────────────────────────────
  const totalValue  = items.reduce((s, i) => s + i.quantity * i.cost_per_unit, 0);
  const lowCount    = items.filter(i => statusOf(i) === "low").length;
  const zeroCount   = items.filter(i => statusOf(i) === "zero").length;
  const allCategories = [...new Set(items.map(i => i.category))].sort();

  // ── Filtered lists ────────────────────────────────────────────────────────
  const filteredItems = items.filter(i => {
    const matchSearch = !search || i.item_name.includes(search) || (i.item_code || "").includes(search);
    const matchCat    = catFilter === "all" || i.category === catFilter;
    const matchStock  = stockFilter === "all" || statusOf(i) === stockFilter;
    return matchSearch && matchCat && matchStock;
  });

  const filteredTxs = txs.filter(t =>
    !txSearch || t.item_name.includes(txSearch) || (t.reason || "").includes(txSearch) || (t.reference_no || "").includes(txSearch)
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Boxes size={22} className="text-blue-600"/>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">مستودع ورشة النقليات</h1>
            <p className="text-sm text-gray-500">{items.length} صنف مسجل</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { loadItems(); if (tab !== "available") loadTxs(tab as "in" | "out"); }}
            className="flex items-center gap-1.5 px-3 py-2 text-gray-600 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
            <RefreshCw size={15}/> تحديث
          </button>
          {/* Import */}
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}
            className="flex items-center gap-1.5 px-3 py-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl text-sm hover:bg-emerald-100 disabled:opacity-50">
            <Upload size={15}/>{importing ? "جاري الاستيراد..." : "استيراد Excel"}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport}/>
          {/* Export dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-3 py-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-xl text-sm hover:bg-blue-100">
              <Download size={15}/> تصدير Excel <ChevronDown size={13}/>
            </button>
            <div className="absolute left-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-30 hidden group-hover:block">
              <button onClick={exportInventory}
                className="w-full text-right px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-t-xl">
                <FileSpreadsheet size={14} className="text-blue-500"/> قائمة المخزون
              </button>
              <button onClick={() => exportTxs()}
                className="w-full text-right px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <FileSpreadsheet size={14} className="text-emerald-500"/> كل الحركات
              </button>
              <button onClick={() => exportTxs("in")}
                className="w-full text-right px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <ArrowDownCircle size={14} className="text-emerald-500"/> الوارد فقط
              </button>
              <button onClick={() => exportTxs("out")}
                className="w-full text-right px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 rounded-b-xl">
                <ArrowUpCircle size={14} className="text-red-500"/> المنصرف فقط
              </button>
            </div>
          </div>
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
            <Plus size={16}/> إضافة صنف
          </button>
        </div>
      </div>

      {/* Import result message */}
      {importMsg && (
        <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-between ${importMsg.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          <span>{importMsg.text}</span>
          <button onClick={() => setImportMsg(null)} className="opacity-60 hover:opacity-100"><X size={16}/></button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">إجمالي الأصناف</p>
          <p className="text-2xl font-bold text-gray-900">{items.length}</p>
          <p className="text-xs text-gray-400 mt-1">صنف في المستودع</p>
        </div>
        <button
          onClick={() => { setStockFilter(f => f === "zero" ? "all" : "zero"); setTab("available"); }}
          className={`rounded-2xl p-4 border shadow-sm text-right transition-all w-full ${stockFilter === "zero" ? "ring-2 ring-red-400" : ""} ${zeroCount > 0 ? "bg-red-50 border-red-100 hover:bg-red-100" : "bg-white border-gray-100 hover:bg-gray-50"}`}>
          <p className="text-xs text-gray-400 mb-1">نفذت</p>
          <p className={`text-2xl font-bold ${zeroCount > 0 ? "text-red-600" : "text-gray-400"}`}>{zeroCount}</p>
          <p className="text-xs text-gray-400 mt-1">صنف كمية صفر</p>
        </button>
        <button
          onClick={() => { setStockFilter(f => f === "low" ? "all" : "low"); setTab("available"); }}
          className={`rounded-2xl p-4 border shadow-sm text-right transition-all w-full ${stockFilter === "low" ? "ring-2 ring-amber-400" : ""} ${lowCount > 0 ? "bg-amber-50 border-amber-100 hover:bg-amber-100" : "bg-white border-gray-100 hover:bg-gray-50"}`}>
          <p className="text-xs text-gray-400 mb-1">منخفض المخزون</p>
          <p className={`text-2xl font-bold ${lowCount > 0 ? "text-amber-600" : "text-gray-400"}`}>{lowCount}</p>
          <p className="text-xs text-gray-400 mt-1">أقل من الحد الأدنى</p>
        </button>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">القيمة الإجمالية</p>
          <p className="text-2xl font-bold text-blue-700">{fmtNum(Math.round(totalValue))}</p>
          <p className="text-xs text-gray-400 mt-1">ريال سعودي</p>
        </div>
      </div>

      {/* Low stock alert banner */}
      {(lowCount + zeroCount) > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0"/>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">تنبيه مخزون</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {zeroCount > 0 && <span className="font-medium">{zeroCount} صنف نفذ • </span>}
              {lowCount > 0 && <span className="font-medium">{lowCount} صنف منخفض</span>}
              {" — يمكنك إرسال طلب شراء مباشرة من جدول المتوفر"}
            </p>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-100 bg-gray-50 p-1 gap-1">
          {[
            { id: "available", label: "المتوفر",  icon: Boxes },
            { id: "in",  label: "الوارد",  icon: ArrowDownCircle, count: txCounts.in,  color: "bg-emerald-100 text-emerald-700" },
            { id: "out", label: "المنصرف", icon: ArrowUpCircle,   count: txCounts.out, color: "bg-red-100 text-red-700" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as typeof tab)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-sm font-semibold transition-all ${tab === t.id ? "bg-white text-[#103c68] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              <t.icon size={16}/>{t.label}
              {(t.count ?? 0) > 0 && (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${t.color}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: المتوفر ── */}
        {tab === "available" && (
          <div className="p-4">
            {/* Filters */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-40">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو الكود..."
                  className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
              </div>
              <div className="relative">
                <Filter size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                  className="pr-8 pl-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white appearance-none">
                  <option value="all">كل الفئات</option>
                  {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
              </div>
              <button onClick={() => setStockFilter(f => f === "zero" ? "all" : "zero")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${stockFilter === "zero" ? "bg-red-600 text-white border-red-600" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"}`}>
                🔴 نفذ {stockFilter === "zero" && `(${filteredItems.length})`}
              </button>
              <button onClick={() => setStockFilter(f => f === "low" ? "all" : "low")}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${stockFilter === "low" ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100"}`}>
                ⚠️ منخفض {stockFilter === "low" && `(${filteredItems.length})`}
              </button>
              {stockFilter !== "all" && (
                <button onClick={() => setStockFilter("all")}
                  className="px-3 py-2 rounded-xl text-sm text-gray-500 border border-gray-200 hover:bg-gray-50">
                  ✕ إلغاء الفلتر
                </button>
              )}
              {selectedIds.size > 0 && (
                <>
                  <button onClick={() => setSelectedIds(new Set())}
                    className="px-3 py-2 rounded-xl text-sm text-gray-500 border border-gray-200 hover:bg-gray-50">
                    إلغاء التحديد
                  </button>
                  <button onClick={doBulkDelete} disabled={bulkDeleting}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                    <Trash2 size={14}/>{bulkDeleting ? "جارٍ الحذف…" : `حذف المحدد (${selectedIds.size})`}
                  </button>
                </>
              )}
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-12">
                <PackageX size={40} className="text-gray-300 mx-auto mb-3"/>
                <p className="text-gray-400 text-sm">لا توجد أصناف</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-3 w-8">
                        <input type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                          checked={filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.id))}
                          onChange={e => {
                            if (e.target.checked) setSelectedIds(new Set(filteredItems.map(i => i.id)));
                            else setSelectedIds(new Set());
                          }}
                        />
                      </th>
                      {["رقم الصنف", "الصنف", "الفئة", "المتوفر", "الحد الأدنى", "تكلفة الوحدة", "الإجمالي", "الحالة", "آخر تعديل", "إجراء"].map(h => (
                        <th key={h} className="px-3 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredItems.map(item => {
                      const st = statusOf(item);
                      return (
                        <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(item.id) ? "bg-red-50/50" : ""}`}>
                          <td className="px-3 py-3 w-8">
                            <input type="checkbox"
                              className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                              checked={selectedIds.has(item.id)}
                              onChange={e => {
                                setSelectedIds(prev => {
                                  const next = new Set(prev);
                                  e.target.checked ? next.add(item.id) : next.delete(item.id);
                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td className="px-3 py-3">
                            {item.item_code
                              ? <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.item_code}</span>
                              : <span className="text-xs text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-semibold text-gray-800 text-sm">{item.item_name}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.category}</span>
                          </td>
                          <td className="px-3 py-3 font-bold text-gray-900">
                            {fmtNum(item.quantity)} <span className="text-xs text-gray-400 font-normal">{item.unit}</span>
                          </td>
                          <td className="px-3 py-3 text-gray-500 text-xs">
                            {item.min_stock > 0 ? `${fmtNum(item.min_stock)} ${item.unit}` : "—"}
                          </td>
                          <td className="px-3 py-3 text-gray-500 text-xs">
                            {item.cost_per_unit > 0 ? `${fmtNum(item.cost_per_unit)} ر.س` : "—"}
                          </td>
                          <td className="px-3 py-3 text-xs font-semibold text-gray-700">
                            {item.cost_per_unit > 0 ? `${fmtNum(Math.round(item.quantity * item.cost_per_unit))} ر.س` : "—"}
                          </td>
                          <td className="px-3 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_CLS[st]}`}>{STATUS_LBL[st]}</span>
                          </td>
                          <td className="px-3 py-3">
                            {item.updated_by ? (
                              <div className="leading-tight">
                                <span className="text-xs font-semibold text-gray-700 block">{item.updated_by}</span>
                                <span className="text-[10px] text-gray-400">{fmtDate(item.last_updated)}</span>
                              </div>
                            ) : <span className="text-xs text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => setAdjustItem({ item, type: "in" })} title="إضافة وارد"
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                                <ArrowDownCircle size={16}/>
                              </button>
                              <button onClick={() => setAdjustItem({ item, type: "out" })} title="صرف منصرف"
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                <ArrowUpCircle size={16}/>
                              </button>
                              {(st === "low" || st === "zero") && (
                                <button onClick={() => setPurchaseItem(item)} title="طلب شراء"
                                  className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                                  <ShoppingCart size={16}/>
                                </button>
                              )}
                              <button onClick={() => setEditItem(item)} title="تعديل"
                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                                <Pencil size={15}/>
                              </button>
                              <button onClick={() => setDeleteId(item.id)} title="حذف"
                                className="p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors">
                                <Trash2 size={15}/>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: الوارد / المنصرف ── */}
        {(tab === "in" || tab === "out") && (
          <div className="p-4">
            <div className="flex gap-2 mb-4 flex-wrap items-center">
              <div className="relative flex-1 min-w-40">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input value={txSearch} onChange={e => setTxSearch(e.target.value)}
                  placeholder="ابحث بالصنف أو السبب أو المرجع..."
                  className="w-full pr-9 pl-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"/>
              </div>
              {tab === "in" && (
                <button onClick={() => setImportType("in")}
                  className="flex items-center gap-1.5 px-3 py-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-semibold hover:bg-emerald-100">
                  <Upload size={14}/> استيراد من Excel
                </button>
              )}
              {tab === "out" && (
                <button onClick={() => setImportType("out")}
                  className="flex items-center gap-1.5 px-3 py-2 text-red-700 bg-red-50 border border-red-200 rounded-xl text-sm font-semibold hover:bg-red-100">
                  <Upload size={14}/> استيراد من Excel
                </button>
              )}
              <button onClick={() => exportTxs(tab as "in" | "out")}
                className="flex items-center gap-1.5 px-3 py-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-xl text-sm hover:bg-blue-100">
                <Download size={14}/> تصدير
              </button>
              {selectedTxIds.size > 0 && (
                <>
                  <button onClick={() => setSelectedTxIds(new Set())}
                    className="px-3 py-2 rounded-xl text-sm text-gray-500 border border-gray-200 hover:bg-gray-50">
                    إلغاء التحديد
                  </button>
                  <button onClick={doBulkDeleteTx} disabled={bulkDeletingTx}
                    className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60">
                    <Trash2 size={14}/>{bulkDeletingTx ? "جارٍ الحذف…" : `حذف المحدد (${selectedTxIds.size})`}
                  </button>
                </>
              )}
            </div>

            {txLoading ? (
              <div className="text-center py-12 text-gray-400">جاري التحميل...</div>
            ) : filteredTxs.length === 0 ? (
              <div className="text-center py-12">
                <TrendingDown size={40} className="text-gray-300 mx-auto mb-3"/>
                <p className="text-gray-400 text-sm">لا توجد حركات مسجلة بعد</p>
                {tab === "in" && <p className="text-gray-300 text-xs mt-1">ستظهر هنا كل إضافات المخزون</p>}
                {tab === "out" && <p className="text-gray-300 text-xs mt-1">ستظهر هنا كل عمليات الصرف</p>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-3 py-3 w-8">
                        <input type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-red-600 cursor-pointer"
                          checked={filteredTxs.length > 0 && filteredTxs.every(t => selectedTxIds.has(t.id))}
                          onChange={e => {
                            if (e.target.checked) setSelectedTxIds(new Set(filteredTxs.map(t => t.id)));
                            else setSelectedTxIds(new Set());
                          }}
                        />
                      </th>
                      {["التاريخ", "رقم الصنف", "الجهة", "الصنف", "الكمية", "سعر الوحدة", "الإجمالي", "السبب", "المرجع", "بواسطة", "إجراء"].map(h => (
                        <th key={h} className="px-3 py-3 text-right text-xs font-semibold text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredTxs.map(tx => (
                      <tr key={tx.id} className={`hover:bg-gray-50 transition-colors ${selectedTxIds.has(tx.id) ? "bg-red-50/50" : ""}`}>
                        <td className="px-3 py-3">
                          <input type="checkbox"
                            className="w-3.5 h-3.5 rounded accent-red-600 cursor-pointer"
                            checked={selectedTxIds.has(tx.id)}
                            onChange={e => setSelectedTxIds(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(tx.id) : next.delete(tx.id);
                              return next;
                            })}
                          />
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtDate(tx.created_at)}</td>
                        <td className="px-3 py-3">
                          {tx.item_code
                            ? <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{tx.item_code}</span>
                            : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500 font-mono">{tx.vehicle_no || "—"}</td>
                        <td className="px-3 py-3 font-semibold text-gray-800">{tx.item_name}</td>
                        <td className="px-3 py-3">
                          <span className={`font-bold ${tx.type === "in" ? "text-emerald-600" : "text-red-600"}`}>
                            {tx.type === "in" ? "+" : "-"}{fmtNum(tx.quantity)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-600">
                          {tx.cost_per_unit > 0 ? `${fmtNum(tx.cost_per_unit)} ر.س` : "—"}
                        </td>
                        <td className="px-3 py-3 text-xs font-semibold text-gray-700">
                          {tx.cost_per_unit > 0 ? `${fmtNum(Math.round(tx.quantity * tx.cost_per_unit))} ر.س` : "—"}
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-500">{fmtReason(tx.reason)}</td>
                        <td className="px-3 py-3 text-xs text-gray-400">{tx.reference_no || "—"}</td>
                        <td className="px-3 py-3 text-xs text-gray-400">{tx.created_by || "—"}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditTx(tx)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="تعديل">
                              <Pencil size={13}/>
                            </button>
                            <button onClick={() => setDeleteTxId(tx.id)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="حذف">
                              <Trash2 size={13}/>
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
        )}
      </div>

      {/* ── Modals ── */}
      {(addOpen || editItem) && (
        <ItemModal item={editItem || undefined}
          onClose={() => { setAddOpen(false); setEditItem(null); }}
          onSave={() => { setAddOpen(false); setEditItem(null); loadItems(true); }}
        />
      )}
      {adjustItem && (
        <AdjustModal item={adjustItem.item} defaultType={adjustItem.type}
          onClose={() => setAdjustItem(null)}
          onSave={() => { setAdjustItem(null); loadItems(true); if (tab === "in" || tab === "out") loadTxs(tab); }}
        />
      )}
      {purchaseItem && (
        <PurchaseReqModal item={purchaseItem}
          onClose={() => setPurchaseItem(null)}
          onSave={() => { setPurchaseItem(null); alert("تم إرسال طلب الشراء للمشتريات ✅"); }}
        />
      )}
      {importType && (
        <TxImportModal
          type={importType}
          items={items}
          createdBy={user?.name || user?.phone || ""}
          onClose={() => setImportType(null)}
          onDone={() => { loadItems(); loadTxs(importType); }}
        />
      )}
      {editTx && (
        <TxEditModal
          tx={editTx}
          onClose={() => setEditTx(null)}
          onSave={() => { setEditTx(null); loadItems(); if (tab === "in" || tab === "out") loadTxs(tab as "in" | "out"); }}
        />
      )}

      {/* ── Delete item confirm ── */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">حذف الصنف</h3>
            <p className="text-sm text-gray-500 mb-5">هل أنت متأكد من حذف هذا الصنف نهائياً؟</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">إلغاء</button>
              <button onClick={() => doDelete(deleteId)} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700">حذف</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete transaction confirm ── */}
      {deleteTxId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">حذف الحركة</h3>
            <p className="text-sm text-gray-500 mb-1">هل أنت متأكد من حذف هذه الحركة؟</p>
            <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mb-5">
              ⚠️ سيتم عكس تأثيرها على رصيد المخزون تلقائياً
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTxId(null)} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">إلغاء</button>
              <button onClick={() => doDeleteTx(deleteTxId)} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700">
                حذف وعكس الرصيد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
