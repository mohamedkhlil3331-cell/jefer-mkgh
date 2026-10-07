export default function Slide05Transportation() {
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
          النقليات والأسطول
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

      {/* Content: 3 columns */}
      <div
        className="absolute flex"
        style={{ top: '12.5vh', bottom: 0, left: 0, right: 0, padding: '4vh 5vw', gap: '2.5vw' }}
      >
        {/* Column 1: السائقون */}
        <div
          className="flex flex-col"
          style={{
            flex: 1,
            backgroundColor: '#ffffff',
            borderRadius: '1vw',
            overflow: 'hidden',
            boxShadow: '0 0.3vh 1.5vh rgba(16,60,104,0.10)',
          }}
        >
          <div style={{ backgroundColor: '#103c68', padding: '2vh 2.5vw' }}>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.5vw', color: '#ffffff' }}>
              السائقون
            </p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#0eb5cb', marginTop: '0.5vh' }}>
              إدارة ملفات السائقين
            </p>
          </div>
          <div style={{ padding: '2.5vh 2.5vw', flex: 1 }}>
            <div style={{ marginBottom: '2vh', paddingBottom: '2vh', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>الاسم والجوال</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>بيانات التواصل الكاملة لكل سائق</p>
            </div>
            <div style={{ marginBottom: '2vh', paddingBottom: '2vh', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>الوثائق والرخصة</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>تتبع تواريخ انتهاء الرخصة والإقامة</p>
            </div>
            <div style={{ marginBottom: '2vh', paddingBottom: '2vh', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>بوابة السائق</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>تسجيل دخول خاص لكل سائق لتتبع رحلاته</p>
            </div>
            <div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>العهدة والمصاريف</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>تسجيل مصاريف الرحلات وإدارة الاستعاضة</p>
            </div>
          </div>
        </div>

        {/* Column 2: السيارات */}
        <div
          className="flex flex-col"
          style={{
            flex: 1,
            backgroundColor: '#ffffff',
            borderRadius: '1vw',
            overflow: 'hidden',
            boxShadow: '0 0.3vh 1.5vh rgba(16,60,104,0.10)',
          }}
        >
          <div style={{ backgroundColor: '#0eb5cb', padding: '2vh 2.5vw' }}>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.5vw', color: '#ffffff' }}>
              السيارات
            </p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: 'rgba(255,255,255,0.85)', marginTop: '0.5vh' }}>
              إدارة أسطول المركبات
            </p>
          </div>
          <div style={{ padding: '2.5vh 2.5vw', flex: 1 }}>
            <div style={{ marginBottom: '2vh', paddingBottom: '2vh', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>رقم اللوحة والنوع</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>تعريف كامل لكل مركبة مع نوعها وحمولتها</p>
            </div>
            <div style={{ marginBottom: '2vh', paddingBottom: '2vh', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>حالة التشغيل</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>متاح / مشغول / في الصيانة / معطل</p>
            </div>
            <div style={{ marginBottom: '2vh', paddingBottom: '2vh', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>وثائق المركبة</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>تأمين، استمارة، فحص دوري مع تنبيهات الانتهاء</p>
            </div>
            <div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>سجل الصيانة</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>ربط مباشر بكروت الورشة لعرض تاريخ الصيانة</p>
            </div>
          </div>
        </div>

        {/* Column 3: التيدرات */}
        <div
          className="flex flex-col"
          style={{
            flex: 1,
            backgroundColor: '#ffffff',
            borderRadius: '1vw',
            overflow: 'hidden',
            boxShadow: '0 0.3vh 1.5vh rgba(16,60,104,0.10)',
          }}
        >
          <div style={{ backgroundColor: '#103c68', padding: '2vh 2.5vw' }}>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 900, fontSize: '2.5vw', color: '#ffffff' }}>
              التيدرات
            </p>
            <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#0eb5cb', marginTop: '0.5vh' }}>
              إدارة المقطورات والبدنات
            </p>
          </div>
          <div style={{ padding: '2.5vh 2.5vw', flex: 1 }}>
            <div style={{ marginBottom: '2vh', paddingBottom: '2vh', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>رقم التيدر والنوع</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>تعريف التيدر مع نوع الحمولة التي يستوعبها</p>
            </div>
            <div style={{ marginBottom: '2vh', paddingBottom: '2vh', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>الربط بالسيارة</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>تحديد السيارة الجارة لكل تيدر في أي وقت</p>
            </div>
            <div style={{ marginBottom: '2vh', paddingBottom: '2vh', borderBottom: '0.1vh solid #f1f5f9' }}>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>سجل الرحلات</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>تاريخ كل رحلة نُفِّذت بهذا التيدر تحديداً</p>
            </div>
            <div>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: '1.8vw', color: '#103c68', marginBottom: '0.5vh' }}>صيانة التيدر</p>
              <p style={{ fontFamily: "'Tajawal', sans-serif", fontSize: '1.6vw', color: '#64748b' }}>ربط بكروت الورشة الخاصة بالتيدر بشكل منفصل</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
