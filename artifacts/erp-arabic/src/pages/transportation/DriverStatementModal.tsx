import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { X, Printer, TrendingUp, Minus, CreditCard, Clock, Package, Car, ShoppingBag, ChevronLeft, Truck, Plus, Save, CheckCircle, Pencil, Trash2, CalendarRange, PenLine, Share2 } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { useRememberedState } from "@/hooks/useRememberedState";

// ── Types ─────────────────────────────────────────────────────────────────────
interface StmtOrder {
  order_number: string; created_at: string; driver_bonus: number;
  loading_point_name: string; delivery_location: string; quantity: number; vehicle_plate: string;
  settled?: boolean;
}
interface StmtTrip {
  id?: number;
  date: string; trip_state: string; distance_km: number;
  destination: string; client_name: string; rate: number; bonus: number;
  vehicle_plate?: string;
  loading_region?: string; unloading_region?: string;
  trips_count?: number; unit_price?: number; route_bonus?: number;
  driver_expense?: number;
  settled?: boolean;
}
interface StmtRental {
  id?: number;
  assigned_at: string; driver_bonus: number; pickup_location: string; destination_location: string; vehicle_plate: string;
  settled?: boolean;
}
interface StmtSupplyTrip {
  id: number; completed_at: string; rental: number; driver_expense: number;
  product_name: string; warehouse_name: string; destination_division: string;
  vehicle_plate: string; routing_dispatch_id: number;
  settled?: boolean;
}
interface StmtExpense {
  id: number; expense_date: string; expense_type: string;
  amount: number; liters: number; description: string; order_number: string;
  vehicle_plate?: string;
  settled?: boolean;
}
interface StmtSettlement {
  id: number; created_at: string; settlement_date?: string; allocated_amount: number;
  notes: string; settled_by: string; deferred: number; delivered_at: string;
}
export interface StatementData {
  driver: { driver_name: string; phone: string; vehicle_plate: string; status: string } | null;
  vehicle_plates?: string[];
  expense_vehicle_plates?: string[];
  orders: StmtOrder[];
  trips: StmtTrip[];
  rentals: StmtRental[];
  supply_trips: StmtSupplyTrip[];
  expenses: StmtExpense[];
  settlements: StmtSettlement[];
  totals: {
    order_bonus: number; trip_bonus: number; rental_bonus: number; supply_trip_bonus: number;
    gross_bonus: number; total_expenses: number; total_settled: number; balance: number;
  };
}

interface Props {
  driver: { phone?: string; driver_name?: string; vehicle_plate?: string; status?: string; user_name?: string };
  onClose: () => void;
  /** true when the driver is viewing their own statement (hides manager-only actions) */
  isDriverView?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const sar  = (v: number) => (v || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
const fmtD = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";
const escapePrintString = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] || char));
const isSafeSignatureData = (value?: string) => !!value &&
  /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value) &&
  value.length <= 1_500_000;

function escapePrintData<T>(value: T): T {
  if (typeof value === "string") return escapePrintString(value) as T;
  if (Array.isArray(value)) return value.map(escapePrintData) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(
      ([key, child]) => [key, escapePrintData(child)]
    )) as T;
  }
  return value;
}

const STATUS_LABEL: Record<string, string> = { active: "نشط", inactive: "غير نشط", on_leave: "إجازة", available: "متاح", busy: "مشغول" };
const STATUS_CLS:   Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700", inactive: "bg-gray-100 text-gray-500",
  on_leave: "bg-blue-100 text-blue-700", available: "bg-emerald-100 text-emerald-700",
  busy: "bg-amber-100 text-amber-700",
};

type TabKey = "activity" | "bonus" | "expenses" | "settlements" | "signatures";

// ── Activity event builder ────────────────────────────────────────────────────
type ActivityEvent = {
  date: string; kind: "order" | "trip" | "rental" | "supply_trip" | "expense" | "settlement";
  label: string; sub: string; amount: number; sign: 1 | -1;
  /** stable ref for selection/marking: e.g. "order:ORD-1" / "trip:12" / "expense:5" */
  refKey: string;
};

// stable ref keys shared by buildActivity + filterStatement
const tripRefKey = (t: StmtTrip) => {
  const from = t.loading_region || t.client_name || "—";
  const to   = t.unloading_region || t.destination || "—";
  return t.id != null ? `trip:${t.id}` : `trip:@${t.date}|${from}|${to}|${t.bonus}`;
};
const rentalRefKey = (r: StmtRental) =>
  r.id != null ? `rental:${r.id}` : `rental:@${r.assigned_at}|${r.driver_bonus}`;

function buildActivity(d: StatementData): ActivityEvent[] {
  const evts: ActivityEvent[] = [];
  d.orders.forEach(o => evts.push({
    date: o.created_at, kind: "order",
    label: `أوردر مُسلَّم — ${o.order_number}`,
    sub: o.loading_point_name || o.delivery_location ? `${o.loading_point_name || "—"} ← ${o.delivery_location || "—"}` : "",
    amount: o.driver_bonus || 0, sign: 1,
    refKey: `order:${o.order_number}`,
  }));
  d.trips.forEach(t => {
    if (!t.bonus) return;
    const from = t.loading_region   || t.client_name || "—";
    const to   = t.unloading_region || t.destination  || "—";
    const vehicle = t.vehicle_plate ? `السيارة ${t.vehicle_plate}` : "";
    evts.push({
      date: t.date, kind: "trip",
      label: `${from} ← ${to}`,
      sub: [vehicle, t.trips_count && t.trips_count > 1 ? `${t.trips_count} ردود` : ""].filter(Boolean).join(" · "),
      amount: t.bonus, sign: 1,
      refKey: tripRefKey(t),
    });
  });
  d.rentals.forEach(r => {
    if (!r.driver_bonus) return;
    evts.push({
      date: r.assigned_at, kind: "rental",
      label: "إيجار خارجي",
      sub: r.pickup_location || r.destination_location ? `${r.pickup_location || "—"} ← ${r.destination_location || "—"}` : "",
      amount: r.driver_bonus, sign: 1,
      refKey: rentalRefKey(r),
    });
  });
  (d.supply_trips || []).forEach(t => {
    if (!t.rental) return;
    evts.push({
      date: t.completed_at, kind: "supply_trip",
      label: `رحلة توريد — ${t.product_name || "توجيه"}`,
      sub: `${t.warehouse_name || "—"} ← ${t.destination_division || "—"}`,
      amount: Number(t.rental) || 0, sign: 1,
      refKey: `supply_trip:${t.id}`,
    });
  });
  d.expenses.forEach(e => evts.push({
    date: e.expense_date, kind: "expense",
    label: `مصروف — ${e.expense_type}`,
    sub: [e.vehicle_plate ? `السيارة ${e.vehicle_plate}` : "", e.description || (e.order_number ? `أوردر ${e.order_number}` : "")].filter(Boolean).join(" · "),
    amount: e.amount, sign: -1,
    refKey: `expense:${e.id}`,
  }));
  return evts.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

const normalizeWhatsappPhone = (value: string) => {
  const digits = value.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `966${digits.slice(1)}`;
  return digits;
};

function getDisplayedBalance(d: StatementData, printedMarks: Map<string, string>) {
  const printedEvents = buildActivity(d).filter(ev => printedMarks.has(ev.refKey));
  const printedNet = printedEvents.reduce((sum, ev) => sum + ev.sign * ev.amount, 0);
  const hasPrinted = printedEvents.length > 0;
  return {
    printedNet,
    hasPrinted,
    value: hasPrinted ? printedNet - d.totals.total_settled : d.totals.balance,
  };
}

const escapeSvgText = (value: unknown) => String(value ?? "—").replace(/[&<>]/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;",
}[char] || char));

async function rasterizeStatementSvg(svg: string, width: number, height: number): Promise<Blob> {
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("تعذر تحميل صورة الكشف"));
      image.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("تعذر إنشاء صورة الكشف");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("تعذر حفظ صورة الكشف");
    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

async function createStatementImage(
  d: StatementData,
  driverName: string,
  fromDate: string,
  toDate: string,
  displayedBalance: number,
): Promise<Blob> {
  const activityRows = buildActivity(d).map(ev => ({
    date: ev.date,
    label: ev.label,
    sub: ev.sub,
    amount: ev.amount,
    sign: ev.sign,
  }));
  const settlementRows = d.settlements.map(s => ({
    date: s.settlement_date || s.created_at || s.delivered_at,
    label: "دفعة تسوية",
    sub: s.notes || "",
    amount: Number(s.allocated_amount) || 0,
    sign: -1 as const,
  }));
  const rows = [...activityRows, ...settlementRows]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const width = 1200;
  const height = Math.min(30000, Math.max(920, 610 + rows.length * 58));
  const periodLabel = (fromDate || toDate)
    ? `الفترة: ${fromDate ? fmtD(fromDate) : "—"} — ${toDate ? fmtD(toDate) : "—"}`
    : "كامل التاريخ";
  const safe = (value: unknown) => escapePrintString(String(value ?? "—"));
  const rowHtml = rows.length > 0
    ? rows.map((row, index) => `
      <tr style="background:${index % 2 ? "#f8fafc" : "#ffffff"}">
        <td style="padding:13px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${safe(fmtD(row.date))}</td>
        <td style="padding:13px 12px;border-bottom:1px solid #e5e7eb;font-weight:700">${safe(row.label)}</td>
        <td style="padding:13px 12px;border-bottom:1px solid #e5e7eb;color:#64748b">${safe(row.sub || "—")}</td>
        <td style="padding:13px 12px;border-bottom:1px solid #e5e7eb;text-align:left;color:${row.sign === 1 ? "#059669" : "#dc2626"};font-weight:900;white-space:nowrap">${row.sign === 1 ? "+" : "-"}${safe(sar(row.amount))}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" style="padding:38px;text-align:center;color:#94a3b8">لا توجد بنود في الكشف</td></tr>`;

  const html = `
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;padding:46px 54px;background:#ffffff;color:#0f172a;direction:rtl;font-family:Arial,'Segoe UI',sans-serif;font-size:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:4px solid #103c68;padding-bottom:22px">
        <div>
          <div style="font-size:30px;font-weight:900;color:#103c68">شركة جيفر التجارية</div>
          <div style="margin-top:6px;color:#64748b;font-size:16px">كشف تسوية سائق</div>
        </div>
        <div style="text-align:left;color:#64748b;font-size:16px;line-height:1.8">
          <div style="font-weight:800;color:#103c68">MKGH</div>
          <div>المملكة العربية السعودية</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px 22px;margin:24px 0;padding:20px 22px;background:#f1f5f9;border-radius:14px">
        <div><span style="color:#64748b">السائق:</span> <strong>${safe(driverName)}</strong></div>
        <div><span style="color:#64748b">الجوال:</span> <strong>${safe(d.driver?.phone || "—")}</strong></div>
        <div><span style="color:#64748b">السيارة:</span> <strong>${safe(d.driver?.vehicle_plate || "—")}</strong></div>
        <div><span style="color:#64748b">الفترة:</span> <strong>${safe(periodLabel)}</strong></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:26px">
        <div style="padding:18px 10px;text-align:center;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px"><div style="font-size:25px;font-weight:900;color:#059669">${safe(sar(d.totals.gross_bonus))}</div><div style="margin-top:7px;color:#64748b;font-size:15px">إجمالي المستحق</div></div>
        <div style="padding:18px 10px;text-align:center;background:#fef2f2;border:1px solid #fecaca;border-radius:12px"><div style="font-size:25px;font-weight:900;color:#dc2626">${safe(sar(d.totals.total_expenses))}</div><div style="margin-top:7px;color:#64748b;font-size:15px">المصروفات</div></div>
        <div style="padding:18px 10px;text-align:center;background:#fffbeb;border:1px solid #fde68a;border-radius:12px"><div style="font-size:25px;font-weight:900;color:#d97706">${safe(sar(d.totals.total_settled))}</div><div style="margin-top:7px;color:#64748b;font-size:15px">إجمالي المدفوع</div></div>
        <div style="padding:18px 10px;text-align:center;background:${displayedBalance >= 0 ? "#eff6ff" : "#fef2f2"};border:1px solid ${displayedBalance >= 0 ? "#bfdbfe" : "#fecaca"};border-radius:12px"><div style="font-size:25px;font-weight:900;color:${displayedBalance >= 0 ? "#103c68" : "#dc2626"}">${safe(sar(Math.abs(displayedBalance)))}</div><div style="margin-top:7px;color:#64748b;font-size:15px">${displayedBalance >= 0 ? "فاضل للسائق" : "عليه"}</div></div>
      </div>
      <div style="font-size:20px;font-weight:900;color:#103c68;margin:0 0 12px">تفاصيل الكشف</div>
      <table style="width:100%;border-collapse:collapse;text-align:right">
        <thead><tr style="background:#103c68;color:white">
          <th style="padding:14px 12px;text-align:right">التاريخ</th>
          <th style="padding:14px 12px;text-align:right">البيان</th>
          <th style="padding:14px 12px;text-align:right">التفاصيل</th>
          <th style="padding:14px 12px;text-align:left">المبلغ</th>
        </tr></thead>
        <tbody>${rowHtml}</tbody>
      </table>
      <div style="margin-top:25px;padding-top:15px;border-top:2px solid #cbd5e1;text-align:center;color:#64748b;font-size:14px">تم إنشاء هذا الكشف من نظام جيفر — ${safe(new Date().toLocaleDateString("ar-SA"))}</div>
    </div>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
  try {
    return await rasterizeStatementSvg(svg, width, height);
  } catch (foreignObjectError) {
    // Some mobile browsers cannot rasterize HTML nested inside SVG foreignObject.
    // Keep a plain-SVG fallback so sharing still works without an extra library.
    const text = (value: unknown, x: number, y: number, size: number, color = "#0f172a", weight = "400", anchor = "start") =>
      `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}px" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" direction="rtl">${escapeSvgText(value)}</text>`;
    const fallbackRows = rows.length > 0 ? rows : [{
      date: "",
      label: "لا توجد بنود في الكشف",
      sub: "",
      amount: 0,
      sign: 1 as const,
    }];
    const rowHeight = 58;
    const fallbackSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="#ffffff"/>
        <g direction="rtl">
          ${text("شركة جيفر التجارية", width - 54, 82, 30, "#103c68", "900")}
          ${text("كشف تسوية سائق", width - 54, 116, 16, "#64748b", "400")}
          ${text("MKGH", 54, 82, 18, "#103c68", "800", "start")}
          ${text("المملكة العربية السعودية", 54, 110, 15, "#64748b", "400", "start")}
          <rect x="54" y="140" width="${width - 108}" height="112" rx="14" fill="#f1f5f9"/>
          ${text(`السائق: ${driverName}`, width - 82, 178, 18, "#0f172a", "700")}
          ${text(`الجوال: ${d.driver?.phone || "—"}`, 620, 178, 18, "#0f172a", "700")}
          ${text(`السيارة: ${d.driver?.vehicle_plate || "—"}`, width - 82, 218, 18, "#0f172a", "700")}
          ${text(periodLabel, 620, 218, 18, "#0f172a", "700")}
          <rect x="54" y="274" width="260" height="96" rx="12" fill="#ecfdf5" stroke="#bbf7d0"/>
          <rect x="326" y="274" width="260" height="96" rx="12" fill="#fef2f2" stroke="#fecaca"/>
          <rect x="598" y="274" width="260" height="96" rx="12" fill="#fffbeb" stroke="#fde68a"/>
          <rect x="870" y="274" width="276" height="96" rx="12" fill="${displayedBalance >= 0 ? "#eff6ff" : "#fef2f2"}" stroke="${displayedBalance >= 0 ? "#bfdbfe" : "#fecaca"}"/>
          ${text(sar(d.totals.gross_bonus), 184, 312, 24, "#059669", "900", "middle")}
          ${text("إجمالي المستحق", 184, 346, 15, "#64748b", "400", "middle")}
          ${text(sar(d.totals.total_expenses), 456, 312, 24, "#dc2626", "900", "middle")}
          ${text("المصروفات", 456, 346, 15, "#64748b", "400", "middle")}
          ${text(sar(d.totals.total_settled), 728, 312, 24, "#d97706", "900", "middle")}
          ${text("إجمالي المدفوع", 728, 346, 15, "#64748b", "400", "middle")}
          ${text(sar(Math.abs(displayedBalance)), 1008, 312, 24, displayedBalance >= 0 ? "#103c68" : "#dc2626", "900", "middle")}
          ${text(displayedBalance >= 0 ? "فاضل للسائق" : "عليه", 1008, 346, 15, "#64748b", "400", "middle")}
          ${text("تفاصيل الكشف", width - 54, 414, 20, "#103c68", "900")}
          <rect x="54" y="438" width="${width - 108}" height="52" fill="#103c68"/>
          ${text("التاريخ", 1090, 471, 17, "#ffffff", "700")}
          ${text("البيان", 800, 471, 17, "#ffffff", "700")}
          ${text("التفاصيل", 500, 471, 17, "#ffffff", "700")}
          ${text("المبلغ", 110, 471, 17, "#ffffff", "700", "start")}
          ${fallbackRows.map((row, index) => {
            const y = 490 + index * rowHeight;
            const amount = row.sign === 1 ? `+${sar(row.amount)}` : `-${sar(row.amount)}`;
            return `
              <rect x="54" y="${y}" width="${width - 108}" height="${rowHeight}" fill="${index % 2 ? "#f8fafc" : "#ffffff"}" stroke="#e5e7eb"/>
              ${text(fmtD(row.date), 1090, y + 36, 16, "#0f172a", "400")}
              ${text(row.label, 800, y + 36, 16, "#0f172a", "700")}
              ${text(row.sub || "—", 500, y + 36, 16, "#64748b", "400")}
              ${text(amount, 110, y + 36, 16, row.sign === 1 ? "#059669" : "#dc2626", "900", "start")}
            `;
          }).join("")}
          ${text(`تم إنشاء هذا الكشف من نظام جيفر — ${new Date().toLocaleDateString("ar-SA")}`, width / 2, height - 25, 14, "#64748b", "400", "middle")}
        </g>
      </svg>`;
    try {
      return await rasterizeStatementSvg(fallbackSvg, width, height);
    } catch {
      throw foreignObjectError;
    }
  }
}

async function createMultiPagePdf(imageBlob: Blob): Promise<Blob> {
  const imageUrl = URL.createObjectURL(imageBlob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("تعذر تحميل صفحات الكشف"));
      image.src = imageUrl;
    });

    const pageWidthPt = 595.28;
    const pageHeightPt = 841.89;
    const sourcePageHeight = Math.floor(image.naturalWidth * pageHeightPt / pageWidthPt);
    const jpegPages: { bytes: Uint8Array; width: number; height: number }[] = [];

    for (let sourceY = 0; sourceY < image.naturalHeight; sourceY += sourcePageHeight) {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = sourcePageHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("تعذر إنشاء صفحة PDF");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const remainingHeight = Math.min(sourcePageHeight, image.naturalHeight - sourceY);
      context.drawImage(
        image,
        0, sourceY, image.naturalWidth, remainingHeight,
        0, 0, canvas.width, remainingHeight,
      );
      const jpegBlob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, "image/jpeg", 0.96)
      );
      if (!jpegBlob) throw new Error("تعذر تجهيز صفحة PDF");
      jpegPages.push({
        bytes: new Uint8Array(await jpegBlob.arrayBuffer()),
        width: canvas.width,
        height: canvas.height,
      });
    }

    const encoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const offsets: number[] = [];
    let byteLength = 0;
    const append = (part: Uint8Array | string) => {
      const bytes = typeof part === "string" ? encoder.encode(part) : part;
      parts.push(bytes);
      byteLength += bytes.byteLength;
    };
    const beginObject = (objectNumber: number) => {
      offsets[objectNumber] = byteLength;
      append(`${objectNumber} 0 obj\n`);
    };
    const endObject = () => append("endobj\n");
    const pageObjects = jpegPages.map((_, index) => 3 + index * 3);
    const objectCount = 2 + jpegPages.length * 3;

    append("%PDF-1.4\n");
    beginObject(1);
    append("<< /Type /Catalog /Pages 2 0 R >>\n");
    endObject();
    beginObject(2);
    append(`<< /Type /Pages /Count ${jpegPages.length} /Kids [${pageObjects.map(n => `${n} 0 R`).join(" ")}] >>\n`);
    endObject();

    jpegPages.forEach((page, index) => {
      const pageObject = pageObjects[index];
      const contentObject = pageObject + 1;
      const imageObject = pageObject + 2;
      const drawCommand = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im0 Do\nQ\n`;

      beginObject(pageObject);
      append(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>\n`);
      endObject();

      beginObject(contentObject);
      append(`<< /Length ${encoder.encode(drawCommand).byteLength} >>\nstream\n${drawCommand}endstream\n`);
      endObject();

      beginObject(imageObject);
      append(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.byteLength} >>\nstream\n`);
      append(page.bytes);
      append("\nendstream\n");
      endObject();
    });

    const xrefOffset = byteLength;
    append(`xref\n0 ${objectCount + 1}\n`);
    append("0000000000 65535 f \n");
    for (let objectNumber = 1; objectNumber <= objectCount; objectNumber++) {
      append(`${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`);
    }
    append(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    return new Blob(parts.map(part =>
      part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer
    ), { type: "application/pdf" });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

const KIND_ICON: Record<string, React.ReactNode> = {
  order:       <Package    size={13} className="text-emerald-500" />,
  trip:        <Car        size={13} className="text-blue-500"    />,
  rental:      <ShoppingBag size={13} className="text-purple-500" />,
  supply_trip: <Truck      size={13} className="text-orange-500"  />,
  expense:     <Minus      size={13} className="text-red-500"     />,
  settlement:  <CreditCard  size={13} className="text-amber-600"  />,
};

// ── Selective statement builder ──────────────────────────────────────────────
/** Build a StatementData subset containing only the selected refKeys, with recomputed totals */
function filterStatement(d: StatementData, sel: Set<string>): StatementData {
  const orders       = d.orders.filter(o => sel.has(`order:${o.order_number}`));
  const trips        = d.trips.filter(t => sel.has(tripRefKey(t)));
  const rentals      = d.rentals.filter(r => sel.has(rentalRefKey(r)));
  const supply_trips = (d.supply_trips || []).filter(t => sel.has(`supply_trip:${t.id}`));
  const expenses     = d.expenses.filter(e => sel.has(`expense:${e.id}`));

  const order_bonus       = orders.reduce((s, o) => s + (o.driver_bonus || 0), 0);
  const trip_bonus        = trips.reduce((s, t) => s + (t.bonus || 0), 0);
  const rental_bonus      = rentals.reduce((s, r) => s + (r.driver_bonus || 0), 0);
  const supply_trip_bonus = supply_trips.reduce((s, t) => s + (Number(t.rental) || 0), 0);
  const gross_bonus       = order_bonus + trip_bonus + rental_bonus + supply_trip_bonus;
  const total_expenses    = expenses.reduce((s, e) => s + (e.amount || 0), 0);

  return {
    ...d, orders, trips, rentals, supply_trips, expenses,
    totals: {
      order_bonus, trip_bonus, rental_bonus, supply_trip_bonus,
      gross_bonus, total_expenses,
      total_settled: 0, balance: gross_bonus - total_expenses,
    },
  };
}

// ── Print helper ─────────────────────────────────────────────────────────────

function formatTripPrintDates(dates: string[]): string[] {
  const byMonth = new Map<string, Set<number>>();
  for (const date of dates) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(date || "");
    if (!match) continue;
    const [, year, month, day] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (parsed.getFullYear() !== Number(year) || parsed.getMonth() + 1 !== Number(month) || parsed.getDate() !== Number(day)) continue;
    const monthKey = `${year}-${month}`;
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, new Set());
    byMonth.get(monthKey)!.add(Number(day));
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, days]) => {
      const [year, month] = monthKey.split("-");
      return `${[...days].sort((a, b) => a - b).join("-")} / ${Number(month)} / ${year}`;
    });
}

/** Group trips by the vehicle and route they were recorded against. */
function groupTripsForPrint(trips: StmtTrip[]): { vehiclePlate: string; from: string; to: string; dates: string[]; driverExpense: number; count: number; total: number }[] {
  const map = new Map<string, { vehiclePlate: string; from: string; to: string; dates: string[]; driverExpense: number; count: number; total: number }>();
  for (const t of trips) {
    const from = t.loading_region || t.client_name || "—";
    const to   = t.unloading_region || t.destination || "—";
    const vehiclePlate = t.vehicle_plate || "—";
    const cnt  = t.trips_count && t.trips_count > 0 ? t.trips_count : 1;
    const de   = Number(t.driver_expense) || Number(t.bonus) || 0;
    const key  = `${vehiclePlate}||${from}||${to}||${de}`;
    const existing = map.get(key);
    if (existing) {
      existing.dates.push(t.date);
      existing.count += cnt;
      existing.total += de * cnt;
      // keep driver_expense consistent (use the one that's non-zero)
      if (!existing.driverExpense && de) existing.driverExpense = de;
    } else {
      map.set(key, { vehiclePlate, from, to, dates: [t.date], driverExpense: de, count: cnt, total: de * cnt });
    }
  }
  return Array.from(map.values());
}

type PrintedStatementRecord = { id?: number; filter_ref: string };
export interface StoredStatementPrint {
  version: 1;
  statement: StatementData;
  driver_name: string;
  date_from?: string;
  date_to?: string;
  filter_ref: string;
  printed_at: string;
}

export const COMPANY_LETTERHEAD_PRINT_CSS = `
.letterhead { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #103c68; padding-bottom:8px; margin-bottom:0; }
.letterhead-side { flex:1; font-size:11px; line-height:1.7; }
.letterhead-side.ltr { direction:ltr; text-align:left; }
.letterhead-side.rtl { direction:rtl; text-align:right; }
.letterhead-side .co-name { font-size:14px; font-weight:900; color:#103c68; }
.letterhead-center { text-align:center; flex-shrink:0; padding:0 14px; }
.letterhead-center img { height:64px; object-fit:contain; display:block; margin:0 auto; }
`;

export function buildCompanyLetterheadHtml(logoUrl: string) {
  return `
<div class="letterhead">
  <div class="letterhead-side rtl">
    <div class="co-name">شركة جيفر التجارية</div>
    <div>س.ت : ١١٣١٣٠٣١٣٢</div>
    <div>المملكة العربية السعودية</div>
  </div>
  <div class="letterhead-center">
    <img src="${logoUrl}" alt="جيفر" onerror="this.style.display='none'" />
    <div style="font-size:11px;font-weight:900;letter-spacing:2px;color:#103c68;text-align:center;margin-top:2px">MKGH</div>
  </div>
  <div class="letterhead-side ltr">
    <div class="co-name">Jefer Trading company</div>
    <div>C.R : 1131303132</div>
    <div>kingdom of saudi arabia</div>
  </div>
</div>`;
}

function doPrint(
  d: StatementData,
  driverName: string,
  fromDate?: string,
  toDate?: string,
  onAfterPrint?: () => void,
  signatureData?: string,
  stmtRecordPromise?: Promise<PrintedStatementRecord>,
  onSnapshotReady?: (recordId: number, filterRef: string) => Promise<void>,
  printedAt?: string,
  previewOnly = false,
  onPreviewConfirm?: (mode: "new" | "edit", dialogWindow: Window) => Promise<PrintedStatementRecord>,
) {
  d = escapePrintData(d);
  driverName = escapePrintString(driverName);
  signatureData = isSafeSignatureData(signatureData) ? signatureData : undefined;
  const { totals } = d;
  const periodLabel = (fromDate || toDate)
    ? `الفترة: ${fromDate ? new Date(fromDate).toLocaleDateString("ar-SA") : "—"} — ${toDate ? new Date(toDate).toLocaleDateString("ar-SA") : "—"}`
    : "كامل التاريخ";
  const buildRows = (rows: { label: string; sub: string; date: string; amount: number; sign: 1 | -1 }[]) =>
    rows.map((r, i) => `
      <tr style="background:${i%2?"#f9fafb":"#fff"}">
        <td>${fmtD(r.date)}</td>
        <td>${r.label}</td>
        <td>${r.sub || "—"}</td>
        <td style="color:${r.sign===1?"#059669":"#dc2626"};font-weight:bold;text-align:left">${r.sign===1?"+":"-"}${sar(r.amount)}</td>
      </tr>`).join("");

  const activity  = buildActivity(d);
  const groupedTrips = groupTripsForPrint(d.trips);
  const logoUrl   = `${window.location.origin}/jefer-logo-new.png`;

  const sigs = ["السائق","مشرف الحركة","المحاسب","رئيس الحسابات"];
  const previewControls = previewOnly ? `
    <div class="preview-controls" id="preview-controls">
      <div class="preview-title">هذه معاينة قبل اعتماد الكشف</div>
      <div class="preview-note">لن يتم إنشاء رقم كشف أو تسجيل عهدة إلا بعد الضغط على «اعتماد وطباعة».</div>
      <div class="preview-actions">
        <button id="preview-cancel" type="button">إلغاء</button>
        <button id="preview-edit" type="button">تعديل كشف قديم</button>
        <button id="preview-approve" type="button">اعتماد وطباعة كشف جديد</button>
      </div>
      <div id="preview-status" class="preview-status"></div>
    </div>` : "";

  const w = window.open("", "_blank", "width=820,height=1160");
  if (!w) return;
  const tripTotal = groupedTrips.reduce((s,g)=>s+g.total,0);
  const headerHtml = `
${buildCompanyLetterheadHtml(logoUrl)}
<div class="driver-info-bar">
  <div class="di-item"><span class="di-label">رقم الكشف:</span><span class="stmt-ref-num" style="font-family:monospace;font-weight:900;color:#103c68">—</span></div>
  <div class="di-item"><span class="di-label">السائق:</span>${driverName}</div>
  <div class="di-item"><span class="di-label">الجوال:</span>${d.driver?.phone || "—"}</div>
  <div class="di-item"><span class="di-label">السيارة:</span>${d.driver?.vehicle_plate || "—"}</div>
   <div class="di-item"><span class="di-label">تاريخ الطباعة:</span>${new Date(printedAt || Date.now()).toLocaleDateString("ar-SA")}</div>
  ${periodLabel ? `<div class="di-item"><span class="di-label">الفترة:</span>${periodLabel}</div>` : ""}
</div>`;

  w.document.write(`
<!DOCTYPE html><html dir="rtl"><head>
<meta charset="utf-8">
<title>كشف السائق — ${driverName}</title>
<style>
  @page { size: A4 portrait; margin: 10mm 16mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; direction: rtl; color: #111; background: #fff; }
  /* ── جدول الغلاف لتكرار الهيدر والفوتر ── */
  .page-wrap { width: 100%; border-collapse: collapse; }
  .page-wrap > thead > tr > td { padding-bottom: 6px; }
  .page-wrap > tfoot > tr > td {
    border-top: 1px solid #c7d6f5; padding-top: 5px;
    font-size: 10px; color: #6b7280; text-align: center;
  }
  .page-wrap > tbody > tr > td { padding-top: 4px; }
  /* ── ترويسة الشركة ── */
  ${COMPANY_LETTERHEAD_PRINT_CSS}
  /* ── بيانات السائق ── */
  .driver-info-bar { background:#f0f4ff; border:1px solid #c7d6f5; border-radius:6px; padding:6px 14px; margin:8px 0 0; display:flex; gap:18px; flex-wrap:wrap; align-items:center; }
  .driver-info-bar .di-item { font-size:11px; font-weight:700; color:#1e3a6e; }
  .driver-info-bar .di-label { font-weight:500; color:#555; margin-left:4px; }
  /* ── كروت الملخص ── */
  .cards { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; page-break-inside:avoid; }
  .card { flex:1; min-width:110px; border:1px solid #e5e7eb; border-radius:8px; padding:8px 12px; text-align:center; }
  .card-val { font-size:15px; font-weight:800; }
  .card-lbl { font-size:10.5px; color:#444; font-weight:600; margin-top:2px; }
  .green { color:#059669; } .red { color:#dc2626; } .blue { color:#2563eb; }
  /* ── جداول المحتوى ── */
  .data-table { width:100%; border:2px solid #103c68; border-collapse:collapse; margin-bottom:16px; font-size:11px; }
  .data-table th { background:#103c68; color:#fff; padding:6px 8px; text-align:right; font-weight:600; }
  .data-table td { padding:5px 8px; border-bottom:1px solid #f3f4f6; }
  .data-table th:not(:last-child), .data-table td:not(:last-child) { border-left:1px solid #d1d5db; }
  .data-table tfoot td { background:#eff6ff; padding:8px 10px; }
  .trip-dates { min-width:76px; font-size:10px; font-weight:600; color:#374151; line-height:1.35; }
  /* عمود الملاحظات */
  .col-notes { width: 120px; min-width: 100px; border-right: 1px dashed #d1d5db !important; }
  h2 { font-size:13px; color:#103c68; margin:12px 0 5px; border-bottom:2px solid #103c68; padding-bottom:3px; page-break-after:avoid; }
  /* ── صندوق الصافي ── */
  .net-box { border:2px solid #103c68; border-radius:8px; padding:10px 18px; display:inline-block; margin-top:6px; margin-bottom:18px; page-break-inside:avoid; }
  .net-box .val { font-size:20px; font-weight:900; color:#103c68; }
  /* ── التوقيعات ── */
  .sigs { display:flex; border-top:2px solid #103c68; padding-top:14px; margin-top:18px; page-break-inside:avoid; }
  .sig-box { flex:1; text-align:center; border-left:1px solid #d1d5db; padding:0 8px; }
  .sig-box:last-child { border-left:none; }
  .sig-box .sig-name { font-size:11px; font-weight:700; color:#103c68; margin-bottom:24px; }
  .sig-box .sig-line { border-top:1px solid #9ca3af; margin:0 8px; }
  /* ── طباعة ── */
  @media print {
    * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    body { margin:0; padding:0; }
    h2 { page-break-after:avoid; }
    .data-table { page-break-inside:auto; }
    .data-table tr { page-break-inside:avoid; page-break-after:auto; }
    .page-wrap > thead { display:table-header-group; }
    .page-wrap > tfoot { display:table-footer-group; }
    .sigs { page-break-inside:avoid; }
    .net-box { page-break-inside:avoid; }
    .preview-controls { display:none !important; }
  }
  .preview-controls { max-width:760px; margin:18px auto; padding:14px 18px; border:1px solid #bfdbfe; border-radius:10px; background:#eff6ff; text-align:center; direction:rtl; }
  .preview-title { color:#103c68; font-size:14px; font-weight:900; }
  .preview-note { margin-top:5px; color:#475569; font-size:11px; }
  .preview-actions { display:flex; justify-content:center; gap:8px; margin-top:12px; }
  .preview-actions button { border:0; border-radius:7px; padding:8px 22px; cursor:pointer; font:700 12px "Segoe UI",Arial,sans-serif; }
  #preview-cancel { background:#e5e7eb; color:#374151; }
  #preview-edit { background:#d97706; color:#fff; }
  #preview-approve { background:#103c68; color:#fff; }
  .preview-actions button:disabled { opacity:.6; cursor:wait; }
  .preview-status { margin-top:8px; color:#b45309; font-size:11px; font-weight:700; }
</style></head><body>

<table class="page-wrap">
  <thead><tr><td>${headerHtml}</td></tr></thead>
  <tfoot><tr><td>
    <span>رقم الكشف: <strong class="stmt-ref-num" style="color:#103c68">—</strong></span>
    &nbsp;·&nbsp;
    <span>كشف السائق: <strong>${driverName}</strong></span>
    &nbsp;·&nbsp;
    <span style="float:left">صفحة <span class="pg-counter" style="font-weight:700"></span></span>
  </td></tr></tfoot>
  <tbody><tr><td>

<div class="cards" style="margin-top:10px">
  <div class="card"><div class="card-val blue">${sar(tripTotal)}</div><div class="card-lbl">مصروف السائق (رحلات)</div></div>
  ${totals.supply_trip_bonus ? `<div class="card"><div class="card-val" style="color:#ea580c">${sar(totals.supply_trip_bonus)}</div><div class="card-lbl">إيجار رحلات التوريد</div></div>` : ""}
  <div class="card"><div class="card-val red">${sar(totals.total_expenses)}</div><div class="card-lbl">إجمالي المحروقات</div></div>
  <div class="card"><div class="card-val">${sar(totals.gross_bonus - totals.total_expenses)}</div><div class="card-lbl">صافي المستحق للسائق</div></div>
</div>

${d.orders.length ? `
<h2>تفصيل بونص الأوردرات (${d.orders.length} أوردر)</h2>
<table class="data-table">
  <thead><tr><th>رقم الأوردر</th><th>التاريخ</th><th>رقم السيارة</th><th>مكان التحميل</th><th>التسليم</th><th>الكمية</th><th>البونص</th><th class="col-notes">ملاحظات</th></tr></thead>
  <tbody>${d.orders.map((o,i) => `
    <tr style="background:${i%2?"#f9fafb":"#fff"}">
      <td>${o.order_number}</td><td>${fmtD(o.created_at)}</td>
      <td style="font-family:monospace;font-weight:bold">${o.vehicle_plate||"—"}</td>
      <td>${o.loading_point_name||"—"}</td><td>${o.delivery_location||"—"}</td>
      <td>${(o.quantity||0).toLocaleString("ar-SA")}</td>
      <td class="green" style="font-weight:bold">${sar(o.driver_bonus)}</td>
      <td class="col-notes"></td>
    </tr>`).join("")}
  </tbody>
</table>` : ""}

${groupedTrips.length ? `
<h2>تفصيل مصروف السائق (${groupedTrips.reduce((s,r)=>s+r.count,0)} رد)</h2>
<table class="data-table">
  <thead><tr><th>رقم السيارة</th><th class="trip-dates">التواريخ</th><th>مكان التحميل</th><th>مكان التنزيل</th><th>مصروف السائق/الرد</th><th style="text-align:center">عدد الردود</th><th>إجمالي المصروف</th><th class="col-notes">ملاحظات</th></tr></thead>
  <tbody>${groupedTrips.map((g,i) => `
    <tr style="background:${i%2?"#f9fafb":"#fff"}">
      <td style="font-family:monospace;font-weight:bold">${g.vehiclePlate}</td>
      <td class="trip-dates">${formatTripPrintDates(g.dates).map(text => `<div dir="ltr" style="text-align:right">${text}</div>`).join("") || "—"}</td>
      <td>${g.from}</td>
      <td>${g.to}</td>
      <td>${g.driverExpense > 0 ? g.driverExpense.toLocaleString("ar-SA",{minimumFractionDigits:0,maximumFractionDigits:2}) : "—"}</td>
      <td style="text-align:center;font-weight:bold;font-size:14px">${g.count}</td>
      <td class="green" style="font-weight:bold">${g.total > 0 ? sar(g.total) : "—"}</td>
      <td class="col-notes"></td>
    </tr>`).join("")}
  </tbody>
  <tfoot><tr>
    <td colspan="6" style="font-weight:700;color:#374151">
      إجمالي الردود: ${groupedTrips.reduce((s,r)=>s+r.count,0).toLocaleString("ar-SA")}
    </td>
    <td style="font-weight:900;color:#059669;text-align:left">${sar(tripTotal)}</td>
    <td class="col-notes"></td>
  </tr></tfoot>
</table>` : ""}

${d.expenses.length ? `
<h2>تفصيل المصروفات (${d.expenses.length} مصروف)</h2>
<table class="data-table">
  <thead><tr><th>التاريخ</th><th>رقم السيارة</th><th>النوع</th><th>الوصف</th><th>المبلغ</th><th class="col-notes">ملاحظات</th></tr></thead>
  <tbody>${d.expenses.map((e,i) => `
    <tr style="background:${i%2?"#f9fafb":"#fff"}">
      <td>${fmtD(e.expense_date)}</td><td style="font-family:monospace;font-weight:bold">${e.vehicle_plate||"—"}</td><td>${e.expense_type||"—"}</td>
      <td>${e.description||e.order_number||"—"}</td>
      <td class="red" style="font-weight:bold">${sar(e.amount)}</td>
      <td class="col-notes"></td>
    </tr>`).join("")}
  </tbody>
</table>` : ""}

<div class="net-box">
  <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-end">
    <div style="text-align:center">
      <div style="font-size:10.5px;color:#6b7280;margin-bottom:3px">إجمالي المستحق الأول</div>
      <div class="val" style="font-size:17px">${sar(totals.gross_bonus)}</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:10.5px;color:#6b7280;margin-bottom:3px">إجمالي مصروف السائق (رحلات)</div>
      <div class="val" style="font-size:17px;color:#2563eb">${sar(tripTotal)}</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:10.5px;color:#6b7280;margin-bottom:3px">إجمالي المحروقات</div>
      <div class="val" style="font-size:17px;color:#dc2626">${sar(totals.total_expenses)}</div>
    </div>
    <div style="text-align:center;border-right:2px solid #103c68;padding-right:24px">
      <div style="font-size:10.5px;color:#6b7280;margin-bottom:3px">صافي المستحق للسائق</div>
      <div class="val">${sar(totals.gross_bonus - totals.total_expenses)}</div>
    </div>
  </div>
</div>

<div class="sigs">
  ${sigs.map((s, i) => `
  <div class="sig-box">
    <div class="sig-name">${s}</div>
    ${i === 0 && signatureData
      ? `<img src="${signatureData}" alt="توقيع السائق" style="max-height:56px;max-width:90%;margin:0 auto;display:block;border-bottom:1px solid #9ca3af" />`
      : `<div class="sig-line"></div>`}
    ${i === 0 ? `<div style="margin-top:18px"><div style="font-size:10px;font-weight:700;color:#103c68;margin-bottom:20px">البصمة</div><div style="border-top:1px solid #9ca3af;margin:0 8px"></div></div>` : ""}
  </div>`).join("")}
</div>
${signatureData ? `<div style="text-align:center;font-size:10px;color:#6b7280;margin-top:4px">✓ تم التوقيع الرقمي من السائق — ${new Date().toLocaleDateString("ar-SA")}</div>` : ""}

  </td></tr></tbody>
</table>

${previewControls}

<script>
(function(){
  // ترقيم الصفحات: يُحقن قبل الطباعة
  var pageNum = 1;
  window.addEventListener('beforeprint', function(){
    // نحاول تقدير عدد الصفحات — لكن نكتفي بترقيم تصاعدي
    document.querySelectorAll('.pg-counter').forEach(function(el){ el.textContent = String(pageNum++); });
  });
})();
</script>

</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(async () => {
    if (previewOnly) {
      const approveButton = w.document.getElementById("preview-approve") as HTMLButtonElement | null;
      const editButton = w.document.getElementById("preview-edit") as HTMLButtonElement | null;
      const cancelButton = w.document.getElementById("preview-cancel");
      const status = w.document.getElementById("preview-status");
      cancelButton?.addEventListener("click", () => w.close(), { once: true });
      const approve = async (mode: "new" | "edit") => {
        if (!onPreviewConfirm || !approveButton || !editButton) return;
        approveButton.disabled = true;
        editButton.disabled = true;
        if (status) status.textContent = mode === "new"
          ? "جاري إنشاء رقم الكشف وتسجيله..."
          : "جاري اختيار الكشف القديم وتحديثه...";
        try {
          const record = await onPreviewConfirm(mode, w);
          if (record.filter_ref) {
            w.document.querySelectorAll(".stmt-ref-num").forEach(el => { el.textContent = record.filter_ref; });
          }
          w.document.querySelectorAll(".pg-counter").forEach(el => { el.textContent = "1"; });
          if (record.id && onSnapshotReady) {
            await onSnapshotReady(record.id, record.filter_ref);
          }
          w.document.getElementById("preview-controls")?.remove();
          w.addEventListener("afterprint", () => { onAfterPrint?.(); }, { once: true });
          w.print();
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (status) status.textContent = message || "تعذر اعتماد الكشف. لم تبدأ الطباعة؛ حاول مرة أخرى.";
          approveButton.disabled = false;
          editButton.disabled = false;
        }
      };
      approveButton?.addEventListener("click", () => { void approve("new"); });
      editButton?.addEventListener("click", () => { void approve("edit"); });
      return;
    }
    // Inject the assigned statement number before saving or printing the document.
    if (stmtRecordPromise) {
      try {
        const record = await stmtRecordPromise;
        const ref = record.filter_ref;
        if (ref) {
          w.document.querySelectorAll(".stmt-ref-num").forEach(el => { el.textContent = ref; });
        }
        // Freeze the same counter value that the initial print dialog will show.
        w.document.querySelectorAll(".pg-counter").forEach(el => { el.textContent = "1"; });
        // Persist a validated data snapshot, never HTML supplied by the browser.
        if (record.id && onSnapshotReady) {
          await onSnapshotReady(record.id, ref);
        }
      } catch {
        alert("تعذر حفظ النسخة الثابتة من الكشف. لن تبدأ الطباعة حتى لا يُسجَّل كشف لا يمكن إعادة طباعته لاحقاً.");
        w.close();
        return;
      }
    }
    // Register BEFORE print() — some browsers dispatch afterprint synchronously
    // inside print(), so a post-print assignment would miss the event entirely.
    w.addEventListener("afterprint", () => { onAfterPrint?.(); }, { once: true });
    w.print();
  }, 600);
}

export function printSavedDriverStatement(snapshot: StoredStatementPrint) {
  doPrint(
    snapshot.statement,
    snapshot.driver_name,
    snapshot.date_from,
    snapshot.date_to,
    undefined,
    undefined,
    Promise.resolve({ filter_ref: snapshot.filter_ref }),
    undefined,
    snapshot.printed_at,
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function DriverStatementModal({ driver, onClose, isDriverView = false }: Props) {
  const phone = driver.phone || "";
  const { token, user: authUser } = useAuth();
  const canMutateExpenses = authUser?.role === "admin" || authUser?.role === "supervisor";
  const [companyVehiclePlates, setCompanyVehiclePlates] = useState<string[]>([]);
  const [companyVehiclesLoading, setCompanyVehiclesLoading] = useState(false);
  const [companyVehiclesError, setCompanyVehiclesError] = useState(false);
  useEffect(() => {
    if (!canMutateExpenses) {
      setCompanyVehiclePlates([]);
      setCompanyVehiclesLoading(false);
      setCompanyVehiclesError(false);
      return;
    }
    let active = true;
    setCompanyVehiclesLoading(true);
    setCompanyVehiclesError(false);
    fetch("/api/fleet-vehicles-list", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows = await response.json() as { plate_number?: string }[];
        if (active) {
          setCompanyVehiclePlates(
            Array.isArray(rows)
              ? [...new Set(rows.map(row => String(row.plate_number || "").trim()).filter(Boolean))]
              : [],
          );
        }
      })
      .catch(() => {
        if (active) {
          setCompanyVehiclePlates([]);
          setCompanyVehiclesError(true);
        }
      })
      .finally(() => {
        if (active) setCompanyVehiclesLoading(false);
      });
    return () => { active = false; };
  }, [canMutateExpenses, token]);
  const [stmt, setStmt] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [tab, setTab] = useRememberedState<TabKey>("driver-statement-tab", "activity");
  const overlayRef = useRef<HTMLDivElement>(null);

  // date range filter — initialise from URL search params so the range
  // survives modal close/reopen and can be shared via link
  const [fromDate, setFromDate] = useState<string>(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("stmt_from") || "";
  });
  const [toDate, setToDate] = useState<string>(() => {
    const sp = new URLSearchParams(window.location.search);
    return sp.get("stmt_to") || "";
  });
  const [vehicleFilter, setVehicleFilter] = useRememberedState("driver-statement-vehicle-filter", "");

  // keep URL in sync whenever the date range changes
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (fromDate) sp.set("stmt_from", fromDate); else sp.delete("stmt_from");
    if (toDate)   sp.set("stmt_to",   toDate);   else sp.delete("stmt_to");
    const newUrl = sp.toString()
      ? `${window.location.pathname}?${sp.toString()}`
      : window.location.pathname;
    window.history.replaceState(null, "", newUrl);
  }, [fromDate, toDate]);

  // settlement form (manual)
  const [settleForm, setSettleForm] = useState({ amount: "", notes: "", settlement_date: new Date().toISOString().slice(0, 10) });
  const [settleSaving, setSettleSaving] = useState(false);
  const [settleError, setSettleError] = useState("");


  // deliver deferred settlement
  const [deliveringId, setDeliveringId] = useState<number | null>(null);

  // ── التحديد المزدوج في سجل النشاط ─────────────────────────────────────────
  // "print" = تحديد للطباعة، "mark" = تمييز يدوي (تم طباعته)
  const [selMode, setSelMode]           = useState<"print" | "mark" | null>(null);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [printedMarks, setPrintedMarks] = useState<Map<string, string>>(new Map());
  const [printedStatementRefs, setPrintedStatementRefs] = useState<Map<string, string>>(new Map());
  const [batchMarks, setBatchMarks]     = useState<Map<string, string>>(new Map()); // refKey → batch_key
  const [signatures, setSignatures]     = useState<Map<string, string>>(new Map()); // batch_key → signed_at
  const [marksSaving, setMarksSaving]   = useState(false);
  const [sigPadBatchKey, setSigPadBatchKey] = useState<string | null>(null);
  const [sigSaving,      setSigSaving]      = useState(false);
  const [sharingStatement, setSharingStatement] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [preparedStatementPdf, setPreparedStatementPdf] = useState<File | null>(null);

  useEffect(() => {
    setPreparedStatementPdf(null);
  }, [stmt, fromDate, toDate, printedMarks]);

  const marksReqSeq = useRef(0);
  const loadPrintedMarks = () => {
    if (!phone) return;
    const seq = ++marksReqSeq.current;
    fetch(`/api/driver-settlements/printed-marks/${encodeURIComponent(phone)}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: { item_type: string; item_ref: string; marked_at: string; batch_key?: string; statement_ref?: string | null }[]) => {
        if (seq !== marksReqSeq.current) return;
        const map = new Map<string, string>();
        const bm  = new Map<string, string>();
        const refs = new Map<string, string>();
        (Array.isArray(rows) ? rows : []).forEach(r => {
          const k = `${r.item_type}:${r.item_ref}`;
          map.set(k, r.marked_at || "");
          if (r.batch_key) bm.set(k, r.batch_key);
          if (r.statement_ref) refs.set(k, r.statement_ref);
        });
        setPrintedMarks(map);
        setBatchMarks(bm);
        setPrintedStatementRefs(refs);
        // Load signatures for all batch_keys
        fetch(`/api/driver-settlements/statements/signatures/${encodeURIComponent(phone)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then(r2 => r2.ok ? r2.json() : [])
          .then((sigs: { batch_key: string; signed_at: string }[]) => {
            const sm = new Map((Array.isArray(sigs) ? sigs : []).map(s => [s.batch_key, s.signed_at]));
            setSignatures(sm);
          })
          .catch(() => {});
      })
      .catch(() => {});
  };
  useEffect(() => { loadPrintedMarks(); }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const printedLabel = (refKey: string) => {
    const markedAt = printedMarks.get(refKey);
    if (markedAt === undefined) return null;
    const statementRef = printedStatementRefs.get(refKey);
    return (
      <span className="mr-1 inline-block rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-black text-violet-700"
        title={markedAt ? `طُبع بتاريخ ${new Date(markedAt).toLocaleString("ar-SA")}${statementRef ? ` في الكشف ${statementRef}` : ""}` : "طُبع"}>
        طُبع{statementRef ? ` ${statementRef}` : ""} · {markedAt ? fmtD(markedAt) : "—"}
      </span>
    );
  };

  const shareStatement = async () => {
    if (!stmt || sharingStatement) return;
    setSharingStatement(true);
    setShareNotice("");
    const driverName = stmt.driver?.driver_name || driver.driver_name || phone;
    const balance = getDisplayedBalance(stmt, printedMarks);
    const periodLabel = (fromDate || toDate)
      ? `${fromDate ? fmtD(fromDate) : "—"} — ${toDate ? fmtD(toDate) : "—"}`
      : "كامل التاريخ";
    const message = [
      `السلام عليكم ${driverName}،`,
      `هذا كشف التسوية للفترة: ${periodLabel}.`,
      `${balance.value >= 0 ? "الفاضل لك" : "المطلوب عليك"}: ${sar(Math.abs(balance.value))}`,
    ].join("\n");
    const openWhatsappText = () => {
      const whatsappPhone = normalizeWhatsappPhone(phone);
      if (!whatsappPhone) {
        setShareNotice("تعذر فتح واتساب لأن رقم السائق غير مسجل.");
        return false;
      }
      setShareNotice("تعذرت مشاركة ملف PDF؛ جارٍ فتح واتساب السائق بالرسالة المكتوبة.");
      window.location.href = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`;
      return true;
    };

    if (!preparedStatementPdf) {
      try {
        const imageBlob = await createStatementImage(
          stmt,
          driverName,
          fromDate,
          toDate,
          balance.value,
        );
        const pdfBlob = await createMultiPagePdf(imageBlob);
        setPreparedStatementPdf(new File(
          [pdfBlob],
          `كشف-تسوية-${driverName.replace(/[^\p{L}\p{N}_-]+/gu, "-") || "السائق"}.pdf`,
          { type: "application/pdf" },
        ));
        setShareNotice("تم تجهيز ملف PDF متعدد الصفحات. اضغط «مشاركة PDF» لإرساله.");
      } catch (error) {
        console.error("driver statement PDF generation failed", error);
        openWhatsappText();
      } finally {
        setSharingStatement(false);
      }
      return;
    }

    try {
      const canShareFile = typeof navigator.share === "function" &&
        (!navigator.canShare || navigator.canShare({ files: [preparedStatementPdf] }));
      if (canShareFile) {
        try {
          await navigator.share({
            files: [preparedStatementPdf],
            title: `كشف تسوية ${driverName}`,
            text: message,
          });
          setShareNotice("تم فتح المشاركة — اختر واتساب ثم أرسل ملف PDF للسائق.");
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            setShareNotice("تم إلغاء المشاركة. ملف PDF ما زال جاهزًا ويمكنك المحاولة مرة أخرى.");
            return;
          }
          openWhatsappText();
          return;
        }
      }

      openWhatsappText();
    } catch (error) {
      console.error("driver statement sharing failed", error);
      openWhatsappText();
    } finally {
      setSharingStatement(false);
    }
  };

  const enterSelMode = (mode: "print" | "mark") => {
    setSelMode(prev => (prev === mode ? null : mode));
    setSelected(new Set());
  };
  const toggleSelected = (refKey: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(refKey)) next.delete(refKey); else next.add(refKey);
      return next;
    });
  };

  const refKeysToItems = (keys: Set<string>) =>
    Array.from(keys).map(k => {
      const idx = k.indexOf(":");
      return { type: k.slice(0, idx), ref: k.slice(idx + 1) };
    });

  const savePrintedMarks = async (keys: Set<string>, batchKey?: string) => {
    if (keys.size === 0 || !phone) return;
    await fetch("/api/driver-settlements/printed-marks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driver_phone: phone, items: refKeysToItems(keys), batch_key: batchKey }),
    }).catch(() => {});
  };

  const markSelected = async () => {
    if (selected.size === 0) return;
    setMarksSaving(true);
    await savePrintedMarks(selected);
    setMarksSaving(false);
    setSelected(new Set());
    setSelMode(null);
    loadPrintedMarks();
  };

  const unmarkSelected = async () => {
    if (selected.size === 0 || !phone) return;
    setMarksSaving(true);
    await fetch("/api/driver-settlements/printed-marks", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driver_phone: phone, items: refKeysToItems(selected) }),
    }).catch(() => {});
    setMarksSaving(false);
    setSelected(new Set());
    setSelMode(null);
    loadPrintedMarks();
  };

  const printSelected = () => {
    if (!stmt || selected.size === 0) return;
    const snapshotDriverName = stmt.driver?.driver_name || driver.driver_name || phone;
    const printedAt = new Date().toISOString();

    const vehicleByRef = new Map<string, string>();
    stmt.orders.forEach(item => vehicleByRef.set(`order:${item.order_number}`, item.vehicle_plate || ""));
    stmt.trips.forEach(item => vehicleByRef.set(tripRefKey(item), item.vehicle_plate || ""));
    stmt.rentals.forEach(item => vehicleByRef.set(rentalRefKey(item), item.vehicle_plate || ""));
    (stmt.supply_trips || []).forEach(item => vehicleByRef.set(`supply_trip:${item.id}`, item.vehicle_plate || ""));
    stmt.expenses.forEach(item => vehicleByRef.set(`expense:${item.id}`, item.vehicle_plate || ""));

    const selectedByVehicle = new Map<string, Set<string>>();
    selected.forEach(refKey => {
      const vehiclePlate = vehicleByRef.get(refKey) || stmt.driver?.vehicle_plate || driver.vehicle_plate || "";
      const vehicleSelection = selectedByVehicle.get(vehiclePlate) || new Set<string>();
      vehicleSelection.add(refKey);
      selectedByVehicle.set(vehiclePlate, vehicleSelection);
    });

    selectedByVehicle.forEach((vehicleSelection, vehiclePlate) => {
      const filteredBase = filterStatement(stmt, vehicleSelection);
      const filtered = {
        ...filteredBase,
        driver: filteredBase.driver
          ? { ...filteredBase.driver, vehicle_plate: vehiclePlate }
          : filteredBase.driver,
      };
      // snapshot the selection so clearing it below doesn't affect the callback
      const snapshotKeys = new Set(vehicleSelection);
      // Generate unique batch key for this vehicle's print session
      const batchKey = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

      // تجهيز بيانات سجل العهدة الآن فقط؛ طلب الحفظ نفسه لا يُنفذ إلا بعد اعتماد المعاينة.
      const activityEvts = buildActivity(stmt);
      const selEvents = activityEvts.filter(ev => snapshotKeys.has(ev.refKey));
      const netAmount = selEvents.reduce((s, ev) => s + ev.sign * ev.amount, 0);
      const KIND_AR: Record<string, string> = {
        order: "أوردر", trip: "رحلة", rental: "إيجار",
        supply_trip: "رحلة توريد", expense: "مصروف",
      };
      const loadTypes = [...new Set(selEvents.map(ev => KIND_AR[ev.kind] || ev.kind))].join("، ");
       const snapshot = selEvents.map(ev => ({
        date: ev.date, kind: ev.kind, label: ev.label, sub: ev.sub,
         amount: ev.amount, sign: ev.sign, refKey: ev.refKey,
      }));
      const printSnapshot = {
        version: 1,
        statement: filtered,
        driver_name: snapshotDriverName,
        date_from: fromDate || undefined,
        date_to: toDate || undefined,
        filter_ref: "",
        printed_at: printedAt,
      } satisfies StoredStatementPrint;
      const createStmtRecord = async (mode: "new" | "edit", dialogWindow: Window): Promise<PrintedStatementRecord> => {
        const activeToken = localStorage.getItem("mkgh_token") || token || "";
        const authHeaders: Record<string, string> = activeToken ? { Authorization: `Bearer ${activeToken}` } : {};
        const requestBody = {
          driver_phone: phone,
          driver_name: stmt.driver?.driver_name || driver.driver_name || phone,
          vehicle_plate: vehiclePlate,
          date_from: fromDate || null,
          date_to: toDate || null,
          net_amount: netAmount,
          item_count: snapshotKeys.size,
          load_types: loadTypes,
          items_snapshot: JSON.stringify(snapshot),
          batch_key: batchKey,
          print_snapshot: printSnapshot,
        };
        let requestUrl = "/api/driver-custody";
        let requestMethod = "POST";

        if (mode === "edit") {
          const recordsResponse = await fetch(
            `/api/driver-custody?driver_phone=${encodeURIComponent(phone)}`,
            { headers: authHeaders },
          );
          if (!recordsResponse.ok) throw new Error(`HTTP ${recordsResponse.status}`);
          const records = await recordsResponse.json() as Array<{
            id: number;
            filter_ref?: string;
            vehicle_plate?: string;
          }>;
          const available = records.filter(record => record.filter_ref);
          if (available.length === 0) {
            dialogWindow.alert("لا توجد كشوف قديمة لهذا السائق يمكن تعديلها.");
            throw new Error("لا توجد كشوف قديمة لهذا السائق.");
          }
          const choices = available
            .map(record => `${record.filter_ref}${record.vehicle_plate ? ` — السيارة ${record.vehicle_plate}` : ""}`)
            .join("\n");
          const selectedRef = dialogWindow.prompt(
            `اكتب رقم الكشف القديم المطلوب تعديله كما هو:\n\n${choices}`
          )?.trim();
          if (!selectedRef) throw new Error("لم يتم اختيار رقم كشف قديم.");
          const normalizedRef = selectedRef.toLocaleLowerCase();
          const oldRecord = available.find(
            record => {
              const ref = record.filter_ref?.trim().toLocaleLowerCase() || "";
              return ref === normalizedRef ||
                ref.replace(/^kh-/, "") === normalizedRef.replace(/^kh-/, "");
            }
          );
          if (!oldRecord) {
            dialogWindow.alert("رقم الكشف غير موجود ضمن كشوف هذا السائق.");
            throw new Error("رقم الكشف المختار غير صحيح.");
          }
          requestUrl = `/api/driver-custody/${oldRecord.id}`;
          requestMethod = "PUT";
        }

        const response = await fetch(requestUrl, {
          method: requestMethod,
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify(requestBody),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const record = await response.json() as { id?: number; filter_ref?: string };
        if (!record.id || !record.filter_ref) throw new Error("missing custody reference");
        setSelected(new Set());
        setSelMode(null);
         loadPrintedMarks();
        return { id: record.id, filter_ref: record.filter_ref };
      };

      doPrint(
        filtered,
        snapshotDriverName,
        fromDate,
        toDate,
        undefined,       // الرقم الصادر يوسم بنود الكشف تلقائيًا عند الحفظ
        undefined,       // signatureData
        undefined,       // لا يُنشأ سجل قبل اعتماد المعاينة
        undefined,
        printedAt,
        true,
        createStmtRecord,
      );
    });
  };

  const loadStatement = () => {
    if (!phone) { setLoading(false); setFetchError(false); return; }
    setLoading(true);
    setFetchError(false);
    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate)   params.set("to", toDate);
    if (vehicleFilter) params.set("vehicle_plate", vehicleFilter);
    const qs = params.toString() ? `?${params.toString()}` : "";
    fetch(`/api/driver-settlements/statement/${encodeURIComponent(phone)}${qs}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => { setStmt(d as StatementData); setLoading(false); })
      .catch(() => { setStmt(null); setLoading(false); setFetchError(true); });
  };

  useEffect(() => { loadStatement(); }, [phone, fromDate, toDate, vehicleFilter]);

  const submitSettlement = async () => {
    if (!settleForm.amount || !phone) return;
    setSettleSaving(true);
    setSettleError("");
    try {
      const driverName = stmt?.driver?.driver_name || driver.driver_name || "";
      const res = await fetch("/api/driver-settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driver_phone: phone,
          driver_name: driverName,
          allocated_amount: parseFloat(settleForm.amount) || 0,
          notes: settleForm.notes || null,
          settlement_date: settleForm.settlement_date,
          settled_by: "المدير",
          deferred: 0,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSettleForm({ amount: "", notes: "", settlement_date: new Date().toISOString().slice(0, 10) });
      loadStatement();
    } catch {
      setSettleError("تعذّر تسجيل الدفعة — تحقق من الاتصال وحاول مجدداً");
    } finally {
      setSettleSaving(false);
    }
  };

  const confirmDelivery = async (settlementId: number) => {
    setDeliveringId(settlementId);
    try {
      const res = await fetch(`/api/driver-settlements/${settlementId}/deliver`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delivered_by: "المدير" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loadStatement();
    } catch {
      // silently ignore; button re-enables on reload failure
    } finally {
      setDeliveringId(null);
    }
  };

  // ── Edit settlement ──────────────────────────────────────────────────────────
  const [editingSettlement, setEditingSettlement] = useState<{ id: number; amount: string; notes: string; settlement_date: string } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const saveSettlementEdit = async () => {
    if (!editingSettlement) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/driver-settlements/${editingSettlement.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allocated_amount: parseFloat(editingSettlement.amount) || 0,
          notes: editingSettlement.notes || null,
          settlement_date: editingSettlement.settlement_date,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEditingSettlement(null);
      loadStatement();
    } catch {
      // keep form open on error
    } finally {
      setEditSaving(false);
    }
  };

  // ── Un-settle a single item (password protected) ─────────────────────────────
  const unSettleItem = async (itemType: string, itemRef: string) => {
    const pwd = window.prompt("أدخل كلمة السر لإلغاء علامة التصفية:");
    if (pwd === null) return;
    if (pwd !== "mkgh") { alert("كلمة السر غير صحيحة"); return; }
    try {
      await fetch("/api/driver-settlements/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driver_phone: phone, item_type: itemType, item_ref: String(itemRef) }),
      });
      loadStatement();
    } catch {}
  };

  // ── Delete settlement ────────────────────────────────────────────────────────
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const deleteSettlement = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/driver-settlements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loadStatement();
    } catch {
      // silently ignore
    } finally {
      setDeletingId(null);
    }
  };

  // ── Add / Edit / Delete driver expenses ─────────────────────────────────────
  const [creatingExpense, setCreatingExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<StmtExpense | null>(null);
  const [expenseForm, setExpenseForm]       = useState({ expense_type: "", amount: "", liters: "", description: "", expense_date: "", vehicle_plate: "" });
  const [expenseSaving, setExpenseSaving]   = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null);

  const openAddDiesel = () => {
    if (!canMutateExpenses || !stmt || !phone) return;
    const plates = stmt.expense_vehicle_plates || [];
    setEditingExpense(null);
    setExpenseForm({
      expense_type: "ديزل",
      amount: "",
      liters: "",
      description: "",
      expense_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
      vehicle_plate: plates.length === 1 ? plates[0] : "",
    });
    setCreatingExpense(true);
  };

  const openEditExpense = (e: StmtExpense) => {
    if (!canMutateExpenses) return; // admin/supervisor only
    setCreatingExpense(false);
    setEditingExpense(e);
    setExpenseForm({
      expense_type: e.expense_type || "ديزل",
      amount:       String(e.amount || ""),
      liters:       String(e.liters || ""),
      description:  e.description || "",
      expense_date: e.expense_date || "",
      vehicle_plate: e.vehicle_plate || "",
    });
  };

  const saveExpense = async () => {
    if ((!editingExpense && !creatingExpense) || !canMutateExpenses || expenseSaving) return;
    const amount = Number(expenseForm.amount);
    const liters = expenseForm.liters ? Number(expenseForm.liters) : 0;
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(liters) || liters < 0 || !expenseForm.expense_date) {
      alert("أدخل مبلغًا صحيحًا وتاريخًا صالحًا، واللترات لا يمكن أن تكون سالبة");
      return;
    }
    if (creatingExpense && !expenseForm.vehicle_plate) {
      alert((stmt?.expense_vehicle_plates || []).length === 0
        ? "لا توجد سيارة مرتبطة بهذا السائق في سجل السيارات"
        : "اختر السيارة التي تخصها فاتورة الديزل");
      return;
    }
    setExpenseSaving(true);
    try {
      const isCreating = creatingExpense;
      const res = await fetch(isCreating ? "/api/driver-expenses" : `/api/driver-expenses/${editingExpense!.id}`, {
        method: isCreating ? "POST" : "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...(isCreating ? {
            driver_phone: phone,
            driver_name: stmt?.driver?.driver_name || driver.driver_name || driver.user_name || "",
          } : {}),
          vehicle_plate: expenseForm.vehicle_plate || null,
          expense_type: isCreating ? "ديزل" : expenseForm.expense_type || "ديزل",
          amount,
          liters,
          description:  expenseForm.description || null,
          expense_date: expenseForm.expense_date,
        }),
      });
      const result = await res.json().catch(() => ({}));
      const saved = isCreating ? result.expense : result;
      if (!res.ok || !saved?.id) throw new Error(result.error || "لم يؤكد النظام حفظ المصروف");
      setEditingExpense(null);
      setCreatingExpense(false);
      if (isCreating && (fromDate || toDate || vehicleFilter)) {
        setFromDate("");
        setToDate("");
        setVehicleFilter("");
      } else {
        loadStatement();
      }
    } catch (error) { alert(error instanceof Error ? error.message : "حدث خطأ أثناء الحفظ"); }
    finally { setExpenseSaving(false); }
  };

  const confirmDeleteExpense = async (id: number) => {
    if (!canMutateExpenses) return; // admin/supervisor only
    if (!window.confirm("هل تريد حذف هذا المصروف؟")) return;
    setDeletingExpenseId(id);
    try {
      const res = await fetch(`/api/driver-expenses/${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      loadStatement();
    } catch { alert("حدث خطأ أثناء الحذف"); }
    finally { setDeletingExpenseId(null); }
  };

  const driverName = stmt?.driver?.driver_name || driver.driver_name || driver.user_name || phone;
  const activity   = stmt ? buildActivity(stmt) : [];
  const currentExpensePlate = editingExpense?.vehicle_plate?.trim() || "";
  const editVehiclePlateOptions = [...new Set([
    ...companyVehiclePlates,
    ...(currentExpensePlate && !companyVehiclePlates.includes(currentExpensePlate) ? [currentExpensePlate] : []),
  ])];

  const sigList = Array.from(signatures.entries())
    .map(([batch_key, signed_at]) => ({ batch_key, signed_at }))
    .sort((a, b) => (b.signed_at || "").localeCompare(a.signed_at || ""));

  // All distinct batch_keys (signed + unsigned) for the signatures tab
  const allBatches = (() => {
    const bkCount = new Map<string, number>();
    for (const bk of batchMarks.values()) bkCount.set(bk, (bkCount.get(bk) ?? 0) + 1);
    return Array.from(bkCount.entries())
      .map(([bk, count]) => {
        const tsHex = bk.split("-")[0];
        const printTs = tsHex ? parseInt(tsHex, 36) : null;
        const printDate = printTs && !isNaN(printTs)
          ? new Date(printTs).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })
          : null;
        return { bk, count, printDate, signedAt: signatures.get(bk) ?? null };
      })
      .sort((a, b) => b.bk.localeCompare(a.bk));
  })();

  async function signBatch(batchKey: string, dataUrl: string) {
    if (!phone) return;
    setSigSaving(true);
    try {
      const r = await fetch(`/api/driver-settlements/statements/${encodeURIComponent(batchKey)}/sign`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ driver_phone: phone, signature_data: dataUrl }),
      });
      if (!r.ok) { alert("فشل حفظ التوقيع — حاول مجددًا"); return; }
      setSigPadBatchKey(null);
      loadPrintedMarks();
    } catch { alert("فشل حفظ التوقيع"); }
    finally { setSigSaving(false); }
  }

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: "activity",    label: "سجل النشاط",  count: activity.length },
    { key: "bonus",       label: "البونص",       count: stmt ? stmt.orders.length + stmt.trips.filter(t=>t.bonus>0).length + stmt.rentals.filter((r:StmtRental)=>r.driver_bonus>0).length + (stmt.supply_trips||[]).filter(t=>t.rental>0).length : 0 },
    { key: "expenses",    label: "المصروفات",    count: stmt?.expenses.length },
    { key: "settlements", label: "التسويات",     count: stmt?.settlements.length },
    { key: "signatures",  label: "التوقيعات",    count: allBatches.length },
  ];

  return (
    <>
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
    >
      {/* Side drawer */}
      <div className="relative w-full max-w-2xl bg-white h-full min-h-0 flex flex-col shadow-2xl overflow-hidden animate-slide-in-right">

        {/* ── Header ── */}
        <div className="bg-[#103c68] px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Car size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-black text-base truncate">{driverName}</p>
              <p className="text-white/70 text-xs font-mono">{phone}</p>
            </div>
            {(driver.status || stmt?.driver?.status) && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_CLS[driver.status || stmt?.driver?.status || ""] || "bg-gray-100 text-gray-500"}`}>
                {STATUS_LABEL[driver.status || stmt?.driver?.status || ""] || driver.status || "—"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {stmt && (
              <button
                onClick={() => doPrint(stmt, driverName, fromDate, toDate)}
                title="هذه معاينة فقط ولا تنشئ كشف عهدة ثابتاً. لإصدار كشف رسمي ثابت استخدم طباعة البنود المحددة."
                className="flex items-center gap-2 px-2 sm:px-3 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition-colors whitespace-nowrap"
              >
                <Printer size={14} /> معاينة الكشف
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-[#103c68]/30 border-t-[#103c68] rounded-full animate-spin" />
          </div>
        ) : !phone ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
            <span className="text-4xl">📵</span>
            <p className="text-sm font-medium">لا يوجد رقم جوال مسجّل لهذا السائق</p>
            <p className="text-xs text-gray-300">أضف رقم جواله من شاشة تعديل السائق أولاً</p>
          </div>
        ) : fetchError || !stmt ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">تعذّر تحميل البيانات — تحقق من الاتصال</div>
        ) : (
          <>
            {/* ── Date range filter ── */}
            <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2 bg-gray-50 border-b border-gray-100 flex-shrink-0">
              <CalendarRange size={14} className="text-[#103c68] flex-shrink-0" />
              <span className="text-xs font-bold text-gray-500">الفترة:</span>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#103c68]/40 focus:border-[#103c68]/50"
              />
              <span className="text-xs text-gray-400">—</span>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#103c68]/40 focus:border-[#103c68]/50"
              />
              {(fromDate || toDate) && (
                <button
                  onClick={() => { setFromDate(""); setToDate(""); }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors font-bold px-1.5 py-0.5 rounded-lg hover:bg-red-50"
                  title="مسح الفلتر"
                >
                  <X size={12} />
                </button>
              )}
              {(fromDate || toDate) && (
                <span className="mr-auto text-[10px] text-[#103c68] font-bold bg-[#103c68]/10 px-2 py-0.5 rounded-full">
                  كشف مفلتر
                </span>
              )}
              {(stmt.vehicle_plates || []).length > 1 && (
                <>
                  <Car size={14} className="text-[#103c68] mr-1 flex-shrink-0" />
                  <select
                    value={vehicleFilter}
                    onChange={e => {
                      setVehicleFilter(e.target.value);
                      setSelected(new Set());
                      setSelMode(null);
                    }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#103c68]/40 focus:border-[#103c68]/50"
                    aria-label="تصفية حسب السيارة"
                  >
                    <option value="">كل السيارات</option>
                    {(stmt.vehicle_plates || []).map(plate => (
                      <option key={plate} value={plate}>{plate}</option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {/* ── Summary tiles ── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-gray-100 flex-shrink-0">
              {[
                { label: "إجمالي البونص",  value: stmt.totals.gross_bonus,    color: "text-emerald-600" },
                { label: "المصروفات",      value: stmt.totals.total_expenses,  color: "text-red-500"     },
                { label: "التسويات",       value: stmt.totals.total_settled,   color: "text-amber-600"   },
                { label: "الرصيد الصافي", value: stmt.totals.balance,         color: stmt.totals.balance >= 0 ? "text-[#103c68]" : "text-red-600" },
              ].map(t => (
                <div key={t.label} className="py-3 px-3 text-center border-l last:border-l-0 border-gray-100">
                  <p className={`text-base font-black ${t.color}`}>{sar(t.value)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{t.label}</p>
                </div>
              ))}
            </div>

            {/* ── Tabs ── */}
            <div className="flex overflow-x-auto border-b border-gray-100 flex-shrink-0 px-2 sm:px-4 pt-2">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${tab === t.key ? "border-[#103c68] text-[#103c68]" : "border-transparent text-gray-400 hover:text-gray-600"}`}
                >
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${tab === t.key ? "bg-[#103c68] text-white" : "bg-gray-100 text-gray-500"}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab content ── */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">

              {/* سجل النشاط */}
              {tab === "activity" && (
                <div>
                  {/* ── أزرار وضعَي التحديد ── */}
                  {activity.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/70 border-b border-gray-100 sticky top-0 z-10">
                      <button
                        onClick={() => enterSelMode("print")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${selMode === "print" ? "bg-[#103c68] text-white" : "bg-white border border-[#103c68]/30 text-[#103c68] hover:bg-[#103c68]/5"}`}
                      >
                        <Printer size={13} /> تحديد للطباعة
                      </button>
                      <button
                        onClick={() => enterSelMode("mark")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${selMode === "mark" ? "bg-amber-500 text-white" : "bg-white border border-amber-300 text-amber-600 hover:bg-amber-50"}`}
                      >
                        <CheckCircle size={13} /> تمييز يدوي (تم طباعته)
                      </button>
                      {selMode && (
                        <button
                          onClick={() => { setSelMode(null); setSelected(new Set()); }}
                          className="mr-auto text-xs text-gray-400 hover:text-red-500 font-bold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          إلغاء
                        </button>
                      )}
                    </div>
                  )}

                  <div className={`divide-y divide-gray-50 ${selMode ? "pb-24" : ""}`}>
                    {activity.length === 0 && (
                      <div className="py-16 text-center text-gray-400 text-sm">
                        <Clock size={28} className="mx-auto mb-2 opacity-20" />
                        <p>لا يوجد نشاط مسجل</p>
                      </div>
                    )}
                    {activity.length > 0 && activity.map((ev, i) => {
                      const printedAt  = printedMarks.get(ev.refKey);
                      const isPrinted  = printedAt !== undefined;
                      const isSelected = selected.has(ev.refKey);
                      return (
                        <div
                          key={i}
                          onClick={() => selMode && toggleSelected(ev.refKey)}
                          className={`flex items-center gap-3 px-5 py-3 transition-colors ${selMode ? "cursor-pointer" : ""} ${isSelected ? (selMode === "print" ? "bg-blue-50/70" : "bg-amber-50/70") : "hover:bg-gray-50/60"}`}
                        >
                          {selMode && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelected(ev.refKey)}
                              onClick={e => e.stopPropagation()}
                              className={`w-4 h-4 rounded flex-shrink-0 ${selMode === "print" ? "accent-[#103c68]" : "accent-amber-500"}`}
                            />
                          )}
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${ev.sign === 1 ? "bg-emerald-50" : "bg-red-50"}`}>
                            {KIND_ICON[ev.kind]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{ev.label}</p>
                              {isPrinted && printedLabel(ev.refKey)}
                              {isPrinted && (() => {
                                const bk = batchMarks.get(ev.refKey);
                                const signedAt = bk ? signatures.get(bk) : undefined;
                                return signedAt ? (
                                  <span
                                    className="flex-shrink-0 text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full cursor-default"
                                    title={`وقّع السائق بتاريخ: ${new Date(signedAt).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}`}
                                  >
                                    ✓ وقّع
                                  </span>
                                ) : null;
                              })()}
                            </div>
                            {ev.sub && <p className="text-xs text-gray-400 truncate">{ev.sub}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`text-sm font-black ${ev.sign === 1 ? "text-emerald-600" : "text-red-500"}`}>
                              {ev.sign === 1 ? "+" : "−"}{sar(ev.amount)}
                            </p>
                            <p className="text-[10px] text-gray-400">{fmtD(ev.date)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── شريط سفلي — وضع الطباعة ── */}
                  {selMode === "print" && (
                    <div className="absolute bottom-0 left-0 right-0 bg-white border-t-2 border-[#103c68] px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] z-20">
                      {(() => {
                        const selEvents = activity.filter(ev => selected.has(ev.refKey));
                        const selBonus  = selEvents.filter(e => e.sign === 1).reduce((s, e) => s + e.amount, 0);
                        const selExp    = selEvents.filter(e => e.sign === -1).reduce((s, e) => s + e.amount, 0);
                        return (
                          <div className="flex items-center gap-3">
                            <div className="flex-1 min-w-0 text-xs">
                              <span className="font-black text-[#103c68]">{selected.size}</span>
                              <span className="text-gray-500"> بند محدد — </span>
                              <span className="text-emerald-600 font-bold">+{sar(selBonus)}</span>
                              <span className="text-gray-400"> / </span>
                              <span className="text-red-500 font-bold">−{sar(selExp)}</span>
                              <span className="text-gray-400"> = </span>
                              <span className="font-black text-[#103c68]">{sar(selBonus - selExp)}</span>
                            </div>
                            <button
                              onClick={printSelected}
                              disabled={selected.size === 0 || marksSaving}
                              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#103c68] hover:bg-[#0d3156] text-white rounded-xl text-xs font-black disabled:opacity-40 transition-colors flex-shrink-0"
                            >
                              <Printer size={14} /> طباعة الكشف بالمحدد
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── شريط سفلي — وضع التمييز اليدوي ── */}
                  {selMode === "mark" && (
                    <div className="absolute bottom-0 left-0 right-0 bg-white border-t-2 border-amber-400 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] z-20">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 text-xs">
                          <span className="font-black text-amber-600">{selected.size}</span>
                          <span className="text-gray-500"> بند محدد</span>
                        </div>
                        <button
                          onClick={markSelected}
                          disabled={selected.size === 0 || marksSaving}
                          className="flex items-center gap-1.5 px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black disabled:opacity-40 transition-colors"
                        >
                          <CheckCircle size={14} /> وسم كمطبوع
                        </button>
                        <button
                          onClick={unmarkSelected}
                          disabled={selected.size === 0 || marksSaving}
                          className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-red-200 text-red-500 hover:bg-red-50 rounded-xl text-xs font-black disabled:opacity-40 transition-colors"
                        >
                          <X size={14} /> إلغاء الوسم
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* تفصيل البونص */}
              {tab === "bonus" && (
                <div className="p-4 space-y-5">
                  {/* بونص أوردرات */}
                  {stmt.orders.length > 0 && (
                    <section>
                      <div className="flex items-center gap-2 mb-3">
                        <Package size={14} className="text-emerald-500" />
                        <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide">بونص الأوردرات</h3>
                        <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full font-bold">{sar(stmt.totals.order_bonus)}</span>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                        <table className="w-full min-w-[620px] text-right text-xs">
                          <thead className="bg-gray-50 text-gray-500">
                            <tr>
                              {["رقم الأوردر","التاريخ","مكان التحميل","التسليم","البونص"].map(h => (
                                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {stmt.orders.map((o, i) => (
                              <tr key={i} className={`border-t border-gray-50 ${i%2===1?"bg-gray-50/40":""}`}>
                                <td className="px-3 py-2 font-mono text-[10px]">{o.order_number}</td>
                                <td className="px-3 py-2">{fmtD(o.created_at)}</td>
                                <td className="px-3 py-2">{o.loading_point_name || "—"}</td>
                                <td className="px-3 py-2">{o.delivery_location || "—"}</td>
                                <td className="px-3 py-2">
                                  <span className="font-black text-emerald-600">{sar(o.driver_bonus)}</span>
                                  {printedLabel(`order:${o.order_number}`)}
                                  {o.settled && <button onClick={() => unSettleItem("order", String(o.order_number))} className="mr-1 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer border-0">تم تصفية الحساب</button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {/* بونص رحلات */}
                  {stmt.trips.filter(t => t.bonus > 0).length > 0 && (
                    <section>
                      <div className="flex items-center gap-2 mb-3">
                        <Car size={14} className="text-blue-500" />
                        <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide">بونص الرحلات</h3>
                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-bold">{sar(stmt.totals.trip_bonus)}</span>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                        <table className="w-full min-w-[850px] text-right text-xs">
                          <thead className="bg-[#103c68] text-white">
                            <tr>
                              {["التاريخ","رقم السيارة","مكان التحميل","مكان التنزيل","سعر البونص/الرد","عدد الردود","إجمالي البونص"].map(h => (
                                <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {stmt.trips.filter(t => t.bonus > 0).map((t, i) => {
                              const pricePerTrip = t.unit_price && t.unit_price > 0
                                ? t.unit_price
                                : (t.trips_count && t.trips_count > 0 ? t.bonus / t.trips_count : t.bonus);
                              return (
                                <tr key={i} className={`border-t border-gray-50 ${i%2===1?"bg-gray-50/40":""}`}>
                                  <td className="px-3 py-2">{fmtD(t.date)}</td>
                                  <td className="px-3 py-2 font-mono text-[10px]">{t.vehicle_plate || "—"}</td>
                                  <td className="px-3 py-2 font-medium text-gray-700">{t.loading_region || t.client_name || "—"}</td>
                                  <td className="px-3 py-2 font-medium text-gray-700">{t.unloading_region || t.destination || "—"}</td>
                                  <td className="px-3 py-2 font-mono text-emerald-700">{(pricePerTrip || 0).toLocaleString("ar-SA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                                  <td className="px-3 py-2 text-center font-bold text-[#103c68]">{t.trips_count ?? 1}</td>
                                  <td className="px-3 py-2">
                                    <span className="font-black text-blue-600">{sar(t.bonus)}</span>
                                    {printedLabel(tripRefKey(t))}
                                    {t.settled && <button onClick={() => unSettleItem("trip", String(t.id))} className="mr-1 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer border-0">تم تصفية الحساب</button>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-blue-50">
                            <tr>
                              <td colSpan={5} className="px-3 py-2 text-xs font-bold text-gray-500">
                                إجمالي عدد الردود: {stmt.trips.filter(t=>t.bonus>0).reduce((s,t)=>s+(t.trips_count??1),0).toLocaleString("ar-SA")}
                              </td>
                              <td colSpan={2} className="px-3 py-2 text-left font-black text-blue-700">{sar(stmt.totals.trip_bonus)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </section>
                  )}

                  {/* بونص إيجارات */}
                  {stmt.rentals.filter((r: StmtRental) => r.driver_bonus > 0).length > 0 && (
                    <section>
                      <div className="flex items-center gap-2 mb-3">
                        <ShoppingBag size={14} className="text-purple-500" />
                        <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide">بونص الإيجارات الخارجية</h3>
                        <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full font-bold">{sar(stmt.totals.rental_bonus)}</span>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                        <table className="w-full min-w-[680px] text-right text-xs">
                          <thead className="bg-gray-50 text-gray-500">
                            <tr>
                              {["التاريخ","من","إلى","اللوحة","البونص"].map(h => (
                                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(stmt.rentals as StmtRental[]).filter(r => r.driver_bonus > 0).map((r, i) => (
                              <tr key={i} className={`border-t border-gray-50 ${i%2===1?"bg-gray-50/40":""}`}>
                                <td className="px-3 py-2">{fmtD(r.assigned_at)}</td>
                                <td className="px-3 py-2">{r.pickup_location || "—"}</td>
                                <td className="px-3 py-2">{r.destination_location || "—"}</td>
                                <td className="px-3 py-2 font-mono text-[10px]">{r.vehicle_plate || "—"}</td>
                                <td className="px-3 py-2">
                                  <span className="font-black text-purple-600">{sar(r.driver_bonus)}</span>
                                   {printedLabel(rentalRefKey(r))}
                                  {r.settled && <button onClick={() => unSettleItem("rental", String(r.id))} className="mr-1 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer border-0">تم تصفية الحساب</button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {/* رحلات التوريد (توجيه) */}
                  {(stmt.supply_trips||[]).filter(t=>t.rental>0).length > 0 && (
                    <section>
                      <div className="flex items-center gap-2 mb-3">
                        <Truck size={14} className="text-orange-500" />
                        <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide">رحلات التوريد (توجيه)</h3>
                        <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full font-bold">{sar(stmt.totals.supply_trip_bonus || 0)}</span>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                        <table className="w-full min-w-[760px] text-right text-xs">
                          <thead className="bg-gray-50 text-gray-500">
                            <tr>
                              {["التاريخ","المسار","التحميل","التنزيل","اللوحة","الإيجار"].map(h => (
                                <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(stmt.supply_trips as StmtSupplyTrip[]).filter(t=>t.rental>0).map((t, i) => (
                              <tr key={t.id} className={`border-t border-gray-50 ${i%2===1?"bg-gray-50/40":""}`}>
                                <td className="px-3 py-2">{fmtD(t.completed_at)}</td>
                                <td className="px-3 py-2 text-gray-600">{t.product_name || "—"}</td>
                                <td className="px-3 py-2">{t.warehouse_name || "—"}</td>
                                <td className="px-3 py-2">{t.destination_division || "—"}</td>
                                <td className="px-3 py-2 font-mono text-[10px]">{t.vehicle_plate || "—"}</td>
                                <td className="px-3 py-2">
                                  <span className="font-black text-orange-600">{sar(Number(t.rental)||0)}</span>
                                   {printedLabel(`supply_trip:${t.id}`)}
                                  {t.settled && <button onClick={() => unSettleItem("supply_trip", String(t.id))} className="mr-1 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer border-0">تم تصفية الحساب</button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  {stmt.orders.length === 0 && stmt.trips.filter(t=>t.bonus>0).length === 0 && stmt.rentals.filter((r:StmtRental)=>r.driver_bonus>0).length === 0 && (stmt.supply_trips||[]).filter(t=>t.rental>0).length === 0 && (
                    <div className="py-16 text-center text-gray-400 text-sm">
                      <TrendingUp size={28} className="mx-auto mb-2 opacity-20" />
                      <p>لا يوجد بونص مسجل</p>
                    </div>
                  )}
                </div>
              )}

              {/* المصروفات */}
              {tab === "expenses" && (
                <div className="p-4">
                  {canMutateExpenses && (
                    <div className="mb-3 flex justify-end">
                      <button
                        type="button"
                        onClick={openAddDiesel}
                        className="flex items-center gap-1.5 rounded-lg bg-[#103c68] px-3 py-2 text-xs font-bold text-white hover:bg-[#0d2f52]"
                      >
                        <Plus size={14} /> إضافة مصروف ديزل
                      </button>
                    </div>
                  )}
                  {stmt.expenses.length === 0 ? (
                    <div className="py-16 text-center text-gray-400 text-sm">
                      <Minus size={28} className="mx-auto mb-2 opacity-20" />
                      <p>لا يوجد مصروفات</p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500">{stmt.expenses.length} مصروف</span>
                        <span className="text-sm font-black text-red-500">{sar(stmt.totals.total_expenses)}</span>
                      </div>
                      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
                        <table className="w-full min-w-[760px] text-right text-xs">
                          <thead className="bg-gray-50 text-gray-500">
                            <tr>
                              {[...["التاريخ","رقم السيارة","النوع","الوصف","المبلغ"], ...(canMutateExpenses ? [""] : [])].map((h,i) => (
                                <th key={i} className="px-3 py-2 font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(stmt.expenses as StmtExpense[]).map((e, i) => (
                              <tr key={e.id} className={`border-t border-gray-50 ${i%2===1?"bg-gray-50/40":""}`}>
                                <td className="px-3 py-2">{fmtD(e.expense_date)}</td>
                                <td className="px-3 py-2 font-mono text-[10px]">{e.vehicle_plate || "—"}</td>
                                <td className="px-3 py-2">{e.expense_type || "—"}</td>
                                <td className="px-3 py-2 text-gray-500">{e.description || e.order_number || "—"}</td>
                                <td className="px-3 py-2">
                                  <span className="font-black text-red-500">{sar(e.amount)}</span>
                                   {printedLabel(`expense:${e.id}`)}
                                  {e.liters > 0 && <span className="text-gray-400 text-[10px] mr-1">({e.liters}ل)</span>}
                                  {e.settled && <button onClick={() => unSettleItem("expense", String(e.id))} className="mr-1 text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer border-0">تم تصفية الحساب</button>}
                                </td>
                                {canMutateExpenses && (
                                  <td className="px-2 py-2">
                                    <div className="flex items-center gap-1 justify-end">
                                      <button
                                        onClick={() => openEditExpense(e)}
                                        className="p-1 rounded hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors"
                                        title="تعديل"
                                      >
                                        <Pencil size={12} />
                                      </button>
                                      <button
                                        onClick={() => confirmDeleteExpense(e.id)}
                                        disabled={deletingExpenseId === e.id}
                                        className="p-1 rounded hover:bg-red-50 text-red-300 hover:text-red-500 transition-colors disabled:opacity-40"
                                        title="حذف"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                    </>
                  )}

                  {/* ── Add/Edit expense modal (admin/supervisor only) ── */}
                  {(editingExpense || creatingExpense) && canMutateExpenses && (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40" onClick={() => { if (!expenseSaving) { setEditingExpense(null); setCreatingExpense(false); } }}>
                          <div className="bg-white rounded-2xl shadow-2xl p-5 w-80 mx-4" onClick={ev => ev.stopPropagation()}>
                            <div className="flex items-center justify-between mb-4">
                              <span className="font-black text-gray-800 text-sm">{creatingExpense ? "إضافة مصروف ديزل" : "تعديل المصروف"}</span>
                              <button type="button" disabled={expenseSaving} onClick={() => { setEditingExpense(null); setCreatingExpense(false); }} className="text-gray-400 hover:text-gray-600 disabled:opacity-50"><X size={16}/></button>
                            </div>
                            <div className="space-y-3">
                              {creatingExpense && (
                                <div>
                                  <label className="text-xs font-semibold text-gray-500 block mb-1">السيارة</label>
                                  {(stmt.expense_vehicle_plates || []).length === 0 ? (
                                    <p className="text-xs text-red-600">لا توجد سيارة مرتبطة بهذا السائق في سجل السيارات. اربط السيارة أولًا لإضافة المصروف.</p>
                                  ) : (
                                    <select
                                      value={expenseForm.vehicle_plate}
                                      onChange={ev => setExpenseForm(f => ({ ...f, vehicle_plate: ev.target.value }))}
                                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                    >
                                      <option value="">اختر السيارة</option>
                                      {(stmt.expense_vehicle_plates || []).map(plate => <option key={plate} value={plate}>{plate}</option>)}
                                    </select>
                                  )}
                                </div>
                              )}
                              {!creatingExpense && (
                                <div>
                                  <label className="text-xs font-semibold text-gray-500 block mb-1">السيارة</label>
                                  <select
                                    value={expenseForm.vehicle_plate}
                                    onChange={ev => setExpenseForm(f => ({ ...f, vehicle_plate: ev.target.value }))}
                                    disabled={companyVehiclesLoading}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
                                  >
                                    <option value="">بدون سيارة</option>
                                    {editVehiclePlateOptions.map(plate => (
                                      <option key={plate} value={plate}>
                                        {plate}{plate === currentExpensePlate && !companyVehiclePlates.includes(plate) ? " (رقم حالي غير موجود بالأسطول)" : ""}
                                      </option>
                                    ))}
                                  </select>
                                  {companyVehiclesError && (
                                    <p className="text-[10px] text-red-500 mt-1">تعذّر تحميل قائمة سيارات الشركة.</p>
                                  )}
                                </div>
                              )}
                              {!creatingExpense && <div>
                                <label className="text-xs font-semibold text-gray-500 block mb-1">النوع</label>
                                <input
                                  list="exp-types-list"
                                  value={expenseForm.expense_type}
                                  onChange={ev => setExpenseForm(f => ({...f, expense_type: ev.target.value}))}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                  placeholder="ديزل، صيانة..."
                                />
                                <datalist id="exp-types-list">
                                  {["ديزل","صيانة","غسيل","أخرى"].map(t => <option key={t} value={t}/>)}
                                </datalist>
                              </div>}
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs font-semibold text-gray-500 block mb-1">المبلغ (ر.س)</label>
                                  <input
                                    type="number" min="0" step="0.01"
                                    value={expenseForm.amount}
                                    onChange={ev => setExpenseForm(f => ({...f, amount: ev.target.value}))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs font-semibold text-gray-500 block mb-1">اللترات</label>
                                  <input
                                    type="number" min="0" step="0.01"
                                    value={expenseForm.liters}
                                    onChange={ev => setExpenseForm(f => ({...f, liters: ev.target.value}))}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-gray-500 block mb-1">التاريخ</label>
                                <input
                                  type="date"
                                  value={expenseForm.expense_date}
                                  onChange={ev => setExpenseForm(f => ({...f, expense_date: ev.target.value}))}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-semibold text-gray-500 block mb-1">الوصف</label>
                                <input
                                  value={expenseForm.description}
                                  onChange={ev => setExpenseForm(f => ({...f, description: ev.target.value}))}
                                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                  placeholder="ملاحظات..."
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 mt-4">
                              <button
                                onClick={saveExpense}
                                disabled={expenseSaving || !expenseForm.amount || (creatingExpense && !(stmt.expense_vehicle_plates || []).length)}
                                className="flex-1 bg-[#103c68] text-white rounded-xl py-2 text-sm font-bold hover:bg-[#0d2f52] transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                              >
                                <Save size={13}/>{expenseSaving ? "جاري الحفظ..." : creatingExpense ? "إضافة" : "حفظ"}
                              </button>
                              <button disabled={expenseSaving} onClick={() => { setEditingExpense(null); setCreatingExpense(false); }} className="px-4 bg-gray-100 text-gray-600 rounded-xl py-2 text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50">
                                إلغاء
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                </div>
              )}

              {/* التسويات */}
              {tab === "settlements" && (
                <div className="p-4 space-y-4">

                  {/* ── Balance summary ── */}
                  {(() => {
                    // مجموع البنود الموسومة بـ"طُبع" (المحدد بالطباعة)
                    const printedEvents = activity.filter(ev => printedMarks.has(ev.refKey));
                    const printedNet = printedEvents.reduce((s, ev) => s + ev.sign * ev.amount, 0);
                    // "المحدد بالطباعة" نشط متى كانت هناك بنود موسومة — بغض النظر عن الإجمالي
                    const hasPrinted = printedEvents.length > 0;
                    // الفاضل: من المحدد بالطباعة لو موجود، وإلا من الكلي
                    const balanceValue = hasPrinted
                      ? printedNet - stmt.totals.total_settled
                      : stmt.totals.balance;

                    const tiles = [
                      {
                        label: "إجمالي المستحق",
                        value: stmt.totals.gross_bonus,
                        color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-100",
                      },
                      ...(hasPrinted ? [{
                        label: "المحدد بالطباعة",
                        value: printedNet,
                        color: "text-violet-600", bg: "bg-violet-50", border: "border-violet-100",
                      }] : []),
                      {
                        label: "إجمالي المدفوع",
                        value: stmt.totals.total_settled,
                        color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100",
                      },
                      {
                        label: balanceValue >= 0 ? "فاضل للسائق" : "عليه",
                        value: Math.abs(balanceValue),
                        color: balanceValue >= 0 ? "text-[#103c68]" : "text-red-600",
                        bg:    balanceValue >= 0 ? "bg-blue-50"      : "bg-red-50",
                        border: balanceValue >= 0 ? "border-blue-100" : "border-red-100",
                      },
                    ];

                    return (
                      <div className={`grid gap-3 ${tiles.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
                        {tiles.map(k => (
                          <div key={k.label} className={`${k.bg} border ${k.border} rounded-xl p-3 text-center`}>
                            <p className={`text-base font-black ${k.color}`}>{sar(k.value)}</p>
                            <p className="text-[10px] text-gray-500 mt-0.5 font-semibold">{k.label}</p>
                          </div>
                        ))}
                        {hasPrinted && (
                          <div className="col-span-2 sm:col-span-4 text-[10px] text-violet-500 text-center font-semibold -mt-1">
                            الفاضل محسوب من المحدد بالطباعة ({sar(printedNet)}) − المدفوع ({sar(stmt.totals.total_settled)})
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Share statement image ── */}
                  <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1">
                      <p className="text-xs font-black text-[#103c68] flex items-center gap-1.5">
                        <Share2 size={14} /> إرسال كشف PDF للسائق
                      </p>
                      <p className="text-[10px] text-sky-700/80 mt-1">
                        يجهز ملف PDF واضحًا متعدد الصفحات ويفتح المشاركة برقم السائق.
                      </p>
                    </div>
                    <button
                      onClick={shareStatement}
                      disabled={sharingStatement}
                      className="shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#103c68] hover:bg-[#0d3159] disabled:opacity-60 text-white rounded-xl text-xs font-black transition-colors"
                    >
                      {sharingStatement
                        ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        : <Share2 size={14} />}
                      {sharingStatement
                        ? "جاري تجهيز PDF..."
                        : preparedStatementPdf ? "مشاركة PDF" : "تجهيز PDF"}
                    </button>
                    {shareNotice && (
                      <p className="sm:basis-full text-[10px] text-[#103c68] font-semibold">{shareNotice}</p>
                    )}
                  </div>

                  {/* ── Add settlement form (manual) ── */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs font-black text-gray-600 mb-3 flex items-center gap-1.5">
                      <Plus size={13} className="text-[#103c68]" />تسجيل دفعة يدوية
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">المبلغ (ريال) *</label>
                        <input
                          type="number" min="0" step="0.01"
                          value={settleForm.amount}
                          onChange={e => setSettleForm(f => ({ ...f, amount: e.target.value }))}
                          placeholder="0.00"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:border-[#103c68]"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">ملاحظة (اختياري)</label>
                        <input
                          value={settleForm.notes}
                          onChange={e => setSettleForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="سبب الدفعة..."
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#103c68]"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">تاريخ التسوية *</label>
                        <input type="date" value={settleForm.settlement_date}
                          onChange={e => setSettleForm(f => ({ ...f, settlement_date: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                      </div>
                    </div>
                    {settleError && (
                      <p className="mt-2 text-xs text-red-500 font-medium">{settleError}</p>
                    )}
                    <button
                      onClick={submitSettlement}
                      disabled={settleSaving || !settleForm.amount || !settleForm.settlement_date}
                      className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-[#103c68] text-white rounded-xl text-sm font-black hover:bg-[#0d3055] disabled:opacity-50 transition-colors"
                    >
                      <Save size={14} />{settleSaving ? "جاري الحفظ..." : "تسجيل الدفعة"}
                    </button>
                  </div>

                  {/* ── Settlements list ── */}
                  {stmt.settlements.length > 0 && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500">{stmt.settlements.length} تسوية مسجلة</span>
                        <span className="text-sm font-black text-amber-600">{sar(stmt.totals.total_settled)}</span>
                      </div>
                      <div className="space-y-2">
                        {(stmt.settlements as StmtSettlement[]).map(s => {
                          const isDeferred = s.deferred && !s.delivered_at;
                          const isEditing  = editingSettlement?.id === s.id;
                          const isDeleting = deletingId === s.id;

                          return (
                            <div key={s.id} className={`rounded-xl border ${isEditing ? "border-[#103c68]/30 bg-blue-50/30" : isDeferred ? "border-amber-200 bg-amber-50/40" : "border-gray-100 bg-white"}`}>

                              {/* ── View mode ── */}
                              {!isEditing && (
                                <div className="px-4 py-3">
                                  <div className="flex justify-between items-start gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-bold text-gray-900">{isDeferred ? "مؤجلة" : "دفعة"}</p>
                                        {isDeferred && <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-700 border border-amber-200">مؤجلة</span>}
                                        {s.settled_by && <span className="text-xs text-gray-400 font-normal">— {s.settled_by}</span>}
                                      </div>
                                      {s.notes && <p className="text-xs text-gray-500 mt-0.5">{s.notes}</p>}
                                       <p className="text-[10px] text-gray-400 mt-1">{fmtD(s.settlement_date || s.created_at)}</p>
                                      {s.delivered_at && <p className="text-[10px] text-emerald-500 mt-0.5">تم التسليم: {fmtD(s.delivered_at)}</p>}
                                    </div>
                                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                      <span className="text-base font-black text-amber-600">{sar(s.allocated_amount)}</span>
                                      <div className="flex items-center gap-1.5">
                                        {isDeferred && (
                                          <button onClick={() => confirmDelivery(s.id)} disabled={deliveringId === s.id}
                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-black transition-colors">
                                            <CheckCircle size={11} />
                                            {deliveringId === s.id ? "جاري..." : "تأكيد التسليم"}
                                          </button>
                                        )}
                                        {!isDriverView && (<>
                                        <button
                                           onClick={() => setEditingSettlement({ id: s.id, amount: String(s.allocated_amount), notes: s.notes || "", settlement_date: (s.settlement_date || s.created_at || "").slice(0, 10) })}
                                          className="p-1.5 rounded-lg bg-gray-100 hover:bg-blue-100 hover:text-[#103c68] text-gray-400 transition-colors"
                                          title="تعديل"
                                        >
                                          <Pencil size={12} />
                                        </button>
                                        <button
                                          onClick={() => { if (window.confirm("هل تريد حذف هذه التسوية نهائياً؟")) deleteSettlement(s.id); }}
                                          disabled={isDeleting}
                                          className="p-1.5 rounded-lg bg-gray-100 hover:bg-red-100 hover:text-red-600 text-gray-400 disabled:opacity-50 transition-colors"
                                          title="حذف"
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                        </>)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* ── Edit mode ── */}
                              {isEditing && (
                                <div className="px-4 py-3 space-y-2">
                                  <p className="text-xs font-black text-[#103c68] mb-1 flex items-center gap-1.5">
                                    <Pencil size={11} /> تعديل التسوية
                                  </p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] font-semibold text-gray-500 block mb-1">المبلغ (ريال)</label>
                                      <input
                                        type="number" min="0" step="0.01"
                                        value={editingSettlement.amount}
                                        onChange={e => setEditingSettlement(p => p ? { ...p, amount: e.target.value } : p)}
                                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-[#103c68]"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-[10px] font-semibold text-gray-500 block mb-1">ملاحظة</label>
                                      <input
                                        value={editingSettlement.notes}
                                        onChange={e => setEditingSettlement(p => p ? { ...p, notes: e.target.value } : p)}
                                        placeholder="ملاحظة..."
                                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#103c68]"
                                      />
                                    </div>
                                     <div>
                                       <label className="text-[10px] font-semibold text-gray-500 block mb-1">تاريخ التسوية</label>
                                       <input type="date" value={editingSettlement.settlement_date}
                                         onChange={e => setEditingSettlement(p => p ? { ...p, settlement_date: e.target.value } : p)}
                                         className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                                     </div>
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                     <button onClick={saveSettlementEdit} disabled={editSaving || !editingSettlement.settlement_date}
                                      className="flex-1 py-1.5 bg-[#103c68] hover:bg-[#0d3159] disabled:opacity-50 text-white text-xs font-black rounded-lg flex items-center justify-center gap-1 transition-colors">
                                      {editSaving ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={11} />}
                                      حفظ التعديل
                                    </button>
                                    <button onClick={() => setEditingSettlement(null)}
                                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold rounded-lg transition-colors">
                                      إلغاء
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {stmt.settlements.length === 0 && (
                    <div className="py-8 text-center text-gray-400 text-sm">
                      <CreditCard size={24} className="mx-auto mb-2 opacity-20" />
                      <p>لا توجد دفعات مسجلة بعد</p>
                    </div>
                  )}
                </div>
              )}

              {/* التوقيعات */}
              {tab === "signatures" && (
                <div className="p-4 space-y-3">
                  {allBatches.length === 0 ? (
                    <div className="py-16 text-center text-gray-400 text-sm">
                      <CheckCircle size={28} className="mx-auto mb-2 opacity-20" />
                      <p>لا توجد كشوفات مطبوعة بعد</p>
                      {isDriverView && (
                        <p className="text-xs mt-1 text-gray-300">بعد طباعة المدير لكشف حسابك يظهر هنا زر التوقيع</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="mb-1 flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500">
                          {allBatches.length} كشف مطبوع · {allBatches.filter(b => b.signedAt).length} موقّع
                        </span>
                      </div>
                      <div className="space-y-2">
                        {allBatches.map(({ bk, count, printDate, signedAt }) => {
                          const signedDate = signedAt
                            ? new Date(signedAt).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })
                            : null;
                          return (
                            <div key={bk} className={`bg-white rounded-xl border px-4 py-3 flex items-center gap-3 ${signedAt ? "border-emerald-100" : "border-violet-100"}`}>
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${signedAt ? "bg-emerald-50" : "bg-violet-50"}`}>
                                {signedAt
                                  ? <CheckCircle size={16} className="text-emerald-600" />
                                  : <PenLine size={16} className="text-violet-500" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900">
                                  كشف حساب {signedAt ? "موقّع" : "بانتظار التوقيع"}
                                </p>
                                {printDate && (
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    <span className="font-semibold text-gray-500">تاريخ الطباعة:</span> {printDate}
                                  </p>
                                )}
                                <p className="text-[10px] text-gray-400">{count} بند</p>
                                {signedDate && (
                                  <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">✓ وقّع: {signedDate}</p>
                                )}
                              </div>
                              <div className="flex-shrink-0">
                                {signedAt ? (
                                  <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">✓ وقّع</span>
                                ) : (
                                  <button
                                    onClick={() => setSigPadBatchKey(bk)}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors shadow-sm"
                                  >
                                    <PenLine size={12} /> وقّع وابصم
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>

            {/* ── Footer balance bar ── */}
            <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>بونص: <strong className="text-emerald-600">{sar(stmt.totals.gross_bonus)}</strong></span>
                <ChevronLeft size={12} className="text-gray-300" />
                <span>مصروفات: <strong className="text-red-500">{sar(stmt.totals.total_expenses)}</strong></span>
                <ChevronLeft size={12} className="text-gray-300" />
                <span>تسويات: <strong className="text-amber-600">{sar(stmt.totals.total_settled)}</strong></span>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">الرصيد</p>
                <p className={`text-base font-black ${stmt.totals.balance >= 0 ? "text-[#103c68]" : "text-red-600"}`}>
                  {sar(stmt.totals.balance)}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>

    {/* ── Signature Pad Modal ── */}
    {sigPadBatchKey && (
      <SignaturePad
        driverName={driverName}
        onClose={() => setSigPadBatchKey(null)}
        onConfirm={async (dataUrl) => {
          if (sigSaving) return;
          await signBatch(sigPadBatchKey, dataUrl);
        }}
      />
    )}
    </>
  );
}
