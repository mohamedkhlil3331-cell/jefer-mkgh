import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Banknote, CalendarDays, CheckCircle2, Clock3, Loader2, X } from "lucide-react";

const PRIMARY = "#103c68";
const GREEN = "#059669";
const RED = "#dc2626";
const AMBER = "#d97706";

interface CustodyRecord {
  id: number;
  driver_name?: string;
  vehicle_plate?: string;
  print_date: string;
  date_from?: string;
  date_to?: string;
  filter_ref?: string;
  net_amount: number;
  item_count?: number;
  is_custody_printed: number;
  custody_printed_at?: string;
}

interface SettlementRecord {
  id: number;
  settlement_date?: string;
  created_at?: string;
  allocated_amount: number;
  notes?: string | null;
  settled_by?: string | null;
  deferred?: number;
  delivered_at?: string | null;
}

interface CompanySendRecord {
  id: number;
  amount: number;
  note?: string | null;
  sent_by?: string | null;
  created_at: string;
}

interface Props {
  driver: {
    driver_name: string;
    phone: string;
    vehicle_plate?: string;
    status?: string;
  };
  token?: string | null;
  onClose: () => void;
}

type StatementEntry = {
  id: string;
  date: string;
  title: string;
  details: string;
  kind: "custody" | "payment" | "company";
  due: number;
  paid: number;
  change: number;
  status?: string;
};

const formatMoney = (value: number) =>
  `${Math.abs(Number(value) || 0).toLocaleString("ar-SA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ر.س`;

const formatDate = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("ar-SA");
};

export default function DriverSettlementStatementModal({ driver, token, onClose }: Props) {
  const [custody, setCustody] = useState<CustodyRecord[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [companySends, setCompanySends] = useState<CompanySendRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    setLoading(true);
    setError("");

    Promise.all([
      fetch(`/api/driver-custody?driver_phone=${encodeURIComponent(driver.phone)}`, { headers })
        .then(response => {
          if (!response.ok) throw new Error("تعذر تحميل كشوف العهدة");
          return response.json() as Promise<CustodyRecord[]>;
        }),
      fetch(`/api/driver-settlements?phone=${encodeURIComponent(driver.phone)}`, { headers })
        .then(response => {
          if (!response.ok) throw new Error("تعذر تحميل الدفعات");
          return response.json() as Promise<SettlementRecord[]>;
        }),
      fetch(`/api/driver-company-sends?driver_phone=${encodeURIComponent(driver.phone)}`, { headers })
        .then(response => {
          if (!response.ok) throw new Error("تعذر تحميل مبالغ الشركة");
          return response.json() as Promise<CompanySendRecord[]>;
        }),
    ])
      .then(([custodyRows, settlementRows, companyRows]) => {
        if (cancelled) return;
        setCustody((Array.isArray(custodyRows) ? custodyRows : []).filter(row => row.is_custody_printed === 1));
        setSettlements(Array.isArray(settlementRows) ? settlementRows : []);
        setCompanySends(Array.isArray(companyRows) ? companyRows : []);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "تعذر تحميل كشف الحساب");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [driver.phone, token]);

  const entries = useMemo<StatementEntry[]>(() => {
    const custodyEntries: StatementEntry[] = custody.map(row => ({
      id: `custody-${row.id}`,
      date: row.custody_printed_at || row.print_date || "",
      title: `استحقاق كشف عهدة ${row.filter_ref || `#${row.id}`}`,
      details: [
        row.date_from || row.date_to ? `الفترة ${row.date_from || "—"} — ${row.date_to || "—"}` : "",
        row.item_count ? `${row.item_count} بند` : "",
      ].filter(Boolean).join(" · "),
      kind: "custody",
      due: Math.max(Number(row.net_amount) || 0, 0),
      paid: 0,
      change: Number(row.net_amount) || 0,
      status: "كشف مطبوع",
    }));

    const settlementEntries: StatementEntry[] = settlements.map(row => {
      const amount = Number(row.allocated_amount) || 0;
      const isPayment = amount >= 0;
      return {
        id: `settlement-${row.id}`,
        date: row.settlement_date || row.created_at || "",
        title: isPayment ? "دفعة للسائق" : "خصم / تعديل على التسوية",
        details: [
          row.notes || "",
          row.settled_by ? `بواسطة ${row.settled_by}` : "",
          row.deferred === 1 && !row.delivered_at ? "مؤجل" : "",
        ].filter(Boolean).join(" · "),
        kind: "payment",
        due: isPayment ? 0 : Math.abs(amount),
        paid: isPayment ? amount : 0,
        change: -amount,
        status: row.deferred === 1 && !row.delivered_at ? "مؤجل" : "مسجل",
      };
    });

    const companyEntries: StatementEntry[] = companySends.map(row => ({
      id: `company-${row.id}`,
      date: row.created_at,
      title: "مبلغ مدفوع من الشركة",
      details: [row.note || "", row.sent_by ? `بواسطة ${row.sent_by}` : ""].filter(Boolean).join(" · "),
      kind: "company",
      due: 0,
      paid: Number(row.amount) || 0,
      change: -(Number(row.amount) || 0),
      status: "مدفوع",
    }));

    return [...custodyEntries, ...settlementEntries, ...companyEntries]
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }, [companySends, custody, settlements]);

  const totals = useMemo(() => {
    let balance = 0;
    return entries.reduce((result, entry) => {
      balance += entry.change;
      result.custody += entry.kind === "custody" ? entry.change : 0;
      result.paid += entry.paid;
      result.rows.push({ ...entry, balance });
      return result;
    }, {
      custody: 0,
      paid: 0,
      rows: [] as (StatementEntry & { balance: number })[],
    });
  }, [entries]);
  const currentBalance = totals.rows.length ? totals.rows[totals.rows.length - 1].balance : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between bg-[#103c68] px-5 py-4 text-white">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Banknote size={19} />
              كشف حساب السائق
            </h2>
            <p className="mt-1 text-xs text-white/75">
              {driver.driver_name} · {driver.vehicle_plate || "بدون سيارة"} · {driver.status || "نشط"}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white" aria-label="إغلاق">
            <X size={19} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-20 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            جاري تحميل كشف الحساب...
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-sm text-red-600">
            <AlertCircle size={28} />
            <span>{error}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 border-b border-gray-100 bg-gray-50 p-5 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="text-xs font-semibold text-emerald-700">صافي كشوف العهدة المطبوعة</div>
                <div className="mt-1 text-lg font-black text-emerald-700">{formatMoney(totals.custody)}</div>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                <div className="text-xs font-semibold text-blue-700">إجمالي المدفوع للسائق</div>
                <div className="mt-1 text-lg font-black text-blue-700">{formatMoney(totals.paid)}</div>
              </div>
              <div className={`rounded-xl border p-3 ${currentBalance < 0 ? "border-red-100 bg-red-50" : "border-amber-100 bg-amber-50"}`}>
                <div className="text-xs font-semibold text-amber-700">الرصيد المتبقي</div>
                <div className={`mt-1 text-lg font-black ${currentBalance < 0 ? "text-red-700" : "text-amber-700"}`}>
                  {formatMoney(currentBalance)}
                  <span className="mr-1 text-xs font-bold">{currentBalance >= 0 ? "للسائق" : "على السائق"}</span>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              {totals.rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400">
                  <CalendarDays size={28} className="mx-auto mb-2 opacity-50" />
                  لا توجد كشوف مطبوعة أو دفعات مسجلة لهذا السائق
                </div>
              ) : (
                <table className="w-full min-w-[760px] text-right text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs text-gray-500">
                      <th className="px-3 py-3 font-bold">التاريخ</th>
                      <th className="px-3 py-3 font-bold">البيان</th>
                      <th className="px-3 py-3 font-bold">عهدة مستحقة</th>
                      <th className="px-3 py-3 font-bold">المدفوع / الخصم</th>
                      <th className="px-3 py-3 font-bold">الرصيد بعد العملية</th>
                      <th className="px-3 py-3 font-bold">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {totals.rows.map(row => (
                      <tr key={row.id} className="hover:bg-gray-50/70">
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-500">{formatDate(row.date)}</td>
                        <td className="px-3 py-3">
                          <div className="font-bold text-gray-800">{row.title}</div>
                          {row.details && <div className="mt-0.5 text-xs text-gray-400">{row.details}</div>}
                        </td>
                        <td className="px-3 py-3 font-bold text-emerald-700">
                          {row.due > 0 ? `+${formatMoney(row.due)}` : "—"}
                        </td>
                        <td className="px-3 py-3 font-bold text-blue-700">
                          {row.paid > 0 ? `-${formatMoney(row.paid)}` : "—"}
                        </td>
                        <td className={`px-3 py-3 font-black ${row.balance >= 0 ? "text-amber-700" : "text-red-700"}`}>
                          {formatMoney(row.balance)}
                          <span className="mr-1 text-[10px] font-semibold">{row.balance >= 0 ? "له" : "عليه"}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold ${
                            row.kind === "custody"
                              ? "bg-emerald-50 text-emerald-700"
                              : row.status === "مؤجل"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-blue-50 text-blue-700"
                          }`}>
                            {row.kind === "custody" ? <CheckCircle2 size={12} /> : row.status === "مؤجل" ? <Clock3 size={12} /> : <Banknote size={12} />}
                            {row.status || "مسجل"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}