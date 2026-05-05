import { useEffect, useState } from "react";
import { RefreshCw, Download, Upload, ExternalLink, Table, CheckCircle, AlertCircle } from "lucide-react";

interface SheetMeta { gid: string; name: string; description: string; }
interface SheetData { gid: string; headers: string[]; rows: Record<string, string>[]; count: number; }

function exportCSV(data: SheetData, name: string) {
  const csv = [data.headers.join(","), ...data.rows.map(r => data.headers.map(h => `"${(r[h] || "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `${name}-${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

export default function GoogleSheetsPage() {
  const [sheets, setSheets] = useState<SheetMeta[]>([]);
  const [activeGid, setActiveGid] = useState<string | null>(null);
  const [data, setData] = useState<SheetData | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; message: string } | null>(null);
  const SHEET_URL = "https://docs.google.com/spreadsheets/d/1yqIRQPMo2_dXUfzWLcyO2WKkjN83e5Wko5a3ZdtdTtU/edit";

  useEffect(() => {
    fetch("/api/sheets").then(r => r.json()).then(d => { setSheets(d); if (d.length > 0) loadSheet(d[0].gid); });
  }, []);

  const loadSheet = async (gid: string) => {
    setActiveGid(gid); setLoadingSheet(true); setData(null); setImportResult(null);
    const r = await fetch(`/api/sheets/${gid}`);
    const d = await r.json();
    setData(d); setLoadingSheet(false);
  };

  const importData = async (gid: string) => {
    setImporting(true); setImportResult(null);
    const r = await fetch(`/api/sheets/${gid}/import`, { method: "POST" });
    const d = await r.json();
    setImportResult(d); setImporting(false);
  };

  const activeSheet = sheets.find(s => s.gid === activeGid);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">بيانات جوجل شيت</h1>
          <p className="text-sm text-gray-500 mt-0.5">استعراض واستيراد بيانات MKGH من جوجل شيت</p>
        </div>
        <a href={SHEET_URL} target="_blank" rel="noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 shadow-sm">
          <ExternalLink size={14} />فتح في جوجل شيت
        </a>
      </div>

      {/* Sheet tabs */}
      <div className="flex gap-2 flex-wrap">
        {sheets.map(s => (
          <button key={s.gid} onClick={() => loadSheet(s.gid)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
              activeGid === s.gid
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}>
            <Table size={14} />{s.name}
          </button>
        ))}
      </div>

      {/* Sheet info card */}
      {activeSheet && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Table size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-medium text-blue-800">{activeSheet.name}</div>
            <div className="text-sm text-blue-600 mt-0.5">{activeSheet.description}</div>
          </div>
          {data && <div className="text-sm font-bold text-blue-700">{data.count} سجل</div>}
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border ${importResult.imported > 0 ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
          {importResult.imported > 0 ? <CheckCircle size={18} className="text-green-600" /> : <AlertCircle size={18} className="text-yellow-600" />}
          <span className={`text-sm font-medium ${importResult.imported > 0 ? "text-green-700" : "text-yellow-700"}`}>{importResult.message}</span>
        </div>
      )}

      {/* Data table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="text-sm font-semibold text-gray-700">
            {loadingSheet ? "جاري التحميل..." : data ? `${data.count} سجل` : "اختر ورقة"}
          </div>
          <div className="flex gap-2">
            <button onClick={() => activeGid && loadSheet(activeGid)} disabled={loadingSheet}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw size={13} className={loadingSheet ? "animate-spin" : ""} />تحديث
            </button>
            <button onClick={() => data && activeSheet && exportCSV(data, activeSheet.name)} disabled={!data || loadingSheet}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
              <Download size={13} />تصدير CSV
            </button>
            {activeGid === "1937499220" && (
              <button onClick={() => importData(activeGid)} disabled={importing || loadingSheet}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                <Upload size={13} className={importing ? "animate-spin" : ""} />
                {importing ? "جاري الاستيراد..." : "استيراد إلى النظام"}
              </button>
            )}
          </div>
        </div>

        {loadingSheet ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Table size={40} className="mx-auto mb-3 opacity-30" />
            <p>لا توجد بيانات</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">#</th>
                  {data.headers.map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                    {data.headers.map(h => (
                      <td key={h} className="px-4 py-2.5 text-gray-700 whitespace-nowrap max-w-48 truncate" title={row[h]}>
                        {row[h] || <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
        <h4 className="font-semibold text-gray-700 mb-3">تعليمات الاستخدام</h4>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">1</span>
            <span>اختر الورقة التي تريد استعراضها من التبويبات أعلاه</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">2</span>
            <span>اضغط <b>تصدير CSV</b> لتحميل بيانات الورقة على جهازك</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">3</span>
            <span>لورقة الطلبات: اضغط <b>استيراد إلى النظام</b> لنقل الطلبات من جوجل شيت إلى قاعدة بيانات MKGH تلقائياً (يتخطى المكررة)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5">4</span>
            <span>لتعديل البيانات مباشرة، اضغط <b>فتح في جوجل شيت</b> ثم أعِد الاستيراد</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
