const base = import.meta.env.BASE_URL;

export default function Slide01Cover() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" dir="rtl">
      {/* Hero image */}
      <img
        src={`${base}cover-hero.jpg`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover"
        alt=""
      />

      {/* Dark navy gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(110deg, rgba(16,60,104,0.97) 0%, rgba(16,60,104,0.92) 45%, rgba(16,60,104,0.70) 75%, rgba(14,181,203,0.30) 100%)',
        }}
      />

      {/* Right teal accent bar */}
      <div
        className="absolute top-0 bottom-0 left-0"
        style={{ width: '0.7vw', backgroundColor: '#0eb5cb' }}
      />

      {/* Top teal accent bar */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{ height: '0.5vh', backgroundColor: '#0eb5cb' }}
      />

      {/* Logo — top right */}
      <div className="absolute" style={{ top: '3.5vh', right: '5vw' }}>
        <img
          src={`${base}jefer-logo.png`}
          crossOrigin="anonymous"
          style={{ height: '9vh', objectFit: 'contain' }}
          alt="MKGH"
        />
      </div>

      {/* Main content */}
      <div
        className="absolute flex flex-col justify-center"
        style={{ top: 0, bottom: 0, right: '6vw', left: '22vw' }}
      >
        {/* Teal accent bar */}
        <div
          style={{
            width: '7vw',
            height: '0.5vh',
            backgroundColor: '#0eb5cb',
            marginBottom: '2.5vh',
          }}
        />

        {/* Company label */}
        <p
          style={{
            fontFamily: "'Tajawal', sans-serif",
            fontWeight: 700,
            fontSize: '2vw',
            color: '#0eb5cb',
            marginBottom: '2vh',
            letterSpacing: '0.02em',
          }}
        >
          شركة جيفر التجارية — MKGH
        </p>

        {/* Main title — line 1 */}
        <h1
          style={{
            fontFamily: "'Tajawal', sans-serif",
            fontWeight: 900,
            fontSize: '5.8vw',
            color: '#ffffff',
            lineHeight: 1.15,
            marginBottom: '0.5vh',
            textWrap: 'balance',
          }}
        >
          دليل تشغيل
        </h1>
        {/* Main title — line 2 */}
        <h1
          style={{
            fontFamily: "'Tajawal', sans-serif",
            fontWeight: 900,
            fontSize: '5.8vw',
            color: '#ffffff',
            lineHeight: 1.15,
            marginBottom: '3.5vh',
            textWrap: 'balance',
          }}
        >
          منظومة الورشة والنقليات
        </h1>

        {/* Divider */}
        <div
          style={{
            width: '5vw',
            height: '0.3vh',
            backgroundColor: '#0eb5cb',
            marginBottom: '3vh',
          }}
        />

        {/* Author */}
        <p
          style={{
            fontFamily: "'Tajawal', sans-serif",
            fontWeight: 400,
            fontSize: '2.2vw',
            color: 'rgba(255,255,255,0.88)',
            marginBottom: '1vh',
          }}
        >
          إعداد: م. محمد خليل غزالة
        </p>

        {/* Year */}
        <p
          style={{
            fontFamily: "'Tajawal', sans-serif",
            fontWeight: 400,
            fontSize: '1.8vw',
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          2026
        </p>
      </div>
    </div>
  );
}
