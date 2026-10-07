export default function Slide10FuturePlan() {
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
          الخطة القادمة والتكامل الكامل
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
        className="absolute flex"
        style={{ top: '12.5vh', bottom: 0, left: 0, right: 0, padding: '3.5vh 5vw', gap: '4vw' }}
      >
        {/* Left: Roadmap */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2.5vh' }}>
          <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2.2vw', color: '#103c68', marginBottom: '0.5vh' }}>
            خارطة الطريق
          </p>
          <div style={{ width: '4vw', height: '0.4vh', backgroundColor: '#0eb5cb', marginBottom: '0.5vh' }} />

          {/* Phase 1 */}
          <div
            style={{
              backgroundColor: '#103c68',
              borderRadius: '0.8vw',
              padding: '2.5vh 2.5vw',
            }}
          >
            <div className="flex items-center" style={{ marginBottom: '1.5vh', gap: '1.5vw' }}>
              <div
                style={{
                  backgroundColor: '#0eb5cb',
                  borderRadius: '0.4vw',
                  padding: '0.4vh 1.5vw',
                }}
              >
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.6vw', color: '#103c68' }}>
                  المرحلة الأولى — قائمة الآن
                </p>
              </div>
            </div>
            <div className="flex" style={{ gap: '2vw', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
                <div style={{ width: '0.8vw', height: '0.8vw', borderRadius: '50%', backgroundColor: '#0eb5cb' }} />
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: 'rgba(255,255,255,0.9)' }}>الورشة</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
                <div style={{ width: '0.8vw', height: '0.8vw', borderRadius: '50%', backgroundColor: '#0eb5cb' }} />
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: 'rgba(255,255,255,0.9)' }}>الأسطول</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
                <div style={{ width: '0.8vw', height: '0.8vw', borderRadius: '50%', backgroundColor: '#0eb5cb' }} />
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: 'rgba(255,255,255,0.9)' }}>الرحلات</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
                <div style={{ width: '0.8vw', height: '0.8vw', borderRadius: '50%', backgroundColor: '#0eb5cb' }} />
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: 'rgba(255,255,255,0.9)' }}>العهدة</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
                <div style={{ width: '0.8vw', height: '0.8vw', borderRadius: '50%', backgroundColor: '#0eb5cb' }} />
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: 'rgba(255,255,255,0.9)' }}>المصاريف</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
                <div style={{ width: '0.8vw', height: '0.8vw', borderRadius: '50%', backgroundColor: '#0eb5cb' }} />
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: 'rgba(255,255,255,0.9)' }}>مخزون الورشة</p>
              </div>
            </div>
          </div>

          {/* Phase 2 */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '0.2vh dashed #0eb5cb',
              borderRadius: '0.8vw',
              padding: '2.5vh 2.5vw',
            }}
          >
            <div className="flex items-center" style={{ marginBottom: '1.5vh', gap: '1.5vw' }}>
              <div
                style={{
                  backgroundColor: '#e2e8f0',
                  borderRadius: '0.4vw',
                  padding: '0.4vh 1.5vw',
                }}
              >
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.6vw', color: '#64748b' }}>
                  المرحلة الثانية — قادمة قريباً
                </p>
              </div>
            </div>
            <div className="flex" style={{ gap: '2vw', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
                <div style={{ width: '0.8vw', height: '0.8vw', borderRadius: '50%', backgroundColor: '#94a3b8' }} />
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>المستودعات</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
                <div style={{ width: '0.8vw', height: '0.8vw', borderRadius: '50%', backgroundColor: '#94a3b8' }} />
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>التوريد</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
                <div style={{ width: '0.8vw', height: '0.8vw', borderRadius: '50%', backgroundColor: '#94a3b8' }} />
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>الفوترة</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8vw' }}>
                <div style={{ width: '0.8vw', height: '0.8vw', borderRadius: '50%', backgroundColor: '#94a3b8' }} />
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>التقارير المالية</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Integration summary table */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5vh' }}>
          <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2.2vw', color: '#103c68', marginBottom: '0.5vh' }}>
            ملخص الربط بين الوحدات
          </p>
          <div style={{ width: '4vw', height: '0.4vh', backgroundColor: '#0eb5cb', marginBottom: '0.5vh' }} />

          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.8vw',
              overflow: 'hidden',
              boxShadow: '0 0.3vh 1.2vh rgba(16,60,104,0.10)',
              flex: 1,
            }}
          >
            {/* Table header */}
            <div className="flex" style={{ backgroundColor: '#103c68', padding: '1.5vh 2vw' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#0eb5cb', flex: 1 }}>الوحدة</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#0eb5cb', flex: 2 }}>تُرسل بيانات إلى</p>
            </div>

            <div className="flex" style={{ padding: '1.2vh 2vw', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#103c68', flex: 1 }}>الورشة</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 2 }}>مخزون الورشة (خصم قطع)</p>
            </div>

            <div className="flex" style={{ padding: '1.2vh 2vw', borderBottom: '0.1vh solid #f1f5f9', backgroundColor: '#fafcff' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#103c68', flex: 1 }}>الأسطول</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 2 }}>الرحلات (السيارة/السائق)</p>
            </div>

            <div className="flex" style={{ padding: '1.2vh 2vw', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#103c68', flex: 1 }}>الرحلات</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 2 }}>العهدة (مصاريف الرحلة)</p>
            </div>

            <div className="flex" style={{ padding: '1.2vh 2vw', borderBottom: '0.1vh solid #f1f5f9', backgroundColor: '#fafcff' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#103c68', flex: 1 }}>العهدة</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 2 }}>التسويات (رصيد كل سائق)</p>
            </div>

            <div className="flex" style={{ padding: '1.2vh 2vw', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#103c68', flex: 1 }}>مخزون الورشة</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 2 }}>الورشة (تغذية راجعة للمخزون)</p>
            </div>

            <div className="flex" style={{ padding: '1.2vh 2vw', backgroundColor: '#fafcff' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.7vw', color: '#103c68', flex: 1 }}>المصاريف</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#0f2744', flex: 2 }}>التسويات + التقارير الإدارية</p>
            </div>
          </div>

          {/* Bottom caption */}
          <div
            style={{
              backgroundColor: '#103c68',
              borderRadius: '0.6vw',
              padding: '1.5vh 2vw',
              textAlign: 'center',
            }}
          >
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0eb5cb', fontWeight: 700 }}>
              منظومة موحدة — بيانات واحدة — لا تكرار ولا فقدان للمعلومات
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
