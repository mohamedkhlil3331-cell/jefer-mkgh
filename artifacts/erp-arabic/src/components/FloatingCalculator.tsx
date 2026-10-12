import { useState, type ReactNode } from "react";
import { Calculator, Clock3, Delete, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

type Calculation = {
  expression: string;
  result: string;
  createdAt: number;
};

const HISTORY_LIMIT = 20;
const HISTORY_PREFIX = "mkgh-calculator-history-v1:";

function loadHistory(userId: number): Calculation[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(`${HISTORY_PREFIX}${userId}`) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Calculation =>
      item !== null
      && typeof item === "object"
      && typeof item.expression === "string"
      && typeof item.result === "string"
      && typeof item.createdAt === "number"
    ).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function evaluateExpression(source: string): number {
  const input = source.replace(/\s+/g, "");
  const tokens = input.match(/(?:\d+(?:\.\d*)?|\.\d+)|[+\-*/]/g);
  if (!tokens || tokens.join("") !== input) throw new Error("Invalid expression");

  let index = 0;
  const parseNumber = (): number => {
    const token = tokens[index++];
    if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) throw new Error("Expected number");
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("Invalid number");
    return value;
  };
  const parseUnary = (): number => {
    if (tokens[index] === "+") {
      index++;
      return parseUnary();
    }
    if (tokens[index] === "-") {
      index++;
      return -parseUnary();
    }
    return parseNumber();
  };
  const parseProduct = (): number => {
    let value = parseUnary();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const operator = tokens[index++];
      const right = parseUnary();
      if (operator === "/" && right === 0) throw new Error("Division by zero");
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };
  const parseSum = (): number => {
    let value = parseProduct();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const operator = tokens[index++];
      const right = parseProduct();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };

  const result = parseSum();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error("Invalid expression");
  return result;
}

function formatResult(value: number): string {
  return String(Number(value.toPrecision(12)));
}

function CalculatorForUser({ userId }: { userId: number }) {
  const [open, setOpen] = useState(false);
  const [expression, setExpression] = useState("");
  const [justCalculated, setJustCalculated] = useState(false);
  const [history, setHistory] = useState<Calculation[]>(() => loadHistory(userId));

  const append = (value: string) => {
    setExpression(current => justCalculated && /[0-9.]/.test(value) ? value : current + value);
    setJustCalculated(false);
  };

  const calculate = () => {
    if (!expression.trim()) return;
    try {
      const result = formatResult(evaluateExpression(expression));
      const nextHistory = [{ expression, result, createdAt: Date.now() }, ...history].slice(0, HISTORY_LIMIT);
      setHistory(nextHistory);
      try {
        localStorage.setItem(`${HISTORY_PREFIX}${userId}`, JSON.stringify(nextHistory));
      } catch {
        // Calculation stays available even when browser storage is unavailable.
      }
      setExpression(result);
      setJustCalculated(true);
    } catch {
      setExpression("خطأ");
      setJustCalculated(true);
    }
  };

  const clear = () => {
    setExpression("");
    setJustCalculated(false);
  };

  const press = (value: string) => {
    if (value === "clear") return clear();
    if (value === "backspace") {
      setExpression(current => current === "خطأ" ? "" : current.slice(0, -1));
      setJustCalculated(false);
      return;
    }
    if (value === "=") return calculate();
    append(value);
  };

  const keys: { label: ReactNode; value: string; style?: string }[] = [
    { label: "C", value: "clear", style: "text-rose-600 dark:text-rose-400" },
    { label: <Delete size={18} />, value: "backspace", style: "text-muted-foreground" },
    { label: "÷", value: "/", style: "text-[#0e7490] dark:text-cyan-300" },
    { label: "×", value: "*", style: "text-[#0e7490] dark:text-cyan-300" },
    { label: "7", value: "7" },
    { label: "8", value: "8" },
    { label: "9", value: "9" },
    { label: "−", value: "-", style: "text-[#0e7490] dark:text-cyan-300" },
    { label: "4", value: "4" },
    { label: "5", value: "5" },
    { label: "6", value: "6" },
    { label: "+", value: "+", style: "text-[#0e7490] dark:text-cyan-300" },
    { label: "1", value: "1" },
    { label: "2", value: "2" },
    { label: "3", value: "3" },
    { label: "0", value: "0" },
    { label: ".", value: "." },
    { label: "=", value: "=", style: "col-span-2 bg-[#103c68] text-white hover:bg-[#174f82] dark:bg-cyan-700 dark:hover:bg-cyan-600" },
  ];

  return (
    <div className="fixed bottom-5 right-5 z-[70]" dir="rtl">
      {open && (
        <section
          aria-label="الآلة الحاسبة"
          className="mb-3 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl"
          data-testid="panel-calculator"
        >
          <header className="flex items-center gap-3 bg-[#103c68] px-4 py-3 text-white dark:bg-slate-900">
            <Calculator size={20} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">آلة حاسبة</h2>
              <p className="text-xs text-white/70">حساباتك محفوظة على هذا الجهاز</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="إخفاء الآلة الحاسبة"
              data-testid="button-hide-calculator"
              className="rounded-lg p-2 text-white/80 transition hover:bg-white/15 hover:text-white"
            >
              <X size={18} />
            </button>
          </header>

          <div className="p-3">
            <div
              className="mb-3 flex min-h-16 items-end justify-end overflow-x-auto rounded-xl bg-muted px-3 py-2 text-left font-mono text-2xl font-semibold"
              dir="ltr"
              aria-live="polite"
              data-testid="display-calculator"
            >
              {expression || "0"}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {keys.map((key, index) => (
                <button
                  key={key.value}
                  type="button"
                  onClick={() => press(key.value)}
                  data-testid={`button-calculator-${key.value === "=" ? "equals" : key.value === "clear" ? "clear" : key.value === "backspace" ? "backspace" : index}`}
                  className={`flex h-12 items-center justify-center rounded-xl bg-muted text-lg font-semibold transition hover:bg-accent active:scale-95 ${key.style || ""}`}
                >
                  {key.label}
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-border pt-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-muted-foreground">
                <Clock3 size={15} />
                <span>آخر العمليات</span>
              </div>
              {history.length ? (
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {history.map((item, index) => (
                    <button
                      key={`${item.createdAt}-${index}`}
                      type="button"
                      onClick={() => {
                        setExpression(item.result);
                        setJustCalculated(true);
                      }}
                      data-testid={`button-calculator-history-${index}`}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition hover:bg-muted"
                    >
                      <span className="truncate font-mono text-muted-foreground" dir="ltr">{item.expression}</span>
                      <span className="shrink-0 font-mono font-semibold" dir="ltr">= {item.result}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="py-1 text-xs text-muted-foreground">ستظهر العمليات هنا بعد الحساب.</p>
              )}
            </div>
          </div>
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-label={open ? "إخفاء الآلة الحاسبة" : "إظهار الآلة الحاسبة"}
        aria-expanded={open}
        data-testid="button-toggle-calculator"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#103c68] text-white shadow-xl transition hover:-translate-y-0.5 hover:bg-[#174f82] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300 dark:bg-cyan-700 dark:hover:bg-cyan-600"
      >
        {open ? <X size={23} /> : <Calculator size={23} />}
      </button>
    </div>
  );
}

export default function FloatingCalculator() {
  const { user } = useAuth();
  if (!user) return null;
  return <CalculatorForUser key={user.id} userId={user.id} />;
}
