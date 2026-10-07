export default function Slide09Inventory() {
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
          مخزون الورشة
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
        {/* Left: Description */}
        <div className="flex flex-col justify-center" style={{ width: '42%' }}>
          <div style={{ width: '5vw', height: '0.5vh', backgroundColor: '#0eb5cb', marginBottom: '2.5vh' }} />

          <p
            style={{
              fontFamily: "'Tajawal', sans-serif",
              fontWeight: 700,
              fontSize: '2.2vw',
              color: '#103c68',
              marginBottom: '2vh',
              lineHeight: 1.4,
            }}
          >
            إدارة قطع الغيار ومواد الصيانة
          </p>
          <p
            style={{
              fontFamily: "'Tajawal', sans-serif",
              fontSize: '2vw',
              color: '#64748b',
              lineHeight: 1.6,
              marginBottom: '3vh',
            }}
          >
            كل قطعة تُصرف على كرت صيانة تُخصم تلقائياً من المخزون — لا مجال لأي تسرب
          </p>

          {/* Flow diagram */}
          <div
            style={{
              backgroundColor: '#103c68',
              borderRadius: '0.8vw',
              padding: '2.5vh 2.5vw',
            }}
          >
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#0eb5cb', marginBottom: '2vh' }}>
              دورة حركة المخزون
            </p>
            <div className="flex items-center" style={{ gap: '1vw', marginBottom: '1.5vh' }}>
              <div style={{ backgroundColor: '#0eb5cb', borderRadius: '0.4vw', padding: '0.5vh 1vw' }}>
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#103c68', fontWeight: 700 }}>استلام</p>
              </div>
              <div style={{ flex: 1, height: '0.2vh', backgroundColor: 'rgba(255,255,255,0.3)' }} />
              <div style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '0.4vw', padding: '0.5vh 1vw' }}>
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#ffffff', fontWeight: 700 }}>تخزين</p>
              </div>
              <div style={{ flex: 1, height: '0.2vh', backgroundColor: 'rgba(255,255,255,0.3)' }} />
              <div style={{ backgroundColor: '#0eb5cb', borderRadius: '0.4vw', padding: '0.5vh 1vw' }}>
                <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#103c68', fontWeight: 700 }}>صرف</p>
              </div>
            </div>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: 'rgba(255,255,255,0.65)' }}>
              كل معاملة مرتبطة بكرت صيانة أو مرجع محدد
            </p>
          </div>
        </div>

        {/* Right: Features grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2vh' }}>
          {/* Row 1 */}
          <div className="flex" style={{ gap: '2vw' }}>
            <div
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                borderRadius: '0.8vw',
                padding: '2.5vh 2vw',
                boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.08)',
                borderTop: '0.4vh solid #103c68',
              }}
            >
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.8vh' }}>
                إدارة الأصناف
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>
                رمز الصنف، الاسم، الوحدة، الكمية الحالية، حد الطلب
              </p>
            </div>
            <div
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                borderRadius: '0.8vw',
                padding: '2.5vh 2vw',
                boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.08)',
                borderTop: '0.4vh solid #0eb5cb',
              }}
            >
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.8vh' }}>
                صرف القطع
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>
                الصرف مرتبط برقم كرت الصيانة — سجل تدقيق كامل
              </p>
            </div>
          </div>

          {/* Row 2 */}
          <div className="flex" style={{ gap: '2vw' }}>
            <div
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                borderRadius: '0.8vw',
                padding: '2.5vh 2vw',
                boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.08)',
                borderTop: '0.4vh solid #0eb5cb',
              }}
            >
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.8vh' }}>
                سجل الحركة
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>
                تاريخ كل إضافة أو صرف مع اسم الموظف والمبرر
              </p>
            </div>
            <div
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                borderRadius: '0.8vw',
                padding: '2.5vh 2vw',
                boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.08)',
                borderTop: '0.4vh solid #103c68',
              }}
            >
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.8vh' }}>
                تقارير المخزون
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>
                الأصناف الأكثر استهلاكاً، القيمة الإجمالية، مستوى المخزون
              </p>
            </div>
          </div>

          {/* Row 3 */}
          <div className="flex" style={{ gap: '2vw' }}>
            <div
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                borderRadius: '0.8vw',
                padding: '2.5vh 2vw',
                boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.08)',
                borderTop: '0.4vh solid #103c68',
              }}
            >
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.8vh' }}>
                تنبيهات النقص
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>
                تنبيه تلقائي عند وصول الصنف لحد الطلب الأدنى
              </p>
            </div>
            <div
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                borderRadius: '0.8vw',
                padding: '2.5vh 2vw',
                boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.08)',
                borderTop: '0.4vh solid #0eb5cb',
              }}
            >
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.8vh' }}>
                ربط بالمشتريات
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>
                تسجيل مشتريات الورشة مع إضافتها للمخزون مباشرة
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
