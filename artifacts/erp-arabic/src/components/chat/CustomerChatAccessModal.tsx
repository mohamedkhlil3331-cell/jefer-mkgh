import { useEffect, useMemo, useState } from "react";
import {
  getGetChatAdminCustomerAccessQueryKey,
  useGetChatAdminCustomerAccess,
  useUpdateChatAdminCustomerAccessRules,
} from "@workspace/api-client-react";
import type { ChatAccessRule, ChatCustomerAccessRulesUpdate } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, ShieldCheck, X } from "lucide-react";

type Props = {
  token: string | null;
  onClose: () => void;
};

type Scope = "category" | "customer";
type Category = "company" | "rental";
type RuleState = "default" | "include" | "exclude";

const headers = (token: string | null) => ({ Authorization: `Bearer ${token ?? ""}` });
const categoryLabel: Record<Category, string> = {
  company: "تابع للشركة",
  rental: "إيجار خارجي",
};
const roleLabel: Record<string, string> = {
  rep: "مندوب",
  supervisor: "مشرف",
};

function statesFromRules(rules: ChatAccessRule[]): Record<number, RuleState> {
  return Object.fromEntries(rules.map(rule => [rule.contact_user_id, rule.effect]));
}

export default function CustomerChatAccessModal({ token, onClose }: Props) {
  const client = useQueryClient();
  const accessQuery = useGetChatAdminCustomerAccess({
    query: { queryKey: getGetChatAdminCustomerAccessQueryKey() },
    request: { headers: headers(token) },
  });
  const saveRules = useUpdateChatAdminCustomerAccessRules({ request: { headers: headers(token) } });
  const [scope, setScope] = useState<Scope>("category");
  const [category, setCategory] = useState<Category>("company");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<number, RuleState>>({});
  const [notice, setNotice] = useState("");

  const data = accessQuery.data;
  const selectedCustomer = data?.customers.find(customer => customer.id === customerId);
  const categoryRules = data?.categories.find(item => item.key === category)?.rules ?? [];
  const currentRules = scope === "category" ? categoryRules : selectedCustomer?.rules ?? [];
  const staff = useMemo(
    () => (data?.staff ?? []).filter(contact =>
      `${contact.name} ${contact.phone} ${roleLabel[contact.role] ?? contact.role}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
    [data?.staff, search],
  );

  useEffect(() => {
    if (!data?.customers.length) return;
    if (customerId === null || !data.customers.some(customer => customer.id === customerId)) {
      setCustomerId(data.customers[0].id);
    }
  }, [data?.customers, customerId]);

  useEffect(() => {
    setDraft(statesFromRules(currentRules));
    setNotice("");
  }, [scope, category, selectedCustomer?.id, data]);

  function setRuleState(contactId: number, state: RuleState) {
    setDraft(current => ({ ...current, [contactId]: state }));
  }

  async function save() {
    if (scope === "customer" && !selectedCustomer) return;
    const payload: ChatCustomerAccessRulesUpdate = {
      scope,
      category: scope === "category" ? category : null,
      customer_user_id: scope === "customer" ? selectedCustomer!.id : null,
      rules: Object.entries(draft)
        .filter(([, effect]) => effect !== "default")
        .map(([contactId, effect]) => ({
          contact_user_id: Number(contactId),
          effect: effect as "include" | "exclude",
        })),
    };
    try {
      await saveRules.mutateAsync({ data: payload });
      await client.invalidateQueries({ queryKey: getGetChatAdminCustomerAccessQueryKey() });
      setNotice("تم حفظ صلاحيات المحادثة.");
    } catch {
      setNotice("تعذر حفظ الصلاحيات. تحقق من الاتصال ثم حاول مجدداً.");
    }
  }

  const defaultNames = selectedCustomer
    ? selectedCustomer.default_contact_ids
      .map(id => data?.staff.find(contact => contact.id === id)?.name)
      .filter((name): name is string => Boolean(name))
    : [];

  return (
    <div
      className="fixed inset-0 z-[86] flex items-center justify-center bg-[#122b3b]/40 p-3 backdrop-blur-[2px] sm:p-5"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-chat-access-title"
        className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[#e2e8e1] bg-[#fcfcf9] shadow-2xl"
        dir="rtl"
      >
        <header className="flex items-center justify-between border-b border-[#e8ebe5] px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f1e9] text-[#1d756f]"><ShieldCheck size={19}/></span>
            <div>
              <h2 id="customer-chat-access-title" className="font-extrabold text-[#18334a]">صلاحيات محادثات العملاء</h2>
              <p className="mt-1 text-xs text-slate-500">الافتراضي هو المشرف والمندوب في أحدث طلب غير ملغى.</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button>
        </header>

        <div className="chat-scroll flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {accessQuery.isLoading ? (
            <div className="space-y-3">
              <div className="h-11 animate-pulse rounded-xl bg-slate-100"/>
              <div className="h-28 animate-pulse rounded-xl bg-slate-100"/>
              <div className="h-48 animate-pulse rounded-xl bg-slate-100"/>
            </div>
          ) : accessQuery.isError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <p>تعذر تحميل إعدادات صلاحيات المحادثة.</p>
              <button onClick={() => accessQuery.refetch()} className="mt-2 font-bold underline">إعادة المحاولة</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 rounded-2xl bg-[#f0f3ee] p-1.5">
                <button
                  type="button"
                  aria-pressed={scope === "category"}
                  onClick={() => setScope("category")}
                  className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${scope === "category" ? "bg-white text-[#1d756f] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >حسب فئة العميل</button>
                <button
                  type="button"
                  aria-pressed={scope === "customer"}
                  onClick={() => setScope("customer")}
                  className={`rounded-xl px-3 py-2.5 text-sm font-bold transition ${scope === "customer" ? "bg-white text-[#1d756f] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >حسب عميل محدد</button>
              </div>

              {scope === "category" ? (
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(categoryLabel) as Category[]).map(key => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={category === key}
                      onClick={() => setCategory(key)}
                      className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${category === key ? "border-[#8db7a6] bg-[#eaf3ed] text-[#1d756f]" : "border-[#e3e8e1] bg-white text-slate-500 hover:border-[#b5cdbf]"}`}
                    >{categoryLabel[key]}</button>
                  ))}
                </div>
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">العميل</span>
                  <select
                    value={customerId ?? ""}
                    onChange={event => setCustomerId(event.target.value ? Number(event.target.value) : null)}
                    className="w-full rounded-xl border border-[#e3e8e1] bg-white px-3 py-2.5 text-sm text-[#29485a] outline-none focus:border-[#9dbfb1]"
                  >
                    <option value="" disabled>اختر عميلاً</option>
                    {(data?.customers ?? []).map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} — {customer.phone} ({customer.category ? categoryLabel[customer.category] : "غير مصنف"})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {scope === "customer" && selectedCustomer && (
                <div className="rounded-xl border border-[#e4e9e1] bg-white px-3.5 py-3 text-xs leading-5 text-slate-600">
                  {selectedCustomer.category
                    ? <>قواعد هذه الفئة ({categoryLabel[selectedCustomer.category]}) تُطبق أولاً، ثم تتقدم عليها أي قاعدة هنا.</>
                    : "هذا الحساب غير مرتبط حالياً بإحدى فئتي العملاء؛ ستُطبق عليه القواعد المحددة له فقط."}
                  <div className="mt-1.5 text-slate-500">
                    الجهات الافتراضية من أحدث طلب غير ملغى: {defaultNames.length ? defaultNames.join("، ") : "لا يوجد مشرف أو مندوب معيّن"}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-[#18334a]">المشرفون والمناديب</h3>
                  <p className="mt-1 text-xs text-slate-500">اختر الافتراضي أو اسمح أو امنع لكل جهة تواصل.</p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                    placeholder="ابحث عن مشرف أو مندوب"
                    className="w-full rounded-xl border border-[#e4e9e1] bg-white py-2 pe-9 ps-3 text-xs outline-none focus:border-[#9dbfb1]"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#e5e9e2] bg-white">
                {staff.length ? staff.map(contact => {
                  const state = draft[contact.id] ?? "default";
                  return (
                    <div key={contact.id} className="flex flex-col gap-3 border-b border-[#edf0eb] px-3 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-[#29485a]">{contact.name}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{roleLabel[contact.role] ?? contact.role} · <span dir="ltr">{contact.phone}</span></div>
                      </div>
                      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#f2f4f0] p-1">
                        {([
                          ["default", "افتراضي"],
                          ["include", "سماح"],
                          ["exclude", "منع"],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={state === value}
                            onClick={() => setRuleState(contact.id, value)}
                            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${state === value
                              ? value === "exclude" ? "bg-rose-100 text-rose-700 shadow-sm"
                                : value === "include" ? "bg-[#dff0e6] text-[#277253] shadow-sm"
                                  : "bg-white text-[#49675b] shadow-sm"
                              : "text-slate-500 hover:text-slate-700"}`}
                          >{label}</button>
                        ))}
                      </div>
                    </div>
                  );
                }) : <div className="px-4 py-10 text-center text-sm text-slate-500">{data?.staff.length ? "لا توجد نتائج مطابقة." : "لا يوجد مشرفون أو مندوبون نشطون."}</div>}
              </div>
            </>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-[#e8ebe5] bg-[#fbfbf8] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p role="status" className="min-h-5 text-xs text-[#527569]">{notice}</p>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-xl border border-[#e1e6df] bg-white px-4 py-2.5 text-sm font-bold text-slate-600">إغلاق</button>
            <button
              onClick={() => void save()}
              disabled={accessQuery.isLoading || accessQuery.isError || saveRules.isPending || (scope === "customer" && !selectedCustomer)}
              className="rounded-xl bg-[#1d756f] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#165e59] disabled:cursor-not-allowed disabled:opacity-50"
            >{saveRules.isPending ? "جارٍ الحفظ…" : "حفظ الصلاحيات"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}