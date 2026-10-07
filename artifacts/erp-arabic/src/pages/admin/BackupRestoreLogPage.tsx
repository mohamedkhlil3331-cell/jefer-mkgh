import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Check, Clock3, Download, ExternalLink, RefreshCw, ShieldAlert, Upload } from "lucide-react";

type RestoreRun = {
  id: number;
  mode: "full" | "append";
  actor_id: string;
  source_filename: string;
  source_created_at?: string | null;
  status: "running" | "completed" | "partial" | "failed";
  restored_rows: number;
  duplicate_rows: number;
  conflict_rows: number;
  restored_files: number;
  message?: string | null;
  created_at: string;
  completed_at?: string | null;
};

type RestoreItem = {
  id: number;
  run_id: number;
  item_type: "record" | "object" | "local_upload" | "system";
  table_name?: string | null;
  display_label: string;
  outcome: "restored" | "duplicated" | "conflict" | "already_present" | "skipped";
  target_path?: string | null;
  details?: string | null;
  reviewed_at?: string | null;
  mode: "full" | "append";
  run_status: string;
  source_filename: string;
  created_at: string;
};

type RestoreDetail = {
  item: RestoreItem;
  record: Record<string, unknown> | null;
  sensitive: boolean;
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("mkgh_token") || ""}`,
});

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value.replace(" ", "T") + (value.endsWith("Z") ? "" : "Z"));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ar-SA");
}

const outcomeText: Record<RestoreItem["outcome"], string> = {
  restored: "استُعيد",
  duplicated: "أُنشئت نسخة مستقلة",
  conflict: "تعارض يحتاج مراجعة",
  already_present: "موجود كما هو",
  skipped: "لم يُستورد",
};

const outcomeStyle: Record<RestoreItem["outcome"], string> = {
  restored: "bg-emerald-100 text-emerald-800",
  duplicated: "bg-blue-100 text-blue-800",
  conflict: "bg-amber-100 text-amber-900",
  already_present: "bg-gray-100 text-gray-700",
  skipped: "bg-rose-100 text-rose-800",
};

function modulePathForTable(tableName?: string | null): string | null {
  if (!tableName) return null;
  const table = tableName.toLowerCase();
  if (table === "trips" || table.startsWith("rental_")) return "/trips";
  if (table === "users" || table.startsWith("user_")) return "/users";
  if (table === "employees" || table.startsWith("employee_")) return "/employees";
  if (table.includes("driver_settlement") || table.includes("driver_custody")) return "/supervisor";
  if (table.includes("workshop_inventory")) return "/workshop-inventory";
  if (table.includes("workshop") || table.includes("maintenance") || table.includes("breakdown")) return "/workshop-manager";
  if (table.includes("supplier") || table.startsWith("purchase_")) return "/purchasing";
  if (table.startsWith("warehouse_") || table === "warehouses" || table.includes("supply_request")) return "/warehouses";
  if (table === "products" || table.startsWith("product_")) return "/products-admin";
  if (table.includes("tariff") || table.includes("route_bonus") || table.includes("km_rate")) return "/tariffs";
  if (table.includes("fleet_vehicle") || table.startsWith("vehicle_") || table.includes("trailer")) return "/supervisor";
  if (table.includes("driver")) return "/drivers-manage";
  if (table.includes("invoice") || table.includes("expense") || table.includes("journal") || table.includes("finance")) return "/finance";
  if (table.includes("legal") || table.includes("document")) return "/legal";
  if (table.includes("system_log") || table.includes("audit")) return "/system-logs";
  if (table === "notifications") return "/notifications";
  if (table.includes("company_setting")) return "/company-settings";
  return null;
}

export default function BackupRestoreLogPage() {
  const [items, setItems] = useState<RestoreItem[]>([]);
  const [runs, setRuns] = useState<RestoreRun[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [runFilter, setRunFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<RestoreDetail | null>(null);
  const [backupPreparing, setBackupPreparing] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreMessage, setRestoreMessage] = useState("");
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const restoreModeRef = useRef<"full" | "append" | null>(null);
  const limit = 50;

  const downloadSystemBackup = async () => {
    if (!window.confirm("سيُنزّل ملف ZIP يحتوي قاعدة بيانات النظام وجميع الملفات المرفوعة (قد يتجاوز 3 جيجابايت). يحتوي بيانات خاصة؛ احفظه في مكان آمن. هل تريد المتابعة؟")) return;
    setBackupPreparing(true);
    setBackupMessage("");
    try {
      const response = await fetch("/api/system-backup/ticket", {
        headers: authHeaders(),
        cache: "no-store",
      });
      const result = await response.json() as { download_url?: string; error?: string };
      if (!response.ok || !result.download_url) throw new Error(result.error || "تعذر بدء النسخ الاحتياطي");
      const link = document.createElement("a");
      link.href = result.download_url;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setBackupMessage("بدأ تنزيل النسخة الشاملة. اترك التنزيل مفتوحًا حتى يكتمل؛ حجم الملف كبير.");
    } catch (reason) {
      setBackupMessage(reason instanceof Error ? reason.message : "تعذر بدء النسخ الاحتياطي");
    } finally {
      setBackupPreparing(false);
    }
  };

  const chooseRestoreArchive = (mode: "full" | "append") => {
    const warning = mode === "full"
      ? "الاستعادة الكاملة ستستبدل قاعدة بيانات النظام والملفات بحالة النسخة، وقد تفقد أي إضافات تمت بعدها. تُحفظ الحالة الحالية أولاً، ويُتراجع عنها إذا فشل التطبيق. قد تحتاج لتسجيل الدخول مجدداً. لن يبدأ شيء حتى تختار ملف ZIP. هل تريد المتابعة؟"
      : "سيُضاف ما ينقص من سجلات وملفات مع الاحتفاظ بالحالي. إذا اختلف سجل بالمعرّف نفسه، سيُنشأ له سجل مستقل إذا سمحت القيود؛ وما يتعذر نسخه سيظهر كتعارض للمراجعة. قد تتكرر أرقام العمل الظاهرة. هل تريد اختيار ملف ZIP؟";
    if (!window.confirm(warning)) return;
    restoreModeRef.current = mode;
    setRestoreMessage("");
    setRestoreProgress(0);
    restoreInputRef.current?.click();
  };

  const uploadRestoreArchive = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const mode = restoreModeRef.current;
    event.target.value = "";
    if (!file || !mode) {
      restoreModeRef.current = null;
      return;
    }
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setRestoreMessage("اختر ملف النسخة الشاملة بصيغة ZIP.");
      restoreModeRef.current = null;
      return;
    }

    const form = new FormData();
    form.append("mode", mode);
    form.append("archive", file, file.name);
    const request = new XMLHttpRequest();
    setRestoreBusy(true);
    setRestoreMessage("جارٍ رفع النسخة والتحقق منها؛ لن تُطبّق إذا فشل التحقق.");
    request.open("POST", "/api/system-backup/restore");
    for (const [name, value] of Object.entries(authHeaders())) request.setRequestHeader(name, value);
    request.upload.onprogress = progress => {
      if (progress.lengthComputable) setRestoreProgress(Math.round((progress.loaded / progress.total) * 100));
    };
    request.onload = () => {
      let result: {
        error?: string; message?: string; status?: string; runId?: number;
        restoredRows?: number; duplicateRows?: number; conflictRows?: number; restoredFiles?: number;
      } = {};
      try { result = JSON.parse(request.responseText || "{}"); } catch {}
      if (request.status < 200 || request.status >= 300) {
        setRestoreMessage(result.error || "تعذرت الاستعادة؛ لم تُؤكد العملية.");
      } else {
        setRestoreMessage(
          `${result.message || "اكتملت الاستعادة"} — سجلات أُعيدت: ${result.restoredRows ?? 0}، ` +
          `نسخ منفصلة: ${result.duplicateRows ?? 0}، ملفات: ${result.restoredFiles ?? 0}، ` +
          `تعارضات للمراجعة: ${result.conflictRows ?? 0}.`,
        );
      }
      setRestoreBusy(false);
      restoreModeRef.current = null;
    };
    request.onerror = () => {
      setRestoreMessage("انقطع الاتصال أثناء الاستعادة. راجع سجل الاستعادة قبل إعادة المحاولة.");
      setRestoreBusy(false);
      restoreModeRef.current = null;
    };
    request.onabort = () => {
      setRestoreMessage("أُوقف رفع الملف قبل تطبيق الاستعادة.");
      setRestoreBusy(false);
      restoreModeRef.current = null;
    };
    request.send(form);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (runFilter) query.set("runId", runFilter);
    if (reviewFilter !== "all") query.set("reviewed", reviewFilter);
    fetch(`/api/system-backup/restore-log?${query}`, { headers: authHeaders(), cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "تعذر تحميل سجل الاستعادة");
        return body as { items: RestoreItem[]; runs: RestoreRun[]; total: number };
      })
      .then(body => {
        if (cancelled) return;
        setItems(body.items);
        setRuns(body.runs);
        setTotal(body.total);
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "تعذر تحميل سجل الاستعادة");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [offset, reviewFilter, runFilter]);

  useEffect(() => {
    const itemId = new URLSearchParams(window.location.search).get("item");
    if (!itemId) return;
    fetch(`/api/system-backup/restore-log/item/${encodeURIComponent(itemId)}`, {
      headers: authHeaders(), cache: "no-store",
    }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر تحميل تفاصيل السجل");
      setDetail(body as RestoreDetail);
    }).catch(reason => {
      setError(reason instanceof Error ? reason.message : "تعذر تحميل تفاصيل السجل");
    });
  }, []);

  const markReviewed = async (item: RestoreItem) => {
    try {
      const response = await fetch(`/api/system-backup/restore-log/item/${item.id}/review`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed: true }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "تعذر حفظ حالة المراجعة");
      setItems(current => current.map(row => row.id === item.id
        ? { ...row, reviewed_at: body.item.reviewed_at }
        : row));
      if (detail?.item.id === item.id) {
        setDetail(current => current ? {
          ...current,
          item: { ...current.item, reviewed_at: body.item.reviewed_at },
        } : current);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر حفظ حالة المراجعة");
    }
  };

  const selectedRun = runFilter ? runs.find(run => String(run.id) === runFilter) : undefined;

  return (
    <div dir="rtl" className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">سجل استعادة النسخ الشاملة</h1>
          <p className="mt-1 text-sm text-gray-500">
            السجلات والملفات المستعادة والتعارضات؛ يمكن فتح تفاصيل كل عنصر وحفظ حالة مراجعته.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={downloadSystemBackup} disabled={backupPreparing || restoreBusy}
            title="نسخة شاملة لقاعدة بيانات النظام وجميع الملفات المرفوعة"
            className="flex items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-900 hover:bg-sky-100 disabled:opacity-50">
            <Download size={14} />{backupPreparing ? "جاري تجهيز النسخة..." : "تنزيل نسخة احتياطية شاملة"}
          </button>
          <button type="button" onClick={() => chooseRestoreArchive("append")} disabled={restoreBusy || backupPreparing}
            title="إضافة السجلات والملفات الناقصة مع إبقاء البيانات الحالية"
            className="flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50">
            <Upload size={14} />استكمال البيانات الناقصة
          </button>
          <button type="button" onClick={() => chooseRestoreArchive("full")} disabled={restoreBusy || backupPreparing}
            title="استبدال حالة النظام والملفات بالحالة الموجودة في النسخة المختارة"
            className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50">
            <RefreshCw size={14} className={restoreBusy ? "animate-spin" : ""} />
            {restoreBusy ? `جارٍ الرفع والتحقق ${restoreProgress}%` : "استعادة كاملة"}
          </button>
          <input ref={restoreInputRef} type="file" accept=".zip,application/zip" className="hidden"
            onChange={uploadRestoreArchive} />
          <Link href="/admin">
            <span className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              <ArrowLeft size={16} /> إعدادات النظام
            </span>
          </Link>
        </div>
      </header>

      {backupMessage && (
        <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900">{backupMessage}</p>
      )}
      {restoreMessage && (
        <p role="status" aria-live="polite" className={`rounded-lg border px-3 py-2 text-sm font-medium ${
          restoreBusy ? "border-blue-200 bg-blue-50 text-blue-900" : "border-gray-200 bg-gray-50 text-gray-800"
        }`}>
          {restoreMessage}
          {restoreBusy && restoreProgress === 100 ? " يجري التحقق والتطبيق؛ أبقِ الصفحة مفتوحة." : ""}
        </p>
      )}

      {runs.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {runs.slice(0, 4).map(run => (
            <button key={run.id} type="button" onClick={() => { setRunFilter(String(run.id)); setOffset(0); }}
              className="rounded-2xl border border-gray-200 bg-white p-4 text-start shadow-sm hover:border-blue-300">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-gray-900">استعادة #{run.id}</span>
                <span className={`rounded-full px-2 py-1 text-xs font-bold ${
                  run.status === "completed" ? "bg-emerald-100 text-emerald-800"
                    : run.status === "partial" ? "bg-amber-100 text-amber-900"
                    : run.status === "failed" ? "bg-rose-100 text-rose-800"
                    : "bg-blue-100 text-blue-800"
                }`}>
                  {run.status === "completed" ? "مكتملة" : run.status === "partial" ? "مكتملة مع تعارضات" : run.status === "failed" ? "فشلت" : "جارية"}
                </span>
              </div>
              <p className="mt-2 truncate text-xs text-gray-500">{run.source_filename}</p>
              <p className="mt-1 text-xs text-gray-500">{formatDate(run.created_at)}</p>
              <p className="mt-3 text-xs font-medium text-gray-700">
                {run.restored_rows.toLocaleString("ar-SA")} سجل · {run.restored_files.toLocaleString("ar-SA")} ملف · {run.conflict_rows.toLocaleString("ar-SA")} تعارض
              </p>
            </button>
          ))}
        </section>
      )}

      {selectedRun?.message && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {selectedRun.message}
        </div>
      )}
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      {detail && (
        <section className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-gray-900">{detail.item.display_label}</h2>
              <p className="mt-1 text-xs text-gray-500">
                استعادة #{detail.item.run_id} · {outcomeText[detail.item.outcome]} · {formatDate(detail.item.created_at)}
              </p>
            </div>
            <button type="button" onClick={() => setDetail(null)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700">إغلاق التفاصيل</button>
          </div>
          {detail.item.details && <p className="text-sm text-gray-700">{detail.item.details}</p>}
          {modulePathForTable(detail.item.table_name) && (
            <a href={modulePathForTable(detail.item.table_name)!}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-800 hover:bg-blue-50">
              <ExternalLink size={14} /> فتح القسم الأصلي
            </a>
          )}
          {detail.sensitive
            ? <p className="text-sm text-gray-600">تُخفى تفاصيل هذا السجل لأنها تحتوي معرّف جلسة أو بيانات اعتماد.</p>
            : detail.record
              ? <pre dir="ltr" className="max-h-96 overflow-auto rounded-xl bg-white p-3 text-xs text-gray-800">{JSON.stringify(detail.record, null, 2)}</pre>
              : <p className="text-sm text-gray-600">لم يعد السجل موجوداً في الجدول الحالي.</p>}
          {detail.item.reviewed_at
            ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><Check size={16} /> تمت المراجعة في {formatDate(detail.item.reviewed_at)}</span>
            : <button type="button" onClick={() => markReviewed(detail.item)}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800">تمت المراجعة</button>}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
          <h2 className="me-auto font-bold text-gray-900">العناصر المستعادة والتعارضات</h2>
          <select value={runFilter} onChange={event => { setRunFilter(event.target.value); setOffset(0); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <option value="">كل الاستعادات</option>
            {runs.map(run => <option key={run.id} value={run.id}>استعادة #{run.id} · {formatDate(run.created_at)}</option>)}
          </select>
          <select value={reviewFilter} onChange={event => { setReviewFilter(event.target.value); setOffset(0); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <option value="all">كل الحالات</option>
            <option value="no">بانتظار المراجعة</option>
            <option value="yes">تمت مراجعتها</option>
          </select>
          <button type="button" onClick={() => setOffset(0)} title="تحديث السجل"
            className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">جارٍ تحميل السجل...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">لا توجد عناصر في هذا الاختيار.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-start">العنصر</th>
                  <th className="px-4 py-3 text-start">النتيجة</th>
                  <th className="px-4 py-3 text-start">نوع الاستعادة</th>
                  <th className="px-4 py-3 text-start">التاريخ</th>
                  <th className="px-4 py-3 text-start">المراجعة</th>
                  <th className="px-4 py-3 text-start">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(item => (
                  <tr key={item.id} className="align-top hover:bg-gray-50/70">
                    <td className="max-w-[320px] px-4 py-3">
                      <div className="truncate font-semibold text-gray-900">{item.display_label}</div>
                      <div className="mt-1 truncate text-xs text-gray-500">{item.details || item.source_filename}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${outcomeStyle[item.outcome]}`}>
                        {outcomeText[item.outcome]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{item.mode === "full" ? "كاملة" : "استكمال"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-3">
                      {item.reviewed_at
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={14} /> تمت</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800"><Clock3 size={14} /> بانتظار المراجعة</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {item.target_path && (
                          <a href={item.target_path} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50">
                            <ExternalLink size={13} /> تفاصيل السجل
                          </a>
                        )}
                        {modulePathForTable(item.table_name) && (
                          <a href={modulePathForTable(item.table_name)!}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-50">
                            <ExternalLink size={13} /> فتح القسم
                          </a>
                        )}
                        {!item.reviewed_at && (
                          <button type="button" onClick={() => markReviewed(item)}
                            className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800">تمت المراجعة</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-xs text-gray-600">
          <span>{total.toLocaleString("ar-SA")} عنصر</span>
          <div className="flex gap-2">
            <button type="button" disabled={offset <= 0 || loading} onClick={() => setOffset(value => Math.max(0, value - limit))}
              className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">السابق</button>
            <button type="button" disabled={offset + items.length >= total || loading} onClick={() => setOffset(value => value + limit)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">التالي</button>
          </div>
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-950">
        <ShieldAlert size={16} className="mt-1 shrink-0" />
        <p>سجل الاستعادة محفوظ داخل قاعدة البيانات ولا يتضمن كلمات المرور أو رموز الجلسات. استعادة كاملة لاحقة لا تمحو سجل المراجعة هذا.</p>
      </div>
    </div>
  );
}