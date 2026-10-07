export default function Slide02SystemOverview() {
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
          مخطط المنظومة الشاملة
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

      {/* Content area */}
      <div
        className="absolute flex flex-col items-center justify-center"
        style={{ top: '12.5vh', bottom: 0, left: 0, right: 0, padding: '3vh 5vw' }}
      >
        {/* Subtitle */}
        <p
          style={{
            fontFamily: "'Tajawal', sans-serif",
            fontSize: '2vw',
            color: '#64748b',
            marginBottom: '4vh',
            fontWeight: 400,
          }}
        >
          ست وحدات متكاملة تعمل معاً لإدارة عمليات الشركة بالكامل
        </p>

        {/* Row 1: 3 boxes */}
        <div
          className="flex items-center justify-center"
          style={{ marginBottom: '2.5vh', gap: '0' }}
        >
          {/* Box 1: الورشة */}
          <div
            className="flex flex-col items-center justify-center text-center"
            style={{
              width: '22vw',
              height: '18vh',
              backgroundColor: '#103c68',
              borderRadius: '0.8vw',
              padding: '2vh 1.5vw',
            }}
          >
            <div
              style={{
                width: '3vw',
                height: '3vw',
                backgroundColor: '#0eb5cb',
                borderRadius: '50%',
                marginBottom: '1.2vh',
              }}
            />
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.2vw', color: '#ffffff', marginBottom: '0.5vh' }}>
              الورشة
            </p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: 'rgba(255,255,255,0.7)' }}>
              كروت الصيانة والأعطال
            </p>
          </div>

          {/* Arrow 1 */}
          <div className="flex items-center" style={{ width: '5vw', justifyContent: 'center' }}>
            <div style={{ width: '3vw', height: '0.3vh', backgroundColor: '#103c68' }} />
            <div style={{
              width: 0, height: 0,
              borderTop: '1vh solid transparent',
              borderBottom: '1vh solid transparent',
              borderRight: '1.5vh solid #103c68',
            }} />
          </div>

          {/* Box 2: الأسطول */}
          <div
            className="flex flex-col items-center justify-center text-center"
            style={{
              width: '22vw',
              height: '18vh',
              backgroundColor: '#0d8fa0',
              borderRadius: '0.8vw',
              padding: '2vh 1.5vw',
            }}
          >
            <div
              style={{
                width: '3vw',
                height: '3vw',
                backgroundColor: '#ffffff',
                borderRadius: '50%',
                marginBottom: '1.2vh',
              }}
            />
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.2vw', color: '#ffffff', marginBottom: '0.5vh' }}>
              الأسطول
            </p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: 'rgba(255,255,255,0.85)' }}>
              السيارات والتيدرات والسائقون
            </p>
          </div>

          {/* Arrow 2 */}
          <div className="flex items-center" style={{ width: '5vw', justifyContent: 'center' }}>
            <div style={{ width: '3vw', height: '0.3vh', backgroundColor: '#103c68' }} />
            <div style={{
              width: 0, height: 0,
              borderTop: '1vh solid transparent',
              borderBottom: '1vh solid transparent',
              borderRight: '1.5vh solid #103c68',
            }} />
          </div>

          {/* Box 3: الرحلات */}
          <div
            className="flex flex-col items-center justify-center text-center"
            style={{
              width: '22vw',
              height: '18vh',
              backgroundColor: '#103c68',
              borderRadius: '0.8vw',
              padding: '2vh 1.5vw',
            }}
          >
            <div
              style={{
                width: '3vw',
                height: '3vw',
                backgroundColor: '#0eb5cb',
                borderRadius: '50%',
                marginBottom: '1.2vh',
              }}
            />
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.2vw', color: '#ffffff', marginBottom: '0.5vh' }}>
              الرحلات
            </p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: 'rgba(255,255,255,0.7)' }}>
              طلبات التوصيل والحركة
            </p>
          </div>
        </div>

        {/* Down arrow (right side → left side for RTL) */}
        <div
          className="flex justify-end"
          style={{ width: '84vw', marginBottom: '0.5vh' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: '11vw' }}>
            <div style={{ width: '0.3vh', height: '3vh', backgroundColor: '#64748b' }} />
            <div style={{
              width: 0, height: 0,
              borderLeft: '1vw solid transparent',
              borderRight: '1vw solid transparent',
              borderTop: '1.5vh solid #64748b',
            }} />
          </div>
        </div>

        {/* Row 2: 3 boxes (reversed order for RTL zigzag) */}
        <div
          className="flex items-center justify-center"
          style={{ gap: '0' }}
        >
          {/* Box 4: مخزون الورشة */}
          <div
            className="flex flex-col items-center justify-center text-center"
            style={{
              width: '22vw',
              height: '18vh',
              backgroundColor: '#0d8fa0',
              borderRadius: '0.8vw',
              padding: '2vh 1.5vw',
            }}
          >
            <div
              style={{
                width: '3vw',
                height: '3vw',
                backgroundColor: '#ffffff',
                borderRadius: '50%',
                marginBottom: '1.2vh',
              }}
            />
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.2vw', color: '#ffffff', marginBottom: '0.5vh' }}>
              مخزون الورشة
            </p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: 'rgba(255,255,255,0.85)' }}>
              قطع الغيار والمواد
            </p>
          </div>

          {/* Arrow (reversed) */}
          <div className="flex items-center" style={{ width: '5vw', justifyContent: 'center' }}>
            <div style={{
              width: 0, height: 0,
              borderTop: '1vh solid transparent',
              borderBottom: '1vh solid transparent',
              borderLeft: '1.5vh solid #103c68',
            }} />
            <div style={{ width: '3vw', height: '0.3vh', backgroundColor: '#103c68' }} />
          </div>

          {/* Box 5: المصاريف */}
          <div
            className="flex flex-col items-center justify-center text-center"
            style={{
              width: '22vw',
              height: '18vh',
              backgroundColor: '#103c68',
              borderRadius: '0.8vw',
              padding: '2vh 1.5vw',
            }}
          >
            <div
              style={{
                width: '3vw',
                height: '3vw',
                backgroundColor: '#0eb5cb',
                borderRadius: '50%',
                marginBottom: '1.2vh',
              }}
            />
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.2vw', color: '#ffffff', marginBottom: '0.5vh' }}>
              المصاريف
            </p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: 'rgba(255,255,255,0.7)' }}>
              مصاريف السائقين والتسويات
            </p>
          </div>

          {/* Arrow (reversed) */}
          <div className="flex items-center" style={{ width: '5vw', justifyContent: 'center' }}>
            <div style={{
              width: 0, height: 0,
              borderTop: '1vh solid transparent',
              borderBottom: '1vh solid transparent',
              borderLeft: '1.5vh solid #103c68',
            }} />
            <div style={{ width: '3vw', height: '0.3vh', backgroundColor: '#103c68' }} />
          </div>

          {/* Box 6: العهدة */}
          <div
            className="flex flex-col items-center justify-center text-center"
            style={{
              width: '22vw',
              height: '18vh',
              backgroundColor: '#0d8fa0',
              borderRadius: '0.8vw',
              padding: '2vh 1.5vw',
            }}
          >
            <div
              style={{
                width: '3vw',
                height: '3vw',
                backgroundColor: '#ffffff',
                borderRadius: '50%',
                marginBottom: '1.2vh',
              }}
            />
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.2vw', color: '#ffffff', marginBottom: '0.5vh' }}>
              العهدة والكشوفات
            </p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.5vw', color: 'rgba(255,255,255,0.85)' }}>
              كشوف الاستعاضة والتسويات
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
