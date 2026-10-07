import { useState } from "react";
import {
  getGetSiteAnalyticsSummaryQueryKey,
  useGetSiteAnalyticsSummary,
} from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";

const numberFormat = new Intl.NumberFormat("ar-SA");
const periodOptions = [
  { days: 7, label: "آخر 7 أيام" },
  { days: 30, label: "آخر 30 يوماً" },
  { days: 90, label: "آخر 90 يوماً" },
];

export default function SiteAnalyticsPage() {
  const { token } = useAuth();
  const [days, setDays] = useState(30);
  const query = useGetSiteAnalyticsSummary(
    { days },
    {
      query: {
        queryKey: getGetSiteAnalyticsSummaryQueryKey({ days }),
        enabled: Boolean(token),
        staleTime: 60_000,
      },
      request: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    },
  );
  const summary = query.data;

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">تحليلات الزيارات</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              زيارات صفحات النسخة التجريبية ومصادر الإحالة، إلى جانب إحصاءات الطلبات في hPanel.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="analytics-period" className="text-sm font-medium">الفترة</label>
            <select
              id="analytics-period"
              data-testid="select-analytics-period"
              value={days}
              onChange={event => setDays(Number(event.target.value))}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              {periodOptions.map(option => (
                <option key={option.days} value={option.days}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              data-testid="button-refresh-analytics"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
            >
              {query.isFetching ? "جارٍ التحديث…" : "تحديث"}
            </button>
          </div>
        </header>

        {query.isLoading ? (
          <p data-testid="status-analytics-loading" className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            جارٍ تحميل الإحصاءات…
          </p>
        ) : query.isError ? (
          <div data-testid="status-analytics-error" role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            تعذر تحميل الإحصاءات. تحقق من صلاحية حساب المدير ثم أعد المحاولة.
          </div>
        ) : summary ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2">
              <article data-testid="card-analytics-page-views" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm text-slate-600 dark:text-slate-400">مشاهدات الصفحات</p>
                <p className="mt-2 text-3xl font-bold">{numberFormat.format(summary.page_views)}</p>
              </article>
              <article data-testid="card-analytics-sessions" className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm text-slate-600 dark:text-slate-400">جلسات المتصفح التقريبية</p>
                <p className="mt-2 text-3xl font-bold">{numberFormat.format(summary.sessions)}</p>
              </article>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Breakdown title="أكثر الصفحات زيارة" rows={summary.top_pages} testId="analytics-top-pages" />
              <Breakdown title="مصادر الزيارة" rows={summary.top_sources} testId="analytics-top-sources" />
            </section>

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <h2 className="font-semibold">الزيارات اليومية</h2>
              </div>
              {summary.daily.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                      <tr>
                        <th className="px-5 py-3 font-medium">التاريخ</th>
                        <th className="px-5 py-3 font-medium">مشاهدات الصفحات</th>
                        <th className="px-5 py-3 font-medium">الجلسات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.daily.map(row => (
                        <tr key={row.day} data-testid={`row-analytics-day-${row.day}`} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-5 py-3">{row.day}</td>
                          <td className="px-5 py-3">{numberFormat.format(row.page_views)}</td>
                          <td className="px-5 py-3">{numberFormat.format(row.sessions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p data-testid="text-analytics-empty-daily" className="px-5 py-8 text-center text-sm text-slate-500">
                  لا توجد زيارات مسجلة خلال هذه الفترة.
                </p>
              )}
            </section>
          </>
        ) : (
          <p data-testid="text-analytics-unavailable" className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            لا توجد بيانات متاحة.
          </p>
        )}
      </div>
    </main>
  );
}

function Breakdown({
  title,
  rows,
  testId,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
  testId: string;
}) {
  return (
    <section data-testid={testId} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="font-semibold">{title}</h2>
      {rows.length ? (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((row, index) => (
            <li key={`${row.label}-${index}`} data-testid={`${testId}-row-${index}`} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span dir="auto" className="min-w-0 break-all">{row.label}</span>
              <span className="shrink-0 font-semibold">{numberFormat.format(row.count)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p data-testid={`${testId}-empty`} className="py-6 text-center text-sm text-slate-500">
          لا توجد بيانات مسجلة حتى الآن.
        </p>
      )}
    </section>
  );
}
