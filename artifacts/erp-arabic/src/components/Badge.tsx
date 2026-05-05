interface Props { status: string; }

const LABELS: Record<string, { label: string; cls: string }> = {
  pending:           { label: "قيد المراجعة",     cls: "bg-yellow-100 text-yellow-700" },
  payment_confirmed: { label: "تم تأكيد الدفع",   cls: "bg-blue-100 text-blue-700" },
  vehicle_assigned:  { label: "جاري التجهيز",      cls: "bg-indigo-100 text-indigo-700" },
  invoiced:          { label: "صدرت الفاتورة",     cls: "bg-purple-100 text-purple-700" },
  loaded:            { label: "في الطريق",          cls: "bg-orange-100 text-orange-700" },
  delivered:         { label: "تم التسليم",         cls: "bg-green-100 text-green-700" },
  cancelled:         { label: "ملغي",               cls: "bg-red-100 text-red-700" },
  // legacy ERP statuses
  active:            { label: "نشط",                cls: "bg-green-100 text-green-700" },
  completed:         { label: "مكتمل",              cls: "bg-blue-100 text-blue-700" },
  draft:             { label: "مسودة",              cls: "bg-gray-100 text-gray-600" },
  paid:              { label: "مدفوع",              cls: "bg-green-100 text-green-700" },
  overdue:           { label: "متأخر",              cls: "bg-red-100 text-red-700" },
};

export default function Badge({ status }: Props) {
  const info = LABELS[status];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${info?.cls ?? "bg-gray-100 text-gray-600"}`}>
      {info?.label ?? status}
    </span>
  );
}
