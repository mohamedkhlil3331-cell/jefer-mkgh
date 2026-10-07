export default function Slide04MaintenanceCard() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" dir="rtl">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(160deg, #f0f4f8 0%, #e4edf5 100%)' }}
      />

      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-[6vw]"
        style={{ height: '12vh', backgroundColor: '#103c68' }}
      >
        <h2
          style={{
            fontFamily: "'Tajawal', sans-serif",
            fontWeight: 700,
            fontSize: '3.2vw',
            color: '#ffffff',
          }}
        >
          نموذج كرت الصيانة
        </h2>
        <span
          style={{
            fontFamily: "'Tajawal', sans-serif",
            fontWeight: 700,
            fontSize: '1.6vw',
            color: '#0eb5cb',
          }}
        >
          MKGH
        </span>
      </div>

      {/* Accent line */}
      <div
        className="absolute left-0 right-0"
        style={{ top: '12vh', height: '0.5vh', backgroundColor: '#0eb5cb' }}
      />

      {/* Content */}
      <div
        className="absolute flex justify-center"
        style={{ top: '12.5vh', bottom: 0, left: 0, right: 0, padding: '3vh 6vw' }}
      >
        {/* Card mock */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '1vw',
            width: '100%',
            boxShadow: '0 0.5vh 2vh rgba(16,60,104,0.12)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Card header */}
          <div
            className="flex items-center justify-between px-[3vw] py-[1.5vh]"
            style={{ backgroundColor: '#103c68' }}
          >
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2.2vw', color: '#ffffff' }}>
              كرت صيانة
            </p>
            <div className="flex items-center" style={{ gap: '3vw' }}>
              <div>
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: '#0eb5cb' }}>رقم الكرت</p>
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#ffffff' }}>WS-2026-0147</p>
              </div>
              <div>
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: '#0eb5cb' }}>التاريخ</p>
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#ffffff' }}>16 / 08 / 2026</p>
              </div>
            </div>
          </div>

          {/* Info row */}
          <div
            className="flex px-[3vw] py-[1.5vh]"
            style={{ backgroundColor: '#f8fafc', borderBottom: '0.1vh solid #e2e8f0', gap: '4vw' }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: '#64748b' }}>السيارة / التيدر</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68' }}>ABC 1234 — تيدر رقم T-018</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: '#64748b' }}>الفني المسؤول</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68' }}>أحمد عبدالله الحربي</p>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: '#64748b' }}>نوع العطل</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#e53e3e' }}>عطل ميكانيكي</p>
            </div>
          </div>

          {/* Parts table header */}
          <div
            className="flex px-[3vw] py-[1vh]"
            style={{ backgroundColor: '#0eb5cb' }}
          >
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#ffffff', flex: 2 }}>القطعة / المادة</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#ffffff', flex: 1, textAlign: 'center' }}>الكمية</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#ffffff', flex: 1, textAlign: 'center' }}>الوحدة</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#ffffff', flex: 1, textAlign: 'left' }}>السعر</p>
          </div>

          {/* Part row 1 */}
          <div
            className="flex px-[3vw] py-[1vh] items-center"
            style={{ borderBottom: '0.1vh solid #f1f5f9' }}
          >
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 2 }}>فلتر زيت محرك</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 1, textAlign: 'center' }}>2</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 1, textAlign: 'center' }}>قطعة</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 1, textAlign: 'left' }}>85.00</p>
          </div>

          {/* Part row 2 */}
          <div
            className="flex px-[3vw] py-[1vh] items-center"
            style={{ borderBottom: '0.1vh solid #f1f5f9', backgroundColor: '#fafcff' }}
          >
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 2 }}>زيت محرك 15W-40 لتر</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 1, textAlign: 'center' }}>12</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 1, textAlign: 'center' }}>لتر</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 1, textAlign: 'left' }}>22.00</p>
          </div>

          {/* Part row 3 */}
          <div
            className="flex px-[3vw] py-[1vh] items-center"
            style={{ borderBottom: '0.1vh solid #f1f5f9' }}
          >
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 2 }}>سيور توزيع</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 1, textAlign: 'center' }}>1</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 1, textAlign: 'center' }}>قطعة</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744', flex: 1, textAlign: 'left' }}>340.00</p>
          </div>

          {/* Totals + notes row */}
          <div
            className="flex px-[3vw] py-[1.5vh]"
            style={{ backgroundColor: '#f8fafc', gap: '4vw', flex: 1 }}
          >
            <div style={{ flex: 2 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: '#64748b', marginBottom: '0.5vh' }}>ملاحظات</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744' }}>تغيير زيت دوري + استبدال سيور التوزيع بناءً على تقرير الفحص الدوري</p>
            </div>
            <div style={{ textAlign: 'left', minWidth: '18vw' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: '#64748b' }}>الإجمالي</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '3vw', color: '#103c68' }}>
                608.00 <span style={{ fontSize: '1.8vw', fontWeight: 400 }}>ر.س</span>
              </p>
            </div>
          </div>

          {/* Signatures */}
          <div
            className="flex px-[3vw] py-[1.5vh]"
            style={{ borderTop: '0.1vh solid #e2e8f0', gap: '4vw' }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: '#64748b' }}>توقيع الفني</p>
              <div style={{ borderBottom: '0.15vh solid #cbd5e1', marginTop: '2vh', width: '70%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: '#64748b' }}>توقيع مدير الورشة</p>
              <div style={{ borderBottom: '0.15vh solid #cbd5e1', marginTop: '2vh', width: '70%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: '#64748b' }}>توقيع المحاسب</p>
              <div style={{ borderBottom: '0.15vh solid #cbd5e1', marginTop: '2vh', width: '70%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
