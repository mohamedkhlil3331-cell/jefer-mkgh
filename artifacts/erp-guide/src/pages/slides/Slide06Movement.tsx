export default function Slide06Movement() {
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
          الحركة والرحلات
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
        className="absolute flex flex-col"
        style={{ top: '12.5vh', bottom: 0, left: 0, right: 0, padding: '3vh 6vw' }}
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
          مراحل دورة حياة طلب التوصيل — من الاستلام حتى التسليم
        </p>

        {/* Process stages */}
        <div
          className="flex items-stretch justify-between"
          style={{ flex: 1, gap: '0', marginBottom: '3vh' }}
        >
          {/* Stage 1 */}
          <div
            className="flex flex-col"
            style={{ flex: 1 }}
          >
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{
                backgroundColor: '#103c68',
                borderRadius: '0.8vw 0 0 0.8vw',
                padding: '3vh 1.5vw',
                flex: 1,
              }}
            >
              <div
                style={{
                  width: '4vw',
                  height: '4vw',
                  backgroundColor: '#0eb5cb',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.5vh',
                }}
              >
                <span style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.2vw', color: '#103c68' }}>1</span>
              </div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#ffffff', marginBottom: '1vh' }}>
                استلام الطلب
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                بيانات العميل
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                موقع التوصيل
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                نوع الحمولة
              </p>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center" style={{ padding: '0 0.5vw', zIndex: 1 }}>
            <div style={{
              width: 0, height: 0,
              borderTop: '3vh solid transparent',
              borderBottom: '3vh solid transparent',
              borderRight: '2vw solid #0eb5cb',
            }} />
          </div>

          {/* Stage 2 */}
          <div className="flex flex-col" style={{ flex: 1 }}>
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{
                backgroundColor: '#0d8fa0',
                padding: '3vh 1.5vw',
                flex: 1,
              }}
            >
              <div
                style={{
                  width: '4vw',
                  height: '4vw',
                  backgroundColor: '#ffffff',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.5vh',
                }}
              >
                <span style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.2vw', color: '#0d8fa0' }}>2</span>
              </div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#ffffff', marginBottom: '1vh' }}>
                تجهيز الرحلة
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                تحديد السائق
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                اختيار السيارة
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                ربط التيدر
              </p>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center" style={{ padding: '0 0.5vw', zIndex: 1 }}>
            <div style={{
              width: 0, height: 0,
              borderTop: '3vh solid transparent',
              borderBottom: '3vh solid transparent',
              borderRight: '2vw solid #0eb5cb',
            }} />
          </div>

          {/* Stage 3 */}
          <div className="flex flex-col" style={{ flex: 1 }}>
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{
                backgroundColor: '#103c68',
                padding: '3vh 1.5vw',
                flex: 1,
              }}
            >
              <div
                style={{
                  width: '4vw',
                  height: '4vw',
                  backgroundColor: '#0eb5cb',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.5vh',
                }}
              >
                <span style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.2vw', color: '#103c68' }}>3</span>
              </div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#ffffff', marginBottom: '1vh' }}>
                في الطريق
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                تتبع الموقع
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                تحديثات السائق
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                تسجيل المصاريف
              </p>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center" style={{ padding: '0 0.5vw', zIndex: 1 }}>
            <div style={{
              width: 0, height: 0,
              borderTop: '3vh solid transparent',
              borderBottom: '3vh solid transparent',
              borderRight: '2vw solid #0eb5cb',
            }} />
          </div>

          {/* Stage 4 */}
          <div className="flex flex-col" style={{ flex: 1 }}>
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{
                backgroundColor: '#0d8fa0',
                padding: '3vh 1.5vw',
                flex: 1,
              }}
            >
              <div
                style={{
                  width: '4vw',
                  height: '4vw',
                  backgroundColor: '#ffffff',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.5vh',
                }}
              >
                <span style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.2vw', color: '#0d8fa0' }}>4</span>
              </div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#ffffff', marginBottom: '1vh' }}>
                وصول المستودع
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                تأكيد الوصول
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                تفريغ الحمولة
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5 }}>
                إشعار المستودع
              </p>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center" style={{ padding: '0 0.5vw', zIndex: 1 }}>
            <div style={{
              width: 0, height: 0,
              borderTop: '3vh solid transparent',
              borderBottom: '3vh solid transparent',
              borderRight: '2vw solid #0eb5cb',
            }} />
          </div>

          {/* Stage 5 */}
          <div className="flex flex-col" style={{ flex: 1 }}>
            <div
              className="flex flex-col items-center justify-center text-center"
              style={{
                backgroundColor: '#103c68',
                borderRadius: '0 0.8vw 0.8vw 0',
                padding: '3vh 1.5vw',
                flex: 1,
              }}
            >
              <div
                style={{
                  width: '4vw',
                  height: '4vw',
                  backgroundColor: '#0eb5cb',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.5vh',
                }}
              >
                <span style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.2vw', color: '#103c68' }}>5</span>
              </div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '2vw', color: '#ffffff', marginBottom: '1vh' }}>
                إغلاق الرحلة
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                تسليم عميل
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                تحرير المركبة
              </p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                إقفال المصاريف
              </p>
            </div>
          </div>
        </div>

        {/* Bottom note */}
        <div
          className="flex items-center justify-center"
          style={{
            backgroundColor: '#f8fafc',
            border: '0.15vh solid #e2e8f0',
            borderRadius: '0.6vw',
            padding: '1.5vh 3vw',
          }}
        >
          <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.8vw', color: '#64748b', textAlign: 'center' }}>
            كل مرحلة تُحدَّث في الوقت الفعلي — المشرف، المستودع، والعميل يتابعون الرحلة لحظة بلحظة
          </p>
        </div>
      </div>
    </div>
  );
}
