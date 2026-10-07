export default function Slide03Workshop() {
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
          وحدة الورشة
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
        style={{ top: '12.5vh', bottom: 0, left: 0, right: 0, padding: '4vh 6vw', gap: '4vw' }}
      >
        {/* Left column: Description */}
        <div
          className="flex flex-col justify-center"
          style={{ width: '42%' }}
        >
          {/* Teal top accent */}
          <div style={{ width: '5vw', height: '0.5vh', backgroundColor: '#0eb5cb', marginBottom: '2.5vh' }} />

          <p
            style={{
              fontFamily: "'Tajawal', sans-serif",
              fontWeight: 700,
              fontSize: '2.2vw',
              color: '#103c68',
              marginBottom: '2vh',
              lineHeight: 1.4,
              textWrap: 'balance',
            }}
          >
            نظام متكامل لإدارة صيانة المركبات والتيدرات
          </p>
          <p
            style={{
              fontFamily: "'Tajawal', sans-serif",
              fontWeight: 400,
              fontSize: '2vw',
              color: '#64748b',
              lineHeight: 1.6,
              textWrap: 'pretty',
            }}
          >
            تسجيل الأعطال وإصدار كروت الصيانة وتتبع كل قطعة مصروفة من المخزون حتى إغلاق الكرت
          </p>

          {/* Stat box */}
          <div
            style={{
              marginTop: '4vh',
              backgroundColor: '#103c68',
              borderRadius: '0.8vw',
              padding: '2vh 2vw',
            }}
          >
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '4.5vw', color: '#0eb5cb', lineHeight: 1 }}>
              100%
            </p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: 'rgba(255,255,255,0.8)', marginTop: '0.5vh' }}>
              رقمنة عمليات الصيانة
            </p>
          </div>
        </div>

        {/* Right column: Feature cards */}
        <div
          className="flex flex-col justify-center"
          style={{ flex: 1, gap: '2vh' }}
        >
          {/* Feature 1 */}
          <div
            className="flex items-center"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.8vw',
              padding: '2vh 2vw',
              borderRight: '0.5vw solid #103c68',
              boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.08)',
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.5vh' }}>
                تسجيل الأعطال
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>
                ربط كل عطل بالسيارة أو التيدر المعني مع وصف تفصيلي
              </p>
            </div>
          </div>

          {/* Feature 2 */}
          <div
            className="flex items-center"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.8vw',
              padding: '2vh 2vw',
              borderRight: '0.5vw solid #0eb5cb',
              boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.08)',
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.5vh' }}>
                إصدار كرت الصيانة
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>
                رقم تسلسلي تلقائي، اسم الفني، القطع المصروفة، التواريخ
              </p>
            </div>
          </div>

          {/* Feature 3 */}
          <div
            className="flex items-center"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.8vw',
              padding: '2vh 2vw',
              borderRight: '0.5vw solid #103c68',
              boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.08)',
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.5vh' }}>
                خصم المواد من المخزون
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>
                كل قطعة تُصرف تُخصم تلقائياً من مخزون الورشة فور تسجيلها
              </p>
            </div>
          </div>

          {/* Feature 4 */}
          <div
            className="flex items-center"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.8vw',
              padding: '2vh 2vw',
              borderRight: '0.5vw solid #0eb5cb',
              boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.08)',
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.5vh' }}>
                تقارير الصيانة
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>
                سجل كامل بكل أعمال الصيانة لكل مركبة طوال فترة تشغيلها
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
