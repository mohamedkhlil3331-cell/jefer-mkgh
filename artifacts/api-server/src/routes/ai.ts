import { Router } from "express";
import db from "../lib/db.js";

const router = Router();

const BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const API_KEY  = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

const SYSTEM_PROMPTS: Record<string, string> = {
  admin: `أنت مساعد ذكي لشركة MKGH للأسمنت ومواد البناء. تساعد المدير على:
- إدارة الطلبات والموظفين والسائقين
- تحليل المبيعات والتقارير المالية
- إدارة المستودعات والأسطول
- متابعة الموارد البشرية
أجب باللغة العربية باختصار ووضوح. الشركة تبيع: اسمنت المدينة والقصيم، جيفر، بركاني، بلوك.`,

  supervisor: `أنت مساعد ذكاء اصطناعي لمشرف النقليات في شركة MKGH. تساعد في:
- تخصيص السيارات للطلبات
- متابعة السائقين والرحلات
- إدارة مشاكل التوصيل
أجب باللغة العربية.`,

  driver: `أنت مساعد للسائق في شركة MKGH. تساعد في:
- فهم تفاصيل الطلبات والمواقع
- الإجابة على أسئلة التوصيل
- إرشادات الطريق والمناطق
أجب باللغة العربية بأسلوب بسيط.`,

  warehouse: `أنت مساعد موظف المستودع في شركة MKGH. تساعد في:
- إصدار الفواتير وحساب ضريبة القيمة المضافة (15%)
- مخزون المنتجات والأسمنت والبلوك
- إجراءات التحميل والتسليم
أجب باللغة العربية.`,

  reviewer: `أنت مساعد المراجع في شركة MKGH. تساعد في:
- مراجعة الطلبات والموافقة عليها
- التحقق من بيانات العملاء
- متابعة سير العمل
أجب باللغة العربية.`,

  customer: `أنت مساعد عملاء شركة MKGH للأسمنت ومواد البناء. تساعد في:
- التعرف على المنتجات وأسعارها (اسمنت، جيفر، بركاني، بلوك)
- كيفية تقديم الطلبات وتتبعها
- الفواتير والضريبة والدفع
- أوقات التوصيل والمناطق المتاحة
أجب باللغة العربية بأسلوب ودي ومختصر. إذا سأل عن سعر: اسمنت عادي 13-18 ريال للكيس، جيفر/بلوك 3-8 ريال للحبة.`,

  guest: `أنت مساعد زوار موقع شركة MKGH للأسمنت ومواد البناء. تساعد في:
- التعريف بالشركة ومنتجاتها
- شرح كيفية التسجيل وإنشاء حساب
- الإجابة على الأسئلة العامة
المنتجات: اسمنت المدينة والقصيم، جيفر، بركاني، بلوك بأسعار تنافسية.
أجب باللغة العربية واقترح على الزائر إنشاء حساب للطلب.`,
};

// ── POST /ai/chat ─────────────────────────────────────────────────────────────
router.post("/ai/chat", async (req, res) => {
  if (!BASE_URL || !API_KEY)
    return void res.status(503).json({ error: "خدمة الذكاء الاصطناعي غير متاحة حالياً" });

  const { messages, role, user_phone, user_id } = req.body as {
    messages: { role: string; content: string }[];
    role?: string;
    user_phone?: string;
    user_id?: number;
  };

  if (!messages || !Array.isArray(messages))
    return void res.status(400).json({ error: "messages مطلوبة" });

  const systemPrompt = SYSTEM_PROMPTS[role || "guest"] || SYSTEM_PROMPTS.guest;
  const lastUserMsg = messages[messages.length - 1]?.content || "";

  // Build context from DB for the relevant role
  let context = "";
  if (role === "admin" || role === "supervisor") {
    const ordersCount = (db.prepare("SELECT COUNT(*) as c FROM workflow_orders WHERE stage NOT IN ('delivered','cancelled')").get() as {c:number}).c;
    const empCount    = (db.prepare("SELECT COUNT(*) as c FROM employees WHERE status='يعمل'").get() as {c:number}).c;
    const pendingHR   = (db.prepare("SELECT COUNT(*) as c FROM hr_requests WHERE status='pending'").get() as {c:number}).c;
    context = `\n\n[بيانات الشركة الحالية]\n- الطلبات النشطة: ${ordersCount}\n- الموظفون العاملون: ${empCount}\n- طلبات HR معلقة: ${pendingHR}`;
  } else if ((role === "customer" || role === "guest") && user_phone) {
    const myOrders = (db.prepare("SELECT COUNT(*) as c FROM workflow_orders WHERE customer_phone=?").get(user_phone) as {c:number}).c;
    context = myOrders > 0 ? `\n\n[بيانات العميل]\n- لديك ${myOrders} طلب سابق في النظام` : "";
  }

  // Persist user message
  if (user_phone && lastUserMsg) {
    db.prepare("INSERT INTO ai_messages (user_id,user_phone,role,content) VALUES (?,?,?,?)")
      .run(user_id || null, user_phone, "user", lastUserMsg);
  }

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: "gpt-5.4",
        max_completion_tokens: 512,
        messages: [
          { role: "system", content: systemPrompt + context },
          ...messages.slice(-8), // keep last 8 turns
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return void res.status(500).json({ error: "فشل الاتصال بالذكاء الاصطناعي", details: err });
    }

    const data = await response.json() as { choices: { message: { content: string } }[] };
    const reply = data.choices?.[0]?.message?.content || "عذراً، لم أتمكن من الرد حالياً.";

    // Persist assistant reply
    if (user_phone) {
      db.prepare("INSERT INTO ai_messages (user_id,user_phone,role,content) VALUES (?,?,?,?)")
        .run(user_id || null, user_phone, "assistant", reply);
    }

    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: "خطأ في الاتصال بالذكاء الاصطناعي" });
  }
});

// ── GET /ai/history ───────────────────────────────────────────────────────────
router.get("/ai/history", (req, res) => {
  const { phone } = req.query as { phone?: string };
  if (!phone) return void res.json([]);
  const rows = db.prepare(
    "SELECT role,content,created_at FROM ai_messages WHERE user_phone=? ORDER BY created_at DESC LIMIT 40"
  ).all(phone);
  res.json(rows.reverse());
});

export default router;
