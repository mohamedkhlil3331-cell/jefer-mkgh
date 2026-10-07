export default function Slide08Settlements() {
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
          مصاريف السائقين والتسويات
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

      {/* Content: 2 columns */}
      <div
        className="absolute flex"
        style={{ top: '12.5vh', bottom: 0, left: 0, right: 0, padding: '4vh 6vw', gap: '4vw' }}
      >
        {/* Left: Expense types */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2.5vh' }}>
          <p
            style={{
              fontFamily: "'Tajawal', sans-serif",
              fontWeight: 700,
              fontSize: '2.2vw',
              color: '#103c68',
              marginBottom: '0.5vh',
            }}
          >
            أنواع مصاريف السائقين
          </p>
          <div style={{ width: '4vw', height: '0.4vh', backgroundColor: '#0eb5cb', marginBottom: '1vh' }} />

          {/* Expense type 1 */}
          <div
            className="flex items-center"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.8vw',
              padding: '2vh 2vw',
              boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.07)',
              gap: '2vw',
            }}
          >
            <div style={{ width: '1vw', height: '5vh', backgroundColor: '#103c68', borderRadius: '0.3vw', flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.4vh' }}>الوقود</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>تسجيل كل وقفة وقود مع الكمية والمبلغ</p>
            </div>
          </div>

          {/* Expense type 2 */}
          <div
            className="flex items-center"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.8vw',
              padding: '2vh 2vw',
              boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.07)',
              gap: '2vw',
            }}
          >
            <div style={{ width: '1vw', height: '5vh', backgroundColor: '#0eb5cb', borderRadius: '0.3vw', flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.4vh' }}>رسوم الطرق</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>رسوم المرور والعبور المرتبطة بكل رحلة</p>
            </div>
          </div>

          {/* Expense type 3 */}
          <div
            className="flex items-center"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.8vw',
              padding: '2vh 2vw',
              boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.07)',
              gap: '2vw',
            }}
          >
            <div style={{ width: '1vw', height: '5vh', backgroundColor: '#103c68', borderRadius: '0.3vw', flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.4vh' }}>صيانة الطوارئ</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>أعطال الطريق والإصلاحات الطارئة</p>
            </div>
          </div>

          {/* Expense type 4 */}
          <div
            className="flex items-center"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.8vw',
              padding: '2vh 2vw',
              boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.07)',
              gap: '2vw',
            }}
          >
            <div style={{ width: '1vw', height: '5vh', backgroundColor: '#0eb5cb', borderRadius: '0.3vw', flexShrink: 0 }} />
            <div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '0.4vh' }}>مصاريف متنوعة</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.7vw', color: '#64748b' }}>إقامة، وجبات، مشتريات الرحلة</p>
            </div>
          </div>
        </div>

        {/* Right: Settlements */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2.5vh' }}>
          <p
            style={{
              fontFamily: "'Tajawal', sans-serif",
              fontWeight: 700,
              fontSize: '2.2vw',
              color: '#103c68',
              marginBottom: '0.5vh',
            }}
          >
            التسويات الإجمالية
          </p>
          <div style={{ width: '4vw', height: '0.4vh', backgroundColor: '#0eb5cb', marginBottom: '1vh' }} />

          {/* Stats row */}
          <div className="flex" style={{ gap: '2vw' }}>
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{
                flex: 1,
                backgroundColor: '#103c68',
                borderRadius: '0.8vw',
                padding: '2.5vh 1.5vw',
              }}
            >
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '3.5vw', color: '#0eb5cb' }}>
                2,000
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.8)', marginTop: '0.5vh' }}>عهدة دائمة (ر.س)</p>
            </div>
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{
                flex: 1,
                backgroundColor: '#0eb5cb',
                borderRadius: '0.8vw',
                padding: '2.5vh 1.5vw',
              }}
            >
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '3.5vw', color: '#ffffff' }}>
                15+
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.9)', marginTop: '0.5vh' }}>سائق في المنظومة</p>
            </div>
          </div>

          {/* Settlement steps */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '0.8vw', padding: '2vh 2.5vw', boxShadow: '0 0.2vh 0.8vh rgba(16,60,104,0.07)' }}>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#103c68', marginBottom: '1.5vh' }}>
              آلية التسوية الشهرية
            </p>
            <div className="flex items-center" style={{ marginBottom: '1.2vh', gap: '1.5vw' }}>
              <div style={{ width: '1.5vw', height: '1.5vw', borderRadius: '50%', backgroundColor: '#103c68', flexShrink: 0 }} />
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744' }}>مراجعة جميع كشوف الاستعاضة</p>
            </div>
            <div className="flex items-center" style={{ marginBottom: '1.2vh', gap: '1.5vw' }}>
              <div style={{ width: '1.5vw', height: '1.5vw', borderRadius: '50%', backgroundColor: '#0eb5cb', flexShrink: 0 }} />
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744' }}>احتساب الرصيد المتبقي لكل سائق</p>
            </div>
            <div className="flex items-center" style={{ marginBottom: '1.2vh', gap: '1.5vw' }}>
              <div style={{ width: '1.5vw', height: '1.5vw', borderRadius: '50%', backgroundColor: '#103c68', flexShrink: 0 }} />
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744' }}>دفع أو خصم الفارق تلقائياً</p>
            </div>
            <div className="flex items-center" style={{ gap: '1.5vw' }}>
              <div style={{ width: '1.5vw', height: '1.5vw', borderRadius: '50%', backgroundColor: '#0eb5cb', flexShrink: 0 }} />
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#0f2744' }}>تقرير التسويات الإجمالية لجميع السائقين</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
