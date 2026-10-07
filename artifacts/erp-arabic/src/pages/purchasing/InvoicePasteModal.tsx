import { useState, type ClipboardEvent } from "react";
import { AlertCircle, Check, ClipboardPaste, FileSpreadsheet, LockKeyhole, Plus, RefreshCw, Trash2, X } from "lucide-react";

export interface InvoicePasteRow {
  id: string;
  serial_no: string;
  invoice_date: string;
  branch: string;
  vehicle_plate: string;
  work_on: "vehicle" | "trailer";
  trailer_number: string;
  invoice_number: string;
  supplier_name: string;
  item_name: string;
  quantity: string;
  price_before_vat: string;
  price_after_vat: string;
  discount_amount: string;
  notes: string;
}

interface FleetVehicleOption {
  plate_number: string;
  branch?: string | null;
  linked_trailer_number?: string | null;
}

type PasteField = keyof Omit<InvoicePasteRow, "id"> |
  "claim_status" | "claim_number" | "imported_by" | "print_log" | "total_before" | "total_after";

interface PasteColumn {
  key: PasteField;
  label: string;
  readOnly?: boolean;
}

interface Props {
  importedBy: string;
  requestKey: string;
  vehicles: FleetVehicleOption[];
  trailerNumbers: string[];
  branchNames: string[];
  supplierNames: string[];
  onClose: (startFreshBatch?: boolean) => void;
  onSave: (rows: InvoicePasteRow[], requestKey: string) => Promise<void>;
}

const COLUMNS: PasteColumn[] = [
  { key: "serial_no", label: "م" },
  { key: "invoice_date", label: "التاريخ" },
  { key: "branch", label: "الفرع" },
  { key: "vehicle_plate", label: "السيارة" },
  { key: "work_on", label: "الشغل على" },
  { key: "invoice_number", label: "رقم الفاتورة" },
  { key: "claim_status", label: "حالة الكشف", readOnly: true },
  { key: "claim_number", label: "رقم الكشف", readOnly: true },
  { key: "supplier_name", label: "المورد" },
  { key: "item_name", label: "قطعة الغيار" },
  { key: "imported_by", label: "مدخل الفاتورة", readOnly: true },
  { key: "print_log", label: "الطباعة الأصلية / آخر إعادة", readOnly: true },
  { key: "quantity", label: "الكمية" },
  { key: "price_before_vat", label: "قبل الضريبة" },
  { key: "price_after_vat", label: "بعد الضريبة" },
  { key: "discount_amount", label: "الخصم" },
  { key: "total_before", label: "الإجمالي قبل الضريبة", readOnly: true },
  { key: "total_after", label: "الإجمالي بعد الضريبة", readOnly: true },
  { key: "notes", label: "ملاحظة" },
];

const newRow = (): InvoicePasteRow => ({
  id: `${Date.now()}-${Math.random()}`,
  serial_no: "",
  invoice_date: "",
  branch: "",
  vehicle_plate: "",
  work_on: "vehicle",
  trailer_number: "",
  invoice_number: "",
  supplier_name: "",
  item_name: "",
  quantity: "",
  price_before_vat: "",
  price_after_vat: "",
  discount_amount: "",
  notes: "",
});

function numericValue(value: string): number | null {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const normalized = value
    .replace(/[٠-٩]/g, digit => String(arabic.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(persian.indexOf(digit)))
    .replace(/[٬,،\s]/g, "")
    .replace(/٫/g, ".");
  if (!normalized.trim()) return 0;
  const valueAsNumber = Number(normalized);
  return Number.isFinite(valueAsNumber) ? valueAsNumber : null;
}

function rowHasContent(row: InvoicePasteRow): boolean {
  return [
    row.serial_no,
    row.invoice_date,
    row.branch,
    row.vehicle_plate,
    row.trailer_number,
    row.invoice_number,
    row.supplier_name,
    row.item_name,
    row.quantity,
    row.price_before_vat,
    row.price_after_vat,
    row.discount_amount,
    row.notes,
  ].some(value => value.trim() !== "");
}

function readClipboardMatrix(text: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "";
  let quoted = false;
  let terminatedByNewline = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\"") {
      if (quoted && text[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      terminatedByNewline = false;
      continue;
    }

    if (!quoted && character === "\t") {
      rows[rows.length - 1].push(cell);
      cell = "";
      terminatedByNewline = false;
      continue;
    }

    if (!quoted && (character === "\n" || character === "\r")) {
      rows[rows.length - 1].push(cell);
      cell = "";
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      if (index < text.length - 1) rows.push([]);
      terminatedByNewline = true;
      continue;
    }
    cell += character;
    terminatedByNewline = false;
  }

  if (!terminatedByNewline) rows[rows.length - 1].push(cell);
  if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }
  return rows;
}

function mapHeader(value: string): PasteField | null {
  const header = value.trim().toLocaleLowerCase("ar-SA").replace(/[\s_-]+/g, "");
  if (!header) return null;
  if (/الإجماليقبلالضريبة|اجماليقبلالضريبة|totalbefore/.test(header)) return "total_before";
  if (/الإجمالي.*بعدالضريبة|اجمالي.*بعدالضريبة|totalafter/.test(header)) return "total_after";
  if (/رقم.*تيدر|trailer.?number/.test(header)) return "trailer_number";
  if (/حالةالكشف|claimstatus/.test(header)) return "claim_status";
  if (/رقمالكشف|claimnumber/.test(header)) return "claim_number";
  if (/الطباعة|آخرإعادة|print/.test(header)) return "print_log";
  if (/مدخلالفاتورة|المستورد|importedby/.test(header)) return "imported_by";
  if (/^م$|مسلسل|تسلسل|serial/.test(header)) return "serial_no";
  if (/تاريخ|date/.test(header)) return "invoice_date";
  if (/فرع|branch/.test(header)) return "branch";
  if (/سيار|مركبة|لوحة|vehicle|plate/.test(header)) return "vehicle_plate";
  if (/الشغلالى|الشغلعلى|workon|رأسالسيارة/.test(header)) return "work_on";
  if (/رقمالفاتورة|invoice/.test(header)) return "invoice_number";
  if (/مورد|supplier/.test(header)) return "supplier_name";
  if (/قطعة|غيار|صنف|item/.test(header)) return "item_name";
  if (/كمية|quantity|qty/.test(header)) return "quantity";
  if (/قبل.*ضريب|ضريب.*قبل|pricebefore/.test(header)) return "price_before_vat";
  if (/بعد.*ضريب|ضريب.*بعد|priceafter/.test(header)) return "price_after_vat";
  if (/خصم|discount/.test(header)) return "discount_amount";
  if (/ملاحظ|notes?/.test(header)) return "notes";
  return null;
}

function headerRowMapping(row: string[]): PasteField[] | null {
  const mapping = row.map(mapHeader);
  return mapping.filter(Boolean).length >= 2 ? mapping as PasteField[] : null;
}

function applyCell(row: InvoicePasteRow, key: PasteField, rawValue: string): InvoicePasteRow {
  const value = rawValue.trim();
  if (key === "work_on") {
    if (/تيدر|trailer/i.test(value)) {
      const number = value.replace(/^.*?(?:التيدر|تيدر|trailer)\s*[:：-]?\s*/i, "").trim();
      return { ...row, work_on: "trailer", trailer_number: number || row.trailer_number };
    }
    if (/رأس|سيارة|مركبة|vehicle/i.test(value)) {
      return { ...row, work_on: "vehicle", trailer_number: "" };
    }
    return row;
  }
  if (key === "trailer_number") {
    return { ...row, trailer_number: value, ...(value ? { work_on: "trailer" as const } : {}) };
  }
  if (
    key === "claim_status" || key === "claim_number" || key === "imported_by" ||
    key === "print_log" || key === "total_before" || key === "total_after"
  ) return row;
  return { ...row, [key]: rawValue } as InvoicePasteRow;
}

export function InvoicePasteModal({
  importedBy,
  requestKey,
  vehicles,
  trailerNumbers,
  branchNames,
  supplierNames,
  onClose,
  onSave,
}: Props) {
  const [rows, setRows] = useState<InvoicePasteRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const [batchAlreadySaved, setBatchAlreadySaved] = useState(false);

  const updateCell = (rowIndex: number, key: PasteField, value: string) => {
    if (uncertain || batchAlreadySaved) return;
    setError("");
    setRows(previous => previous.map((row, index) => index === rowIndex ? applyCell(row, key, value) : row));
  };

  const handlePaste = (
    event: ClipboardEvent<HTMLInputElement | HTMLSelectElement>,
    rowIndex: number,
    columnIndex: number,
    singleCellKey?: PasteField,
  ) => {
    if (uncertain || batchAlreadySaved) return;
    const text = event.clipboardData.getData("text/plain");
    const hasTableCells = text.includes("\t") || text.includes("\n") || text.includes("\r");
    if (!hasTableCells && !singleCellKey) return;
    event.preventDefault();
    if (!text) return;

    const matrix = hasTableCells ? readClipboardMatrix(text) : [[text]];
    const headers = matrix.length > 1 || matrix[0].length > 1
      ? headerRowMapping(matrix[0])
      : null;
    const dataRows = headers ? matrix.slice(1) : matrix;
    const mapping = headers ?? (
      singleCellKey && !hasTableCells
        ? [singleCellKey]
        : COLUMNS.slice(columnIndex).map(column => column.key)
    );
    if (!dataRows.length) return;

    setError("");
    setRows(previous => {
      const next = [...previous];
      while (next.length < rowIndex + dataRows.length) next.push(newRow());
      dataRows.forEach((dataRow, rowOffset) => {
        const targetIndex = rowIndex + rowOffset;
        let target = next[targetIndex];
        dataRow.forEach((value, cellOffset) => {
          const key = mapping[cellOffset];
          if (key) target = applyCell(target, key, value);
        });
        next[targetIndex] = target;
      });
      return next;
    });
  };

  const submittedRows = rows.filter(rowHasContent);
  const totalBefore = (row: InvoicePasteRow) =>
    (numericValue(row.quantity) ?? 0) * (numericValue(row.price_before_vat) ?? 0);
  const totalAfter = (row: InvoicePasteRow) =>
    (numericValue(row.quantity) ?? 0) * (numericValue(row.price_after_vat) ?? 0);

  const validateRows = (): string | null => {
    if (!submittedRows.length) return "الصق صفًا أو أدخل بيانات فاتورة واحدة على الأقل";
    for (const [index, row] of submittedRows.entries()) {
      const rowNumber = index + 1;
      if (!row.item_name.trim()) return `الصف ${rowNumber}: اسم قطعة الغيار مطلوب`;
      if (row.work_on === "vehicle" && !row.vehicle_plate.trim())
        return `الصف ${rowNumber}: اختر سيارة أو اكتب رقم السيارة`;
      if (row.work_on === "trailer" && !row.trailer_number.trim())
        return `الصف ${rowNumber}: أدخل رقم التيدر`;
      for (const [label, value] of [
        ["الكمية", row.quantity],
        ["السعر قبل الضريبة", row.price_before_vat],
        ["السعر بعد الضريبة", row.price_after_vat],
        ["الخصم", row.discount_amount],
      ]) {
        const parsed = numericValue(value);
        if (parsed === null || parsed < 0) return `الصف ${rowNumber}: قيمة ${label} غير صحيحة`;
      }
    }
    return null;
  };

  const submit = async () => {
    if (uncertain && saving) return;
    const validationError = validateRows();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(submittedRows, requestKey);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "فشل حفظ الفواتير؛ بقيت البيانات في الجدول");
      if (saveError && typeof saveError === "object" && "uncertain" in saveError && saveError.uncertain === true) {
        setUncertain(true);
      } else if (saveError && typeof saveError === "object" && "batchAlreadySaved" in saveError && saveError.batchAlreadySaved === true) {
        setBatchAlreadySaved(true);
      } else if (uncertain) {
        setUncertain(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const renderCell = (row: InvoicePasteRow, rowIndex: number, columnIndex: number, column: PasteColumn) => {
    const commonClass = "w-full min-w-[120px] rounded-md border border-[#d9e1df] bg-[#fffefa] px-2.5 py-2 text-[12px] leading-5 text-[#233c3c] outline-none transition-colors placeholder:text-[#9aa9a5] hover:border-[#a5b8b3] focus:border-[#18766f] focus:ring-2 focus:ring-[#18766f]/15 disabled:cursor-not-allowed disabled:bg-[#edf1ee] disabled:text-[#7c8985]";
    const paste = (key?: PasteField) => (event: ClipboardEvent<HTMLInputElement | HTMLSelectElement>) =>
      handlePaste(event, rowIndex, columnIndex, key);

    if (column.readOnly) {
      let value = "—";
      if (column.key === "claim_status") value = "غير مدرجة";
      if (column.key === "imported_by") value = importedBy || "—";
      if (column.key === "total_before") value = totalBefore(row).toLocaleString("ar-SA", { maximumFractionDigits: 2 });
      if (column.key === "total_after") value = totalAfter(row).toLocaleString("ar-SA", { maximumFractionDigits: 2 });
      return <td key={column.key} className="min-w-[130px] border-b border-[#e6ebe7] bg-[#f1f4f1] px-2 py-1.5 text-center text-[11px] font-medium tabular-nums text-[#72817b]"><span className="inline-flex min-h-8 items-center justify-center rounded-md bg-[#e8eeea] px-2">{value}</span></td>;
    }

    if (column.key === "work_on") {
      return (
        <td key={column.key} className="min-w-[180px] border-b border-[#e6ebe7] px-2 py-1.5">
          <div className="space-y-1">
            <select
              value={row.work_on}
              onChange={event => updateCell(rowIndex, "work_on", event.target.value)}
              onPaste={paste("work_on")}
              disabled={saving || uncertain || batchAlreadySaved}
              data-testid={`select-invoice-paste-work-on-${rowIndex}`}
              className={commonClass}
              aria-label={`الشغل على، الصف ${rowIndex + 1}`}
            >
              <option value="vehicle">رأس السيارة</option>
              <option value="trailer">التيدر</option>
            </select>
            {row.work_on === "trailer" && (
              <input
                value={row.trailer_number}
                onChange={event => updateCell(rowIndex, "trailer_number", event.target.value)}
                onPaste={paste("trailer_number")}
                list="supplier-invoice-paste-trailers"
                placeholder="رقم التيدر"
                disabled={saving || uncertain || batchAlreadySaved}
                data-testid={`input-invoice-paste-trailer-${rowIndex}`}
                className={commonClass}
                aria-label={`رقم التيدر، الصف ${rowIndex + 1}`}
              />
            )}
          </div>
        </td>
      );
    }

    const key = column.key as keyof Omit<InvoicePasteRow, "id" | "work_on" | "trailer_number">;
    const listId = key === "vehicle_plate"
      ? "supplier-invoice-paste-vehicles"
      : key === "branch"
        ? "supplier-invoice-paste-branches"
        : key === "supplier_name"
          ? "supplier-invoice-paste-suppliers"
          : undefined;
    const isNumber = key === "quantity" || key === "price_before_vat" || key === "price_after_vat" || key === "discount_amount";

    return (
      <td key={column.key} className="min-w-[140px] border-b border-[#e6ebe7] px-2 py-1.5">
        <input
          value={row[key]}
          onChange={event => updateCell(rowIndex, key, event.target.value)}
          onPaste={paste(key)}
          list={listId}
          inputMode={isNumber ? "decimal" : undefined}
          placeholder={key === "serial_no" ? "تلقائي" : undefined}
          disabled={saving || uncertain || batchAlreadySaved}
          data-testid={`input-invoice-paste-${key}-${rowIndex}`}
          className={commonClass}
          aria-label={`${column.label}، الصف ${rowIndex + 1}`}
        />
      </td>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#102c2c]/55 p-0 backdrop-blur-[3px] sm:p-3 lg:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="invoice-paste-heading" dir="rtl" className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-[#f7f8f4] text-[#203837] shadow-2xl sm:h-[96dvh] sm:max-h-[96dvh] sm:rounded-2xl lg:max-w-[99vw]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#315454] bg-[#173a3a] px-4 py-3.5 text-[#f4f3e8] sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-[#b8d5c8]"><FileSpreadsheet size={20} /></span>
            <div>
              <p className="mb-0.5 text-[10px] font-bold tracking-[0.16em] text-[#a9c6ba]">المشتريات / إدخال جماعي</p>
              <h2 id="invoice-paste-heading" className="text-base font-black sm:text-lg" data-testid="title-invoice-paste">لصق فواتير الموردين من Excel</h2>
              <p className="mt-1 max-w-4xl text-[11px] leading-5 text-[#c2d2cc] sm:text-xs">
                الصق خلية واحدة أو نطاقاً من Excel في أول خانة مناسبة. راجع البيانات وعدّلها هنا قبل الحفظ؛ أعمدة الكشف والطباعة والإجماليات محسوبة أو تلقائية.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose(batchAlreadySaved)}
            disabled={saving || uncertain}
            aria-label="إغلاق جدول اللصق"
            data-testid="button-close-invoice-paste"
            className="shrink-0 rounded-lg p-2 text-[#c2d2cc] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7dfd1] disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#dce4df] bg-[#eef2ed] px-4 py-2.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#657873]">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#c6ddd2] bg-[#e1eee7] px-2.5 py-1.5 font-black text-[#245d50]" data-testid="text-invoice-paste-row-count"><Check size={13} />{submittedRows.length} صف جاهز</span>
            <span className="text-[11px]">السيارة تقبل اختيارًا من الأسطول أو كتابة رقم خارجي.</span>
            <span className="hidden h-4 w-px bg-[#d3ddd7] sm:block" />
            <span className="hidden items-center gap-1 text-[10px] text-[#71807b] sm:inline-flex"><LockKeyhole size={12} /> الحقول الرمادية للعرض فقط</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { if (!uncertain && !batchAlreadySaved) { setRows(previous => [...previous, newRow()]); setError(""); } }}
              disabled={saving || uncertain || batchAlreadySaved}
              data-testid="button-add-invoice-paste-row"
              className="flex items-center gap-1.5 rounded-lg border border-[#b9d5c9] bg-[#fbfdf9] px-3 py-2 text-xs font-bold text-[#286c5c] transition-colors hover:bg-[#e8f2ec] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18766f]/30 disabled:opacity-50"
            >
              <Plus size={13} /> إضافة صف
            </button>
            <button
              type="button"
              onClick={() => { if (!uncertain && !batchAlreadySaved) { setRows([newRow()]); setError(""); } }}
              disabled={saving || uncertain || batchAlreadySaved}
              data-testid="button-clear-invoice-paste-grid"
              className="flex items-center gap-1.5 rounded-lg border border-[#d9e1dc] bg-[#fbfdf9] px-3 py-2 text-xs font-semibold text-[#64736f] transition-colors hover:bg-[#e8ece8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#687e77]/25 disabled:opacity-50"
            >
              <Trash2 size={13} /> مسح الجدول
            </button>
          </div>
        </div>

        {uncertain && <div role="status" className="shrink-0 border-b border-[#e8d49e] bg-[#fff6dc] px-4 py-2 text-xs text-[#735a1f] sm:px-6">تعذّر تأكيد نتيجة الطلب السابق. البيانات مقفلة مؤقتاً؛ أعد التحقق باستخدام رقم الطلب نفسه لتجنّب التكرار.</div>}
        {batchAlreadySaved && <div role="status" className="shrink-0 border-b border-[#e8d49e] bg-[#fff6dc] px-4 py-2 text-xs text-[#735a1f] sm:px-6">تم تسجيل هذه الدفعة مسبقاً. راجع السجل أو ابدأ دفعة جديدة من الزر أدناه.</div>}

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain" dir="rtl">
          <table className="min-w-[2700px] border-separate border-spacing-0 text-right">
            <thead className="sticky top-0 z-10 bg-[#e8eeea]">
              <tr>
                <th className="sticky right-0 z-20 border-b border-[#d1ddd6] bg-[#e0e8e2] px-2.5 py-2.5 text-center text-[10px] font-bold text-[#75837e]">#</th>
                {COLUMNS.map(column => (
                  <th key={column.key} className="whitespace-nowrap border-b border-[#d1ddd6] px-2.5 py-2.5 text-[11px] font-extrabold text-[#4e625c]">
                    {column.label}
                    {column.readOnly && <span className="mr-1.5 rounded bg-[#dce5df] px-1 py-0.5 text-[9px] font-semibold text-[#809089]">تلقائي</span>}
                  </th>
                ))}
                <th className="border-b border-[#d1ddd6] px-2 py-2.5 text-[10px] font-bold text-[#75837e]">حذف</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.id} data-testid={`row-invoice-paste-${rowIndex}`} className={`${rowHasContent(row) ? "bg-[#fbfcf8]" : "bg-[#f4f6f2]"} transition-colors hover:bg-[#f0f6f1]`}>
                  <td className="sticky right-0 z-[1] border-b border-[#e6ebe7] bg-[#eef2ed] px-2 py-1.5 text-center text-[11px] font-bold tabular-nums text-[#647670]">{rowIndex + 1}</td>
                  {COLUMNS.map((column, columnIndex) => renderCell(row, rowIndex, columnIndex, column))}
                  <td className="border-b border-[#e6ebe7] px-2 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => setRows(previous => previous.length === 1 ? [newRow()] : previous.filter((_, index) => index !== rowIndex))}
                      disabled={saving || uncertain || batchAlreadySaved}
                      aria-label={`حذف الصف ${rowIndex + 1}`}
                      data-testid={`button-delete-invoice-paste-row-${rowIndex}`}
                      className="rounded-md p-2 text-[#ae6c67] transition-colors hover:bg-[#f8e8e5] hover:text-[#963f39] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ae6c67]/30 disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <datalist id="supplier-invoice-paste-vehicles">
          <option value="مستودع الورشة" />
          {vehicles.map(vehicle => <option key={vehicle.plate_number} value={vehicle.plate_number} />)}
        </datalist>
        <datalist id="supplier-invoice-paste-trailers">
          {trailerNumbers.map(number => <option key={number} value={number} />)}
        </datalist>
        <datalist id="supplier-invoice-paste-branches">
          {branchNames.map(name => <option key={name} value={name} />)}
        </datalist>
        <datalist id="supplier-invoice-paste-suppliers">
          {supplierNames.map(name => <option key={name} value={name} />)}
        </datalist>

        {error && (
          <div role="alert" data-testid="status-invoice-paste-error" className="mx-4 mt-2 flex shrink-0 items-start gap-2 rounded-lg border border-[#ecc6c0] bg-[#fff0ed] px-3 py-2.5 text-xs font-semibold text-[#9b443b] sm:mx-6">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#dce4df] bg-[#fbfcf8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="text-[10px] leading-4 text-[#82908a]"><span className="font-bold text-[#60736b]">{submittedRows.length}</span> سجل ضمن الدفعة <span className="mx-2 text-[#c1cbc5]">|</span><span>لا تعتمد حتى تكتمل مراجعة جميع الصفوف</span></div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => onClose(batchAlreadySaved)}
            disabled={saving || uncertain}
            data-testid="button-cancel-invoice-paste"
            className="rounded-lg border border-[#d6dfd9] bg-white px-5 py-2.5 text-sm font-semibold text-[#64736f] transition-colors hover:bg-[#f1f4f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#687e77]/25 disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || batchAlreadySaved || submittedRows.length === 0}
            data-testid="button-submit-invoice-paste"
            className="flex items-center justify-center gap-2 rounded-lg bg-[#176d63] px-5 py-2.5 text-sm font-black text-white shadow-sm transition-colors hover:bg-[#115a52] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176d63]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <RefreshCw size={15} className="animate-spin" /> : <ClipboardPaste size={15} />}
            {saving
              ? "جاري الحفظ..."
              : uncertain
                ? "إعادة التحقق بنفس رقم الطلب"
                : `اعتماد وإضافة ${submittedRows.length} سجل`}
          </button>
          {batchAlreadySaved && (
            <button
              type="button"
              onClick={() => onClose(true)}
              data-testid="button-invoice-paste-review-saved"
              className="rounded-lg bg-[#f5e8c6] px-4 py-2.5 text-xs font-bold text-[#735a1f] transition-colors hover:bg-[#edddaf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b08c42]/30"
            >
              مراجعة السجل وبدء دفعة جديدة
            </button>
          )}
          </div>
        </div>
      </section>
    </div>
  );
}
