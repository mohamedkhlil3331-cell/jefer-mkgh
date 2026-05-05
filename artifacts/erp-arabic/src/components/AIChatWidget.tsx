import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { MessageCircle, X, Send, Loader2, Bot, Sparkles, ChevronDown } from "lucide-react";

interface Message { role: "user" | "assistant"; content: string; }

const GREETING: Record<string, string> = {
  admin:      "مرحباً يا مدير! أنا مساعدك الذكي لشركة MKGH. كيف أقدر أساعدك اليوم؟ 💼",
  supervisor: "مرحباً! أنا هنا لمساعدتك في إدارة النقليات والسائقين. كيف أخدمك؟ 🚛",
  driver:     "مرحباً! هل تحتاج مساعدة في تفاصيل الطلبات أو المسارات؟ 🗺️",
  warehouse:  "مرحباً! جاهز لمساعدتك في الفواتير والمخزون. اسألني أي شيء! 📦",
  reviewer:   "مرحباً! أنا مساعدك في عمليات المراجعة والتحقق. كيف أفيدك؟ ✅",
  customer:   "أهلاً بك في MKGH! أنا مساعدك الذكي — اسألني عن المنتجات أو الأسعار أو طلباتك 😊",
  guest:      "أهلاً بك! أنا مساعد MKGH. يمكنني إخبارك عن منتجاتنا وكيفية التسجيل 👋",
};

export default function AIChatWidget() {
  const { user, token } = useAuth();
  const [open, setOpen]       = useState(false);
  const [msgs, setMsgs]       = useState<Message[]>([]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread]   = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const role = (user as (typeof user & { isGuest?: boolean }))?.isGuest ? "guest" : (user?.role ?? "guest");

  // Greeting on first open
  useEffect(() => {
    if (open && msgs.length === 0) {
      const greeting = GREETING[role] || GREETING.guest;
      setMsgs([{ role: "assistant", content: greeting }]);
      setUnread(0);
    }
    if (open) { setUnread(0); setTimeout(() => inputRef.current?.focus(), 100); }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    setMsgs(prev => [...prev, userMsg]);
    setLoading(true);

    const allMsgs = [...msgs, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: allMsgs,
          role,
          user_phone: user?.phone || "guest",
          user_id: user?.id,
        }),
      });
      const data = await res.json();
      const reply = data.reply || "عذراً، لم أتمكن من الرد. حاول مرة أخرى.";
      setMsgs(prev => [...prev, { role: "assistant", content: reply }]);
      if (!open) setUnread(u => u + 1);
    } catch {
      setMsgs(prev => [...prev, { role: "assistant", content: "حدث خطأ في الاتصال. تحقق من اتصالك وحاول مجدداً." }]);
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const clear = () => setMsgs([]);

  return (
    <div className="fixed bottom-5 left-5 z-50" dir="rtl">
      {/* ── Chat window ── */}
      {open && (
        <div className="mb-3 w-[340px] sm:w-[380px] bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col"
          style={{ height: "480px" }}>
          {/* Header */}
          <div className="bg-gradient-to-l from-[#103c68] to-[#0eb5cb] px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Bot size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="text-white font-bold text-sm flex items-center gap-1.5">
                مساعد MKGH الذكي <Sparkles size={11} className="text-yellow-300" />
              </div>
              <div className="text-white/60 text-xs">متاح دائماً للمساعدة</div>
            </div>
            <div className="flex items-center gap-1">
              {msgs.length > 1 && (
                <button onClick={clear}
                  className="text-white/50 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-colors">
                  مسح
                </button>
              )}
              <button onClick={() => setOpen(false)}
                className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center text-white transition-colors">
                <ChevronDown size={15} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
                {m.role === "assistant" && (
                  <div className="w-6 h-6 bg-[#0eb5cb]/15 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ml-2">
                    <Bot size={12} className="text-[#0eb5cb]" />
                  </div>
                )}
                <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                  ${m.role === "user"
                    ? "bg-[#103c68] text-white rounded-tl-sm"
                    : "bg-white text-gray-800 shadow-sm border border-gray-100 rounded-tr-sm"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-end">
                <div className="w-6 h-6 bg-[#0eb5cb]/15 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ml-2">
                  <Bot size={12} className="text-[#0eb5cb]" />
                </div>
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-tr-sm px-4 py-3">
                  <div className="flex gap-1.5 items-center">
                    <div className="w-2 h-2 bg-[#0eb5cb] rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-2 h-2 bg-[#0eb5cb] rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-2 h-2 bg-[#0eb5cb] rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 bg-white border-t border-gray-100 flex gap-2 flex-shrink-0">
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
              placeholder="اكتب سؤالك هنا..."
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0eb5cb]/30 bg-gray-50"
              disabled={loading} />
            <button onClick={send} disabled={loading || !input.trim()}
              className="w-10 h-10 bg-[#0eb5cb] hover:bg-[#0ca3b6] disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* ── Toggle button ── */}
      <button onClick={() => setOpen(v => !v)}
        className="w-13 h-13 w-[52px] h-[52px] bg-gradient-to-br from-[#103c68] to-[#0eb5cb] hover:scale-110
          text-white rounded-2xl shadow-xl flex items-center justify-center transition-all duration-200 relative">
        {open
          ? <X size={22} />
          : <MessageCircle size={22} />
        }
        {!open && unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {unread}
          </span>
        )}
        {!open && (
          <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-2 py-1 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none">
            المساعد الذكي
          </span>
        )}
      </button>
    </div>
  );
}
