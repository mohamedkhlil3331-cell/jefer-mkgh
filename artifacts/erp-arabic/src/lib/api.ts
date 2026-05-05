const BASE = "/api";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "خطأ في الاتصال" }));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function apiUpload<T>(path: string, data: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: data });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "خطأ في الرفع" }));
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function formatDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
}

export function formatCurrency(n?: number | null) {
  if (n == null) return "0.00 ر.س";
  return n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
}

export const STATUS_LABELS: Record<string, string> = {
  available: "متاح", busy: "مشغول", maintenance: "صيانة", broken: "معطل",
  pending: "قيد الانتظار", approved: "مقبول", rejected: "مرفوض",
  new: "جديد", in_progress: "جاري", delivered: "تم التسليم", cancelled: "ملغي",
  open: "مفتوح", done: "منتهي",
  active: "نشط", suspended: "موقوف", terminated: "منتهية الخدمة",
};
