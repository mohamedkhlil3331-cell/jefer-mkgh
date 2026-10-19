import React from "react";

const baseUrl = import.meta.env.BASE_URL;
const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent("https://jefer-mkgh1.com")}&format=png`;

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 800,
  color: "#103c68",
  borderBottom: "2px solid #103c68",
  paddingBottom: "5px",
  marginBottom: "8px",
};

const tableCellStyle: React.CSSProperties = {
  padding: "6px 9px",
  borderBottom: "1px solid #e2e8f0",
  color: "#1e293b",
  verticalAlign: "top",
};

export default function Slide12ExpenseApproval() {
  return (
    <div
      className="approval-slide"
      style={{
        background: "#f8f9fa",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: 0,
        fontFamily: "'Tajawal', sans-serif",
        direction: "rtl",
      }}
    >
      <button
        onClick={() => window.print()}
        className="no-print"
        style={{
          position: "fixed",
          top: "12px",
          left: "12px",
          background: "#103c68",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          padding: "8px 18px",
          fontSize: "14px",
          cursor: "pointer",
          fontFamily: "'Tajawal', sans-serif",
          fontWeight: 700,
          zIndex: 1000,
        }}
      >
        طباعة التقرير
      </button>

      <div
        className="approval-paper"
        style={{
          background: "#fff",
          width: "210mm",
          minHeight: "297mm",
          margin: "16px auto",
          padding: "14mm 16mm 12mm",
          boxShadow: "0 4px 24px rgba(0,0,0,0.14)",
          border: "1px solid #d0d7e2",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
          color: "#1e293b",
        }}
      >
        <div
          style={{
            background: "#103c68",
            height: "6px",
            borderRadius: "3px",
            marginBottom: "12px",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "10px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <img
              src={`${baseUrl}jefer-logo.png`}
              alt="JEFER"
              crossOrigin="anonymous"
              style={{ height: "54px", width: "150px", objectFit: "contain", objectPosition: "right" }}
            />
            <div style={{ fontSize: "11px", color: "#0eb5cb", fontWeight: 700 }}>
              jefer-mkgh1.com
            </div>
          </div>

          <div style={{ textAlign: "center", color: "#103c68" }}>
            <div style={{ fontSize: "12px", color: "#64748b" }}>التاريخ</div>
            <div style={{ fontSize: "14px", fontWeight: 700 }}>19 أكتوبر 2026</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
            <img
              src={QR_URL}
              alt="رمز QR لموقع jefer-mkgh1.com"
              crossOrigin="anonymous"
              style={{ width: "72px", height: "72px", imageRendering: "pixelated" }}
            />
            <div style={{ fontSize: "9px", color: "#64748b", direction: "ltr" }}>
              jefer-mkgh1.com
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#0eb5cb",
            height: "3px",
            borderRadius: "2px",
            marginBottom: "12px",
          }}
        />

        <div style={{ textAlign: "center", marginBottom: "12px" }}>
          <div style={{ fontSize: "21px", fontWeight: 900, color: "#103c68", lineHeight: 1.35 }}>
            تقرير المصروفات المالي والتكاليف التشغيلية
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "3px" }}>
            الجهة: شركة جيفر التجارية
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", marginBottom: "13px" }}>
          <div
            style={{
              flex: 1,
              background: "#effcfb",
              border: "1px solid #a7f3d0",
              borderRadius: "6px",
              padding: "8px 6px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "10px", color: "#64748b" }}>إجمالي المصاريف التشغيلية</div>
            <div style={{ fontSize: "16px", fontWeight: 900, color: "#103c68", direction: "ltr" }}>USD $2,426.38</div>
          </div>
          <div
            style={{
              flex: 1,
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              borderRadius: "6px",
              padding: "8px 6px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "10px", color: "#64748b" }}>المصاريف الاستهلاكية المتغيرة</div>
            <div style={{ fontSize: "16px", fontWeight: 900, color: "#103c68", direction: "ltr" }}>
              USD $1,908.00
            </div>
          </div>
          <div
            style={{
              flex: 1,
              background: "#effcfb",
              border: "1px solid #a7f3d0",
              borderRadius: "6px",
              padding: "8px 6px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "10px", color: "#64748b" }}>إجمالي الاشتراكات الثابتة</div>
            <div style={{ fontSize: "16px", fontWeight: 900, color: "#103c68", direction: "ltr" }}>USD $518.38</div>
          </div>
        </div>

        <section style={{ marginBottom: "12px" }}>
          <div style={sectionTitleStyle}>
            1. ملخص التكاليف المالية (بالدولار الأمريكي USD)
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <thead>
              <tr style={{ background: "#103c68", color: "#fff" }}>
                <th style={{ padding: "7px 9px", textAlign: "right", fontWeight: 700 }}>الخدمة / المورد</th>
                <th style={{ padding: "7px 9px", textAlign: "right", fontWeight: 700 }}>نوع الاشتراك وآلية الدفع</th>
                <th style={{ padding: "7px 9px", textAlign: "center", fontWeight: 700, whiteSpace: "nowrap" }}>التكلفة (USD $)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: "#f8fafc" }}>
                <td style={tableCellStyle}>Replit (اشتراكات البيئة)</td>
                <td style={tableCellStyle}>اشتراك شهري ثابت ($100 شهريًا)</td>
                <td style={{ ...tableCellStyle, textAlign: "center", direction: "ltr" }}>$360.00</td>
              </tr>
              <tr>
                <td style={tableCellStyle}>Replit (مصاريف استهلاكية)</td>
                <td style={tableCellStyle}>مصاريف سحابية متغيرة حسب الاستهلاك المباشر</td>
                <td style={{ ...tableCellStyle, textAlign: "center", direction: "ltr" }}>$1,908.00</td>
              </tr>
              <tr style={{ background: "#f8fafc" }}>
                <td style={tableCellStyle}>Hostinger</td>
                <td style={tableCellStyle}>خطة استضافة مسبقة الدفع لمدة سنتين</td>
                <td style={{ ...tableCellStyle, textAlign: "center", direction: "ltr" }}>$132.20</td>
              </tr>
              <tr>
                <td style={tableCellStyle}>Name.com</td>
                <td style={tableCellStyle}>تجديد سنوي لحماية وملكية النطاق</td>
                <td style={{ ...tableCellStyle, textAlign: "center", direction: "ltr" }}>$21.18</td>
              </tr>
              <tr style={{ background: "#f8fafc" }}>
                <td style={tableCellStyle}>Cloudflare</td>
                <td style={tableCellStyle}>اشتراك شهري دوري لخدمات النطاق وقواعد البيانات ($5.00 شهريًا)</td>
                <td style={{ ...tableCellStyle, textAlign: "center", direction: "ltr" }}>$5.00</td>
              </tr>
              <tr style={{ background: "#effcfb", fontWeight: 800 }}>
                <td style={{ ...tableCellStyle, color: "#166534" }} colSpan={2}>
                  الإجمالي الكلي النهائي (جميع المصاريف المعتمدة)
                </td>
                <td style={{ ...tableCellStyle, textAlign: "center", direction: "ltr", color: "#166534" }}>
                  $2,426.38
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section style={{ marginBottom: "11px" }}>
          <div style={sectionTitleStyle}>2. ملاحظات وآلية تجديد الخدمات</div>
          <div
            style={{
              background: "#f8fafc",
              borderRight: "3px solid #0eb5cb",
              borderRadius: "0 5px 5px 0",
              padding: "7px 11px",
              fontSize: "10.5px",
              lineHeight: 1.8,
            }}
          >
            <div><strong>Replit:</strong> رسوم الاشتراك 100$ شهري ثابتة + المبالغ الاستهلاكية المتغيرة بحسب ضغط السيرفرات والعمليات.</div>
            <div><strong>Hostinger:</strong> خطة مدفوعة بالكامل لمدة سنتين، وستتوقف الخدمة تلقائيًا بنهاية السنتين لحين الانتقال إلى استضافة جديدة.</div>
            <div><strong>Name.com:</strong> رسوم تجديد النطاق تُدفع سنويًا بانتظام لحماية ملكية النطاق.</div>
            <div><strong>Cloudflare:</strong> اشتراك شهري دوري ثابت بمبلغ 5.00$ لتسريع الـ DNS وإدارة قواعد البيانات.</div>
          </div>
        </section>

        <section style={{ marginBottom: "13px" }}>
          <div style={sectionTitleStyle}>
            3. خطة ترشيد وتقليل المصاريف الاستهلاكية لـ Replit
          </div>
          <div
            style={{
              background: "#f1f5f9",
              borderRight: "3px solid #103c68",
              borderRadius: "0 5px 5px 0",
              padding: "7px 11px",
              fontSize: "10.5px",
              lineHeight: 1.8,
            }}
          >
            <div><strong>نقل النظام للنسخة الإنتاجية (Production):</strong> اعتماد الاستضافة الثابتة المخصصة للإنتاج وتقليل الاعتماد على بيئات التطوير الحية.</div>
            <div><strong>تفعيل السكون التلقائي (Auto-Sleep):</strong> إيقاف خوادم التطوير خاملة النشاط تلقائيًا لتجنب استهلاك الموارد بدون حاجة.</div>
            <div><strong>حصر Replit للتطوير فقط:</strong> إبقاء Replit لأغراض البرمجة والتحديثات فقط، وتوجيه حركة المرور الأساسية لاستضافات ثابتة أقل تكلفة.</div>
          </div>
        </section>

        <div style={{ display: "flex", gap: "12px", marginTop: "auto", marginBottom: "12px" }}>
          <div
            style={{
              flex: 1,
              border: "1px dashed #cbd5e1",
              borderRadius: "5px",
              padding: "10px 12px",
              minHeight: "68px",
            }}
          >
            <div style={{ fontSize: "10px", color: "#64748b" }}>إعداد وتطوير البنية التحتية</div>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#103c68", marginTop: "3px" }}>
              محمد خليل غزالة
            </div>
            <div style={{ fontSize: "10px", color: "#64748b", marginTop: "9px" }}>التوقيع: __________________</div>
          </div>
          <div
            style={{
              flex: 1,
              border: "1px dashed #cbd5e1",
              borderRadius: "5px",
              padding: "10px 12px",
              minHeight: "68px",
            }}
          >
            <div style={{ fontSize: "10px", color: "#64748b" }}>يعتمد</div>
            <div style={{ fontSize: "12px", fontWeight: 800, color: "#103c68", marginTop: "3px" }}>
              مدير الشركة
            </div>
            <div style={{ fontSize: "10px", color: "#64748b", marginTop: "9px" }}>التوقيع / الختم: __________________</div>
          </div>
        </div>

        <div style={{ marginTop: "auto" }}>
          <div style={{ background: "#0eb5cb", height: "3px", borderRadius: "2px", marginBottom: "7px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#94a3b8" }}>
            <span>شركة جيفر التجارية</span>
            <span style={{ direction: "ltr" }}>jefer-mkgh1.com</span>
            <span>تقرير المصروفات المالي</span>
          </div>
        </div>
      </div>
    </div>
  );
}
