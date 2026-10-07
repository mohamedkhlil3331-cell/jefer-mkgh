import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronDown, Info } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const API = import.meta.env.BASE_URL?.replace(/\/$/, "").replace("/erp", "") + "/api";

interface TableDef {
  key: string;
  hint: string;
  columns: string[];
}

interface ImportResult {
  total: number;
  inserted: number;
  skipped: number;
  errors: string[];
  syncedToSupabase: number;
  syncErrors: string[];
  mappedColumns: { header: string; dbCol: string }[];
}

const TABLE_LABELS: Record<string, string> = {
  fleet_vehicles:    "السيارات (fleet_vehicles)",
  purchase_invoices: "فواتير المشتريات (purchase_invoices)",
  workshop_inventory:"مستودع الورشة (workshop_inventory)",
  trips:             "سجل الرحلات (trips)",
  maintenance_logs:  "سجل الصيانة (maintenance_logs)",
};

export default function ExcelImportPage() {
  const { token } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tables, setTables] = useState<TableDef[]>([]);
  const [tablesLoaded, setTablesLoaded] = useState(false);
  const [selectedTable, setSelectedTable] = useState("");
  const [file, setFile]     = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult]  = useState<ImportResult | null>(null);
  const [error, setError]    = useState("");
  const [dragging, setDragging] = useState(false);

  async function loadTables() {
    if (tablesLoaded) return;
    try {
      const r = await fetch(`${API}/admin/excel-tables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) { setTables(await r.json()); setTablesLoaded(true); }
    } catch { /* ignore */ }
  }

  function handleFile(f: File) {
    if (!f.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError("يُقبل فقط ملفات Excel أو CSV"); return;
    }
    setFile(f); setResult(null); setError("");
  }

  async function doImport() {
    if (!file || !selectedTable) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const form = new FormData();
      form.append("table", selectedTable);
      form.append("file", file);
      const r = await fetch(`${API}/admin/excel-import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "حدث خطأ"); }
      else { setResult(data); }
    } catch (e) {
      setError("تعذّر الاتصال بالخادم");
    } finally { setLoading(false); }
  }

  const currentTable = tables.find(t => t.key === selectedTable);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-3xl mx-auto p-4 sm:p-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
            <FileSpreadsheet className="text-emerald-600" size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground">استيراد بيانات Excel</h1>
            <p className="text-sm text-muted-foreground">رفع ملفات Excel لاستيراد البيانات مباشرةً إلى قاعدة البيانات</p>
          </div>
        </div>

        {/* Step 1 — pick table */}
        <div className="bg-card border border-border rounded-2xl p-5 mb-4">
          <p className="text-sm font-bold text-foreground mb-3">① اختر الجدول المستهدف</p>
          <div className="relative">
            <select
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-background appearance-none focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={selectedTable}
              onChange={e => { setSelectedTable(e.target.value); setResult(null); setError(""); }}
              onClick={loadTables}
            >
              <option value="">-- اختر الجدول --</option>
              {(tablesLoaded ? tables : Object.entries(TABLE_LABELS).map(([key]) => ({ key, hint: "", columns: [] }))).map(t => (
                <option key={t.key} value={t.key}>{TABLE_LABELS[t.key] || t.key}</option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {currentTable && (
            <div className="mt-3 flex gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
              <Info size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">الأعمدة المتوقعة: </span>
                {currentTable.hint}
              </div>
            </div>
          )}
        </div>

        {/* Step 2 — upload file */}
        <div className="bg-card border border-border rounded-2xl p-5 mb-4">
          <p className="text-sm font-bold text-foreground mb-3">② ارفع ملف Excel أو CSV</p>

          <div
            className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer
              ${dragging ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20" : "border-border hover:border-emerald-300"}
              ${file ? "bg-emerald-50/50 dark:bg-emerald-950/10" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              {file ? (
                <>
                  <FileSpreadsheet size={32} className="text-emerald-500" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setFile(null); setResult(null); }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    إزالة الملف
                  </button>
                </>
              ) : (
                <>
                  <Upload size={32} className="text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-foreground">اسحب الملف هنا أو اضغط للاختيار</p>
                    <p className="text-xs text-muted-foreground mt-1">xlsx · xls · csv — حجم أقصى 20 ميغابايت</p>
                  </div>
                </>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        </div>

        {/* Import button */}
        <button
          disabled={!file || !selectedTable || loading}
          onClick={doImport}
          className="w-full py-3 rounded-xl font-black text-sm bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "جارٍ الاستيراد…" : "③ استيراد البيانات"}
        </button>

        {/* Error */}
        {error && (
          <div className="mt-4 flex gap-2 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-300">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mt-4 bg-card border border-border rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-emerald-500" size={22} />
              <p className="font-black text-foreground">نتيجة الاستيراد</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "إجمالي الصفوف",      val: result.total,             color: "blue"   },
                { label: "أُدخلت في النظام",   val: result.inserted,          color: "emerald"},
                { label: "تم تخطّيها",         val: result.skipped,           color: "amber"  },
                { label: "✅ حُفظت في Supabase", val: result.syncedToSupabase, color: "teal"   },
              ].map(({ label, val, color }) => (
                <div key={label} className={`rounded-xl p-3 text-center bg-${color}-50 dark:bg-${color}-950/20`}>
                  <p className={`text-2xl font-black text-${color}-700 dark:text-${color}-400`}>{val}</p>
                  <p className={`text-xs mt-0.5 text-${color}-600 dark:text-${color}-300`}>{label}</p>
                </div>
              ))}
            </div>

            {result.syncedToSupabase > 0 && result.syncErrors.length === 0 && (
              <div className="flex gap-2 p-3 bg-teal-50 dark:bg-teal-950/20 rounded-xl text-xs text-teal-800 dark:text-teal-300">
                <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
                <span>البيانات محفوظة في Supabase — ستبقى بعد أي إعادة نشر أو تحديث للسيرفر</span>
              </div>
            )}

            {result.syncErrors.length > 0 && (
              <div className="flex gap-2 p-3 bg-red-50 dark:bg-red-950/20 rounded-xl text-xs text-red-700 dark:text-red-300">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>تحذير: بعض الصفوف لم تُحفظ في Supabase — حاول الاستيراد مرة أخرى</span>
              </div>
            )}

            {result.mappedColumns.length > 0 && (
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-2">الأعمدة التي تم ربطها تلقائياً:</p>
                <div className="flex flex-wrap gap-2">
                  {result.mappedColumns.map(m => (
                    <span key={m.dbCol} className="text-xs bg-muted rounded-lg px-2 py-1">
                      <span className="text-muted-foreground">{m.header}</span>
                      <span className="text-foreground font-bold mx-1">→</span>
                      <span className="text-foreground">{m.dbCol}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div>
                <p className="text-xs font-bold text-red-600 mb-2">أخطاء ({result.errors.length}):</p>
                <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-700 dark:text-red-300">{e}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tips */}
        <div className="mt-6 p-4 bg-muted/40 rounded-xl text-xs text-muted-foreground space-y-1.5">
          <p className="font-bold text-foreground text-sm mb-2">ملاحظات هامة</p>
          <p>• الأعمدة يُتعرّف عليها تلقائياً بغض النظر عن التسمية (عربي أو إنجليزي)</p>
          <p>• السيارات: تُتجاهل إذا كانت اللوحة موجودة مسبقاً (INSERT OR IGNORE)</p>
          <p>• مستودع الورشة: إذا كانت القطعة موجودة، تُضاف الكمية الجديدة للكمية الحالية</p>
          <p>• الفواتير والرحلات والصيانة: تُضاف دائماً كصفوف جديدة</p>
          <p>• البيانات تُحفظ في Supabase فوراً وتبقى عند إعادة النشر</p>
        </div>
      </div>
    </div>
  );
}
