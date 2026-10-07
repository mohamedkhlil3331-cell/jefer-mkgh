export default function Slide07DriverStatement() {
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
          نموذج كشف الاستعاضة
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
        style={{ top: '12.5vh', bottom: 0, left: 0, right: 0, padding: '2.5vh 5vw' }}
      >
        {/* Document card */}
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
          {/* Document header */}
          <div style={{ backgroundColor: '#103c68', padding: '2vh 3vw' }}>
            <div className="flex items-center justify-between">
              <div>
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.5vw', color: '#ffffff' }}>
                  كشف استعاضة (عهدة)
                </p>
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#0eb5cb', marginTop: '0.3vh' }}>
                  شركة جيفر التجارية — MKGH
                </p>
              </div>
              <div className="flex" style={{ gap: '3vw' }}>
                <div>
                  <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.4vw', color: '#0eb5cb' }}>رقم الكشف</p>
                  <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#ffffff' }}>KH-2026-083</p>
                </div>
                <div>
                  <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.4vw', color: '#0eb5cb' }}>الفترة</p>
                  <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#ffffff' }}>01–15 / 08 / 2026</p>
                </div>
              </div>
            </div>
          </div>

          {/* Driver info */}
          <div className="flex px-[3vw] py-[1.2vh]" style={{ backgroundColor: '#f8fafc', borderBottom: '0.1vh solid #e2e8f0', gap: '5vw' }}>
            <div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.4vw', color: '#64748b' }}>اسم السائق</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.9vw', color: '#0f2744' }}>خالد محمد السهلي</p>
            </div>
            <div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.4vw', color: '#64748b' }}>السيارة</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.9vw', color: '#0f2744' }}>XYZ 5678</p>
            </div>
            <div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.4vw', color: '#64748b' }}>العهدة الدائمة</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.9vw', color: '#0f2744' }}>2,000 ر.س</p>
            </div>
          </div>

          {/* Table header */}
          <div className="flex px-[3vw] py-[0.8vh]" style={{ backgroundColor: '#0eb5cb' }}>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#ffffff', flex: 1 }}>رقم الرحلة</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#ffffff', flex: 2 }}>الوصف</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#ffffff', flex: 1, textAlign: 'center' }}>التاريخ</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#ffffff', flex: 1, textAlign: 'left' }}>المبلغ</p>
          </div>

          {/* Table rows */}
          <div className="flex px-[3vw] py-[0.9vh]" style={{ borderBottom: '0.1vh solid #f1f5f9' }}>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 1 }}>TR-1041</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 2 }}>وقود — رحلة الرياض</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 1, textAlign: 'center' }}>03/08</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 1, textAlign: 'left' }}>380.00</p>
          </div>

          <div className="flex px-[3vw] py-[0.9vh]" style={{ borderBottom: '0.1vh solid #f1f5f9', backgroundColor: '#fafcff' }}>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 1 }}>TR-1042</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 2 }}>رسوم طريق — جدة</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 1, textAlign: 'center' }}>07/08</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 1, textAlign: 'left' }}>95.00</p>
          </div>

          <div className="flex px-[3vw] py-[0.9vh]" style={{ borderBottom: '0.1vh solid #f1f5f9' }}>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 1 }}>TR-1045</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 2 }}>وقود + مصاريف متنوعة</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 1, textAlign: 'center' }}>12/08</p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 1, textAlign: 'left' }}>510.00</p>
          </div>

          {/* Totals */}
          <div className="flex px-[3vw] py-[1.2vh]" style={{ backgroundColor: '#f8fafc', borderTop: '0.15vh solid #e2e8f0', gap: '2vw' }}>
            <div style={{ flex: 1 }}>
              <div className="flex" style={{ gap: '3vw' }}>
                <div>
                  <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.4vw', color: '#64748b' }}>إجمالي المصروف</p>
                  <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#e53e3e' }}>985.00 ر.س</p>
                </div>
                <div>
                  <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.4vw', color: '#64748b' }}>الرصيد المتبقي</p>
                  <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68' }}>1,015.00 ر.س</p>
                </div>
                <div>
                  <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.4vw', color: '#64748b' }}>صافي المستحق</p>
                  <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.5vw', color: '#0eb5cb' }}>0 ر.س</p>
                </div>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="flex px-[3vw] py-[1.2vh]" style={{ borderTop: '0.1vh solid #e2e8f0', gap: '4vw' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.4vw', color: '#64748b' }}>توقيع السائق</p>
              <div style={{ borderBottom: '0.15vh solid #cbd5e1', marginTop: '1.8vh', width: '75%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.4vw', color: '#64748b' }}>توقيع مشرف الحركة</p>
              <div style={{ borderBottom: '0.15vh solid #cbd5e1', marginTop: '1.8vh', width: '75%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.4vw', color: '#64748b' }}>توقيع المحاسب</p>
              <div style={{ borderBottom: '0.15vh solid #cbd5e1', marginTop: '1.8vh', width: '75%' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
