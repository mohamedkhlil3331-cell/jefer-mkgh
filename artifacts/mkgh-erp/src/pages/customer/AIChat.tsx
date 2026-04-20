import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Sparkles } from "lucide-react";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  time: string;
}

const autoReplies: Record<string, string> = {
  "track": "Your order ORD-0001 is currently **In Transit** from Riyadh to Jeddah. Estimated arrival: tomorrow by 3 PM. The driver is Mohammed Al-Harbi (RYH-4421).",
  "order": "To place a new order, go to **Place Order** from the sidebar. You'll be able to select the origin, destination, vehicle type, and cargo weight. Your orders are typically reviewed within 30 minutes.",
  "status": "Here are your active orders:\n• ORD-0001 — In Transit (Riyadh → Jeddah)\n• ORD-0002 — Pending (Dammam → Riyadh)\n\nWould you like more details on any specific order?",
  "hello": "Hello! I'm your MKGH Logistics assistant. I can help you track orders, place new shipments, check delivery status, and answer logistics questions. How can I help you today?",
  "hi": "Hi there! I'm here to help with your logistics needs. You can ask me about order tracking, shipment status, or how to place a new order.",
  "help": "Here's what I can help you with:\n\n• **Track your shipments** — ask 'where is my order?'\n• **Order status** — ask 'what orders do I have?'\n• **Place orders** — ask 'how do I create a new order?'\n• **Delivery times** — ask 'when will my package arrive?'\n\nWhat would you like to know?",
  "delivery": "Estimated delivery times depend on the route:\n• Riyadh → Jeddah: 6-8 hours\n• Riyadh → Dammam: 4-5 hours\n• Jeddah → Mecca: 1-2 hours\n\nUrgent orders get priority handling with same-day pickup.",
  "invoice": "Your recent invoice INV-2026-0045 for ORD-0003 (Gulf Traders LLC) has been processed. Total amount: SAR 4,200. Payment due: May 1, 2026.",
};

function getReply(msg: string): string {
  const lower = msg.toLowerCase();
  for (const [key, reply] of Object.entries(autoReplies)) {
    if (lower.includes(key)) return reply;
  }
  return "I understand your question about logistics. Our team is available 24/7 for urgent inquiries. For specific shipment issues, please call our operations center at +966 11 234 5678 or I can connect you to a live agent. Is there anything else I can help you with?";
}

function now() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

const suggestions = ["Track my order", "Order status", "Delivery times", "How to place an order"];

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, role: "assistant", content: "Hello! I'm your MKGH AI Logistics Assistant. How can I help you with your shipments today?", time: now() }
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { id: Date.now(), role: "user", content: text, time: now() };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setTyping(true);
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 600));
    setTyping(false);
    const reply: Message = { id: Date.now() + 1, role: "assistant", content: getReply(text), time: now() };
    setMessages(m => [...m, reply]);
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-foreground">AI Logistics Assistant</h2>
        <p className="text-muted-foreground text-sm mt-1">Ask me anything about your orders, deliveries, and shipments</p>
      </div>

      <div className="bg-card border border-card-border rounded-2xl shadow-xs overflow-hidden flex flex-col" style={{ height: "calc(100vh - 240px)", minHeight: 480 }}>
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">MKGH Assistant</p>
            <p className="text-xs text-green-500 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block" /> Online</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <AnimatePresence>
            {messages.map(msg => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${msg.role === "assistant" ? "bg-gradient-to-br from-blue-500 to-blue-700" : "bg-[#f97316]"}`}>
                  {msg.role === "assistant" ? <Bot className="w-3.5 h-3.5 text-white" /> : <User className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className={`max-w-[75%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                    msg.role === "assistant"
                      ? "bg-muted text-foreground rounded-tl-sm"
                      : "bg-[#f97316] text-white rounded-tr-sm"
                  }`}>
                    {msg.content}
                  </div>
                  <p className="text-[10px] text-muted-foreground px-1">{msg.time}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {typing && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex-shrink-0 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-muted px-4 py-3 rounded-2xl rounded-tl-sm">
                <div className="flex gap-1 items-center h-4">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="w-1.5 h-1.5 bg-muted-foreground rounded-full"
                      animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick suggestions */}
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {suggestions.map(s => (
            <button key={s} onClick={() => sendMessage(s)}
              className="flex-shrink-0 px-3 py-1.5 bg-muted text-muted-foreground text-xs rounded-full hover:bg-muted/80 hover:text-foreground transition-all border border-border whitespace-nowrap">
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-border flex gap-3 items-end">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
          <motion.button
            whileTap={{ scale: 0.92 }}
            type="submit"
            disabled={!input.trim() || typing}
            className="w-10 h-10 rounded-xl mkgh-gradient-orange flex items-center justify-center text-white shadow hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
