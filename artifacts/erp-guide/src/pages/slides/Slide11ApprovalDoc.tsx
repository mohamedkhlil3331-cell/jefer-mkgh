import React from "react";

const modules = [
  "وحدة الورشة — إدارة كروت الصيانة والأعطال",
  "وحدة الأسطول — إدارة السيارات والسائقين والتيدرات",
  "وحدة الحركة والرحلات — متابعة دورة التوصيل",
  "وحدة العهدة والكشوفات — استعاضة السائقين",
  "وحدة المصاريف والتسويات — التسوية الشهرية الإجمالية",
  "وحدة مخزون الورشة — قطع الغيار والمواد",
];

const signatories = [
  { role: "معدّ النظام", name: "م. محمد خليل غزالة" },
  { role: "مدير العمليات", name: "" },
  { role: "المدير العام", name: "" },
];

const loginAccounts = [
  { role: "مدير النظام (System Admin)", user: "mkgh",        perms: "صلاحيات كاملة — جميع الوحدات" },
  { role: "مدير عام بديل",              user: "jefer",       perms: "صلاحيات كاملة — جميع الوحدات" },
  { role: "مراجع",                      user: "0500000001",  perms: "عرض الطلبات والتقارير" },
  { role: "مشرف النقليات",              user: "0500000002",  perms: "إدارة الرحلات والطلبات" },
  { role: "مسؤول المستودع",             user: "0500000003",  perms: "إدارة مخزون الورشة" },
  { role: "مدير الورشة",                user: "0500000006",  perms: "كروت الصيانة والأعطال" },
  { role: "مسؤول المشتريات",            user: "0500000007",  perms: "طلبات الشراء والموردين" },
  { role: "سائق",                       user: "رقم اللوحة", perms: "بوابة الرحلات والعهدة" },
  { role: "عميل",                       user: "0555555555",  perms: "بوابة العميل — الطلبات" },
];

const QR_URL = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=https%3A%2F%2Fjefer-mkgh.com&format=png`;

export default function Slide11ApprovalDoc() {
  const today = new Date().toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="slide approval-slide"
      style={{
        background: "#f8f9fa",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "0",
        fontFamily: "'Tajawal', sans-serif",
        direction: "rtl",
      }}
    >
      {/* Print button — hidden in print */}
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
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        🖨 طباعة الوثيقة
      </button>

      {/* Document paper */}
      <div
        className="approval-paper"
        style={{
          background: "#ffffff",
          width: "210mm",
          minHeight: "297mm",
          margin: "16px auto",
          padding: "18mm 20mm 16mm",
          boxShadow: "0 4px 24px rgba(0,0,0,0.14)",
          border: "1px solid #d0d7e2",
          display: "flex",
          flexDirection: "column",
          gap: "0",
          boxSizing: "border-box",
        }}
      >
        {/* Header stripe */}
        <div
          style={{
            background: "#103c68",
            height: "6px",
            borderRadius: "3px",
            marginBottom: "14px",
          }}
        />

        {/* Logo + company + doc number + QR row */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "10px",
          }}
        >
          {/* Logo + domain */}
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <img
              src="/erp-guide/jefer-logo.png"
              alt="JEFER"
              style={{ height: "62px", objectFit: "contain" }}
            />
            <div style={{ fontSize: "11px", color: "#0eb5cb", fontWeight: 700, letterSpacing: "0.3px" }}>
              🌐 jefer-mkgh.com
            </div>
          </div>

          {/* QR code */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
            <img
              src={QR_URL}
              alt="QR jefer-mkgh.com"
              style={{ width: "80px", height: "80px", imageRendering: "pixelated" }}
            />
            <div style={{ fontSize: "9px", color: "#64748b", textAlign: "center", direction: "ltr" }}>
              jefer-mkgh.com
            </div>
          </div>

          {/* Doc number */}
          <div style={{ textAlign: "left", direction: "ltr" }}>
            <div style={{ fontSize: "11px", color: "#64748b" }}>رقم الوثيقة</div>
            <div
              style={{
                fontSize: "13px",
                fontWeight: 700,
                color: "#103c68",
                letterSpacing: "0.5px",
              }}
            >
              JEFER-MKGH-ERP-2026-001
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
              التاريخ
            </div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "#103c68" }}>
              {today}
            </div>
          </div>
        </div>

        {/* Teal accent line */}
        <div
          style={{
            background: "#0eb5cb",
            height: "3px",
            borderRadius: "2px",
            marginBottom: "14px",
          }}
        />

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <div
            style={{
              fontSize: "22px",
              fontWeight: 900,
              color: "#103c68",
              letterSpacing: "0.5px",
              lineHeight: 1.3,
            }}
          >
            طلب اعتماد تشغيل نظام JEFER-MKGH-ERP
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "#64748b",
              marginTop: "4px",
              fontWeight: 500,
            }}
          >
            System Go-Live Approval Request — JEFER-MKGH-ERP
          </div>
        </div>

        {/* Start date badge */}
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <span style={{
            display: "inline-block",
            background: "#0eb5cb",
            color: "#fff",
            fontWeight: 800,
            fontSize: "13px",
            padding: "5px 18px",
            borderRadius: "20px",
            letterSpacing: "0.3px",
          }}>
            تاريخ بدء التشغيل: 5 / 8 / 2026م
          </span>
        </div>

        {/* Body text */}
        <div
          style={{
            background: "#f1f5f9",
            borderRight: "4px solid #103c68",
            padding: "14px 18px",
            borderRadius: "0 6px 6px 0",
            fontSize: "13.5px",
            lineHeight: 2.1,
            color: "#1e293b",
            marginBottom: "18px",
          }}
        >
          <p style={{ margin: "0 0 8px 0", fontWeight: 700, fontSize: "14px", color: "#103c68" }}>
            السادة / شركة جيفر التجارية المحترمة،
          </p>
          <p style={{ margin: 0 }}>
            نرجو من سيادتكم اعتماد تشغيل{" "}
            <strong>نظام JEFER-MKGH-ERP الخاص بالورشة والنقليات</strong>، بعد أن
            اكتملت برمجتها وتجهيزها للتشغيل الفعلي اعتباراً من تاريخ{" "}
            <strong>5/8/2026م</strong>، على أن يتم العمل عليها من هذا التاريخ.
          </p>
          <p style={{ margin: "8px 0 0 0" }}>
            وبالنسبة للمصاريف والتكاليف فسيتم إرسالها للشركة بعد نهاية الشهر،
            وأيضاً في تقرير العمل الفعلي بعد مضي شهر على تشغيل النظام؛ حتى
            نتمكن من تقييم مدى استكمال العمل عليه.
          </p>
        </div>

        {/* Modules table */}
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 800,
              color: "#103c68",
              borderBottom: "2px solid #103c68",
              paddingBottom: "5px",
              marginBottom: "8px",
            }}
          >
            أولاً: الوحدات المُعتمَدة
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr style={{ background: "#103c68", color: "#fff" }}>
                <th
                  style={{
                    padding: "7px 12px",
                    textAlign: "center",
                    width: "50px",
                    fontWeight: 700,
                  }}
                >
                  م
                </th>
                <th
                  style={{
                    padding: "7px 12px",
                    textAlign: "right",
                    fontWeight: 700,
                  }}
                >
                  الوحدة
                </th>
                <th
                  style={{
                    padding: "7px 12px",
                    textAlign: "center",
                    width: "80px",
                    fontWeight: 700,
                  }}
                >
                  الحالة
                </th>
              </tr>
            </thead>
            <tbody>
              {modules.map((mod, i) => (
                <tr
                  key={i}
                  style={{
                    background: i % 2 === 0 ? "#f8fafc" : "#ffffff",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <td
                    style={{
                      padding: "7px 12px",
                      textAlign: "center",
                      color: "#64748b",
                    }}
                  >
                    {i + 1}
                  </td>
                  <td style={{ padding: "7px 12px", color: "#1e293b" }}>
                    {mod}
                  </td>
                  <td
                    style={{
                      padding: "7px 12px",
                      textAlign: "center",
                      fontWeight: 700,
                      color: "#16a34a",
                      fontSize: "16px",
                    }}
                  >
                    ✓
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <div style={{ marginBottom: "18px" }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 800,
              color: "#103c68",
              borderBottom: "2px solid #103c68",
              paddingBottom: "5px",
              marginBottom: "12px",
            }}
          >
            ثانياً: الاعتماد والتوقيع
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr style={{ background: "#0eb5cb", color: "#fff" }}>
                <th style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700 }}>
                  الصفة
                </th>
                <th style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700 }}>
                  الاسم
                </th>
                <th style={{ padding: "7px 12px", textAlign: "center", fontWeight: 700, width: "120px" }}>
                  التوقيع
                </th>
                <th style={{ padding: "7px 12px", textAlign: "center", fontWeight: 700, width: "100px" }}>
                  التاريخ
                </th>
              </tr>
            </thead>
            <tbody>
              {signatories.map((s, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: "1px solid #e2e8f0" }}
                >
                  <td
                    style={{
                      padding: "14px 12px",
                      fontWeight: 700,
                      color: "#103c68",
                    }}
                  >
                    {s.role}
                  </td>
                  <td style={{ padding: "14px 12px", color: "#1e293b" }}>
                    {s.name || (
                      <span
                        style={{
                          display: "inline-block",
                          width: "160px",
                          borderBottom: "1px solid #94a3b8",
                          height: "18px",
                        }}
                      />
                    )}
                  </td>
                  <td
                    style={{
                      padding: "14px 12px",
                      textAlign: "center",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: "100px",
                        borderBottom: "1px solid #94a3b8",
                        height: "18px",
                      }}
                    />
                  </td>
                  <td
                    style={{
                      padding: "14px 12px",
                      textAlign: "center",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: "80px",
                        borderBottom: "1px solid #94a3b8",
                        height: "18px",
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Login credentials table */}
        <div style={{ marginBottom: "18px" }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 800,
              color: "#103c68",
              borderBottom: "2px solid #103c68",
              paddingBottom: "5px",
              marginBottom: "8px",
            }}
          >
            ثالثاً: بيانات الدخول
          </div>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
            }}
          >
            <thead>
              <tr style={{ background: "#103c68", color: "#fff" }}>
                <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>الدور</th>
                <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, direction: "ltr" }}>اسم المستخدم</th>
                <th style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700 }}>كلمة المرور</th>
                <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700 }}>الصلاحيات</th>
              </tr>
            </thead>
            <tbody>
              {loginAccounts.map((acc, i) => (
                <tr
                  key={i}
                  style={{
                    background: i % 2 === 0 ? "#f8fafc" : "#ffffff",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <td style={{ padding: "6px 10px", fontWeight: 600, color: "#103c68" }}>{acc.role}</td>
                  <td style={{ padding: "6px 10px", textAlign: "center", direction: "ltr", fontFamily: "monospace", fontSize: "12px", color: "#0f172a" }}>{acc.user}</td>
                  <td style={{ padding: "6px 10px", textAlign: "center", color: "#94a3b8", fontSize: "13px", letterSpacing: "2px" }}>●●●●●●</td>
                  <td style={{ padding: "6px 10px", color: "#475569", fontSize: "11.5px" }}>{acc.perms}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Notes */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
            <div
              style={{
                background: "#f0f9ff",
                border: "1px solid #bae6fd",
                borderRadius: "6px",
                padding: "7px 12px",
                fontSize: "11.5px",
                color: "#0c4a6e",
                lineHeight: 1.8,
              }}
            >
              <strong>🔒 ملاحظة — كلمات المرور:</strong> كلمات المرور الابتدائية لجميع الأدوار تُوزَّع بشكل منفصل من قِبَل مدير النظام. يُوصى بتغييرها فور بدء التشغيل الفعلي.
            </div>
            <div
              style={{
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: "6px",
                padding: "7px 12px",
                fontSize: "11.5px",
                color: "#92400e",
                lineHeight: 1.8,
              }}
            >
              <strong>⚙ ملاحظة — نظام الأتمتة:</strong> يربط النظام جميع الأدوار تلقائياً — عند تحديث حالة الطلب تُرسل إشعارات فورية للأدوار المعنية (السائق، المشرف، المستودع، العميل)، وينتقل الطلب بين مراحل دورة التوصيل دون تدخل يدوي. تحديثات الأسطول والتقارير تعكس لحظياً في لوحات جميع المستخدمين.
            </div>
          </div>
        </div>

        {/* Stamp area */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-start",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              width: "110px",
              height: "110px",
              border: "2px dashed #94a3b8",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
              fontSize: "12px",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            الختم
            <br />
            الرسمي
          </div>
        </div>

        {/* Footer line */}
        <div style={{ marginTop: "auto" }}>
          <div
            style={{
              background: "#0eb5cb",
              height: "3px",
              borderRadius: "2px",
              marginBottom: "8px",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "10px",
              color: "#94a3b8",
            }}
          >
            <span>شركة جيفر التجارية — MKGH</span>
            <span>نظام JEFER-MKGH-ERP — الورشة والنقليات</span>
            <span>وثيقة سرية للاستخدام الداخلي</span>
          </div>
        </div>
      </div>
    </div>
  );
}
