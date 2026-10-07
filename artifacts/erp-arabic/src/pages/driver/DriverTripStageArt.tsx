import "./driver-trip-stage-art.css";

type Stage = "loading" | "camera" | "unloading";

/** Decorative animation only; the surrounding control owns the accessible label and action. */
export default function DriverTripStageArt({ stage }: { stage: Stage }) {
  if (stage === "camera") {
    return (
      <svg className="driver-stage-art" viewBox="0 0 320 130" aria-hidden="true" focusable="false">
        <ellipse cx="160" cy="115" rx="92" ry="7" fill="#94a3b8" opacity=".16" />
        <g className="driver-stage-camera">
          <rect x="76" y="37" width="168" height="81" rx="16" fill="#0f766e" />
          <rect x="95" y="23" width="59" height="22" rx="6" fill="#115e59" />
          <rect x="90" y="49" width="140" height="56" rx="10" fill="#134e4a" />
          <circle cx="161" cy="77" r="32" fill="#99f6e4" />
          <circle cx="161" cy="77" r="25" fill="#0f766e" />
          <circle cx="161" cy="77" r="17" fill="#042f2e" />
          <circle cx="154" cy="69" r="7" fill="#ccfbf1" opacity=".8" />
          <circle cx="217" cy="58" r="5" fill="#fbbf24" />
          <rect x="103" y="30" width="40" height="8" rx="4" fill="#5eead4" />
        </g>
        <circle className="driver-stage-focus" cx="161" cy="77" r="40" fill="none" stroke="#5eead4" strokeWidth="3" strokeDasharray="7 8" />
        <circle className="driver-stage-flash" cx="217" cy="58" r="18" fill="#fff" />
        <path d="M48 46h15m-7-7v14M259 37h14m-7-7v14M268 92h12m-6-6v12" stroke="#5eead4" strokeWidth="3" strokeLinecap="round" opacity=".8" />
      </svg>
    );
  }

  return (
    <svg className="driver-stage-art" viewBox="0 0 320 130" aria-hidden="true" focusable="false">
      <ellipse cx="160" cy="118" rx="139" ry="7" fill="#64748b" opacity=".16" />
      <path d="M25 113h270" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
      <g className="driver-stage-truck">
        <rect x="48" y="63" width="147" height="40" rx="6" fill="#0f766e" />
        <path d="M195 74h38l24 20v9h-62z" fill="#0891b2" />
        <path d="M207 78h22l14 13h-36z" fill="#cffafe" />
        <path d="M62 57h105l25 31H59z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
        <path d="M65 61h94l19 23H65z" fill="#f8fafc" />
        <path d="M63 90h126" stroke="#5eead4" strokeWidth="4" />
        <circle cx="88" cy="104" r="13" fill="#1e293b" />
        <circle cx="88" cy="104" r="6" fill="#cbd5e1" />
        <circle cx="216" cy="104" r="13" fill="#1e293b" />
        <circle cx="216" cy="104" r="6" fill="#cbd5e1" />
      </g>
      {stage === "loading" ? (
        <>
          <path d="M104 13h75v10h-54v27" fill="none" stroke="#475569" strokeWidth="8" strokeLinejoin="round" />
          <path d="M112 51h27l-5 9h-17z" fill="#64748b" />
          <g className="driver-stage-grain" fill="#e9b95c">
            <circle cx="122" cy="66" r="3" /><circle cx="131" cy="72" r="2.5" />
            <circle cx="123" cy="78" r="2" /><circle cx="134" cy="84" r="2" />
          </g>
          <path d="M38 111h16m210 0h18" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <g className="driver-stage-worker driver-stage-worker-near" style={{ animationDelay: "-.8s" }}>
            <circle cx="32" cy="69" r="8" fill="#fbbf24" />
            <path d="M23 66q9-16 18 0z" fill="#f97316" />
            <path d="M25 79h14l3 23H22z" fill="#0891b2" />
            <path d="M26 103l-2 12m14-12 3 12" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
            <path d="M38 83l16-8" stroke="#dba46a" strokeWidth="4" strokeLinecap="round" />
          </g>
          <g className="driver-stage-worker">
            <circle cx="275" cy="61" r="10" fill="#fbbf24" />
            <path d="M264 58q11-18 22 0z" fill="#f97316" />
            <path d="M268 73h15l4 29h-23z" fill="#0f766e" />
            <path d="M270 103l-3 12m13-12 4 12" stroke="#334155" strokeWidth="5" strokeLinecap="round" />
            <path d="M270 79l-19-8" stroke="#dba46a" strokeWidth="5" strokeLinecap="round" />
          </g>
          <g className="driver-stage-sack">
            <path d="M252 66q-15-7-23 4l5 23q12 10 22 0z" fill="#f8e1ad" stroke="#c69851" strokeWidth="2" />
            <path d="M237 72h12m-10 5h9" stroke="#c69851" strokeWidth="2" />
          </g>
          <g className="driver-stage-cement" fill="#e9b95c">
            <circle cx="239" cy="96" r="2.5" /><circle cx="246" cy="102" r="2" />
            <circle cx="234" cy="106" r="2" />
          </g>
          <path d="M242 114h26" stroke="#d6b276" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}