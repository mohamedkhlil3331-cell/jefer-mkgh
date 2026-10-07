import { useState } from "react";
import { Link } from "wouter";
import {
  Archive,
  ArrowRight,
  Database,
  Download,
  Files,
  HardDrive,
  ShieldAlert,
  Table2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface TicketResponse {
  ticket?: string;
  error?: string;
}

const INCLUDED_ITEMS = [
  {
    icon: Database,
    title: "قاعدة بيانات SQLite",
    description: "لقطة كاملة ومتسقة من قاعدة البيانات، بما فيها كل الجداول والسجلات.",
  },
  {
    icon: Table2,
    title: "ملف Excel",
    description: "جداول قاعدة البيانات في ملف قابل للقراءة؛ تُحجب فيه القيم الحساسة فقط.",
  },
  {
    icon: Files,
    title: "الملفات المرفوعة",
    description: "كل الملفات الموجودة في مجلد uploads المحلي، مع الحفاظ على المجلدات.",
  },
  {
    icon: HardDrive,
    title: "ملفات App Storage",
    description: "الكائنات الموجودة ضمن مسارات التخزين الخاصة والعامة المضبوطة لهذا التطبيق.",
  },
];

export default function SystemBackupPage() {
  const { user, token } = useAuth();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (user?.role !== "admin") {
    return (
      <div dir="rtl" className="mx-auto max-w-3xl rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <ShieldAlert className="mx-auto mb-3 text-red-500" size={32} />
        <h1 className="text-xl font-bold text-gray-900">هذه الصفحة متاحة لمدير النظام فقط</h1>
        <p className="mt-2 text-sm text-gray-500">ارجع إلى الصفحة السابقة أو سجّل الدخول بحساب المدير.</p>
      </div>
    );
  }

  const startDownload = async () => {
    setStarting(true);
    setError("");
    setNotice("");

    try {
      if (!token || token === "guest") {
        throw new Error("انتهت جلسة الدخول. سجّل الدخول مجدداً ثم حاول مرة أخرى.");
      }

      const response = await fetch("/api/admin/system-backup/tickets", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => null) as TicketResponse | null;

      if (!response.ok) {
        throw new Error(body?.error || `تعذر بدء التنزيل (رمز الحالة ${response.status}).`);
      }
      if (!body?.ticket) {
        throw new Error("لم يُرجع الخادم تذكرة تنزيل صالحة.");
      }

      const downloadUrl = `/api/admin/system-backup/download?ticket=${encodeURIComponent(body.ticket)}`;
      window.location.assign(downloadUrl);
      setNotice("بدأ طلب التنزيل. ستظهر أخطاء تجهيز الملف في استجابة الخادم بدلاً من تنزيل ملف JSON.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر بدء التنزيل.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-sm font-semibold text-[#103c68]">إدارة النظام</p>
          <h1 className="text-2xl font-black text-gray-900">تنزيل نسخة احتياطية شاملة</h1>
          <p className="mt-1 text-sm text-gray-500">
            تنزيل بيانات النظام وملفاته في أرشيف واحد، من دون تغيير البيانات الأصلية.
          </p>
        </div>
        <Link href="/admin">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <ArrowRight size={16} />
            العودة إلى لوحة المدير
          </button>
        </Link>
      </header>

      <section className="overflow-hidden rounded-2xl bg-[#103c68] p-6 text-white shadow-sm sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <Archive size={24} />
            </div>
            <h2 className="text-xl font-bold">إنشاء ملف ZIP64</h2>
            <p className="mt-2 text-sm leading-6 text-white/80">
              يُجهّز الخادم لقطة لقاعدة البيانات وملف Excel والملفات المحلية وملفات App Storage،
              ثم يرسل الأرشيف مباشرةً إلى جهازك.
            </p>
          </div>
          <button
            type="button"
            onClick={startDownload}
            disabled={starting}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#103c68] shadow-sm transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={17} className={starting ? "animate-bounce" : ""} />
            {starting ? "جارٍ بدء التنزيل…" : "تنزيل النسخة الآن"}
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" aria-live="polite" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {notice}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        {INCLUDED_ITEMS.map(({ icon: Icon, title, description }) => (
          <article key={title} className="flex gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#103c68]">
              <Icon size={19} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-gray-500">{description}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
        <ShieldAlert size={21} className="mt-0.5 shrink-0 text-amber-700" />
        <div className="space-y-1 text-sm leading-6">
          <h2 className="font-bold">احتفظ بالملف في مكان آمن</h2>
          <p>
            قاعدة SQLite داخل الأرشيف كاملة وقد تحتوي على بيانات الحسابات والجلسات. تُحجب كلمات المرور
            والرموز المشابهة في ملف Excel فقط؛ ولا يتضمن الأرشيف ملفات المشروع أو متغيرات Replit Secrets.
          </p>
          <p className="text-amber-800">
            مدة صلاحية تذكرة التنزيل خمس دقائق، وتظل بيانات النظام وملفاته الأصلية دون تعديل.
          </p>
        </div>
      </section>
    </div>
  );
}
