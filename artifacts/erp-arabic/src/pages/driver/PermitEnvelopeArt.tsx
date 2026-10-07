import "./driver-trip-stage-art.css";

/** Decorative illustration; the link around it names the actual permit. */
export default function PermitEnvelopeArt() {
  return (
    <svg className="driver-permit-art" viewBox="0 0 260 130" aria-hidden="true" focusable="false">
      <ellipse cx="134" cy="120" rx="118" ry="5" fill="#0f766e" opacity=".1" />
      {/* Person presenting the document */}
      <path d="M25 119V93q0-18 25-20h19q25 3 25 21v25z" fill="#0f766e" />
      <path d="M51 76l10 15 10-15" fill="#f8fafc" />
      <path d="M55 91h12l-6 18z" fill="#fbbf24" />
      <rect x="53" y="63" width="16" height="16" rx="6" fill="#e7ad7c" />
      <circle cx="61" cy="45" r="24" fill="#f2bc8c" />
      <path d="M38 46q-2-30 24-30 25 0 23 31l-8-10q-18 3-33-2z" fill="#334155" />
      <circle cx="54" cy="46" r="1.5" fill="#334155" />
      <circle cx="69" cy="46" r="1.5" fill="#334155" />
      <path d="M57 56q5 4 10 0" fill="none" stroke="#b86f55" strokeWidth="2" strokeLinecap="round" />
      <path className="driver-permit-arm" d="M89 91q19-3 32-16l18 5" fill="none" stroke="#e7ad7c" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="driver-permit-arm" cx="139" cy="80" r="7" fill="#e7ad7c" />
      {/* The letter rises from the envelope */}
      <g className="driver-permit-letter">
        <rect x="151" y="35" width="73" height="70" rx="5" fill="#fff" stroke="#99cfc6" strokeWidth="2" />
        <path d="M162 50h39m-39 9h49m-49 9h42" stroke="#a5c8c5" strokeWidth="3" strokeLinecap="round" />
        <circle cx="203" cy="82" r="11" fill="#ccfbf1" stroke="#0f766e" strokeWidth="2" />
        <path d="m198 82 4 4 7-8" fill="none" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <rect x="133" y="66" width="111" height="51" rx="6" fill="#14b8a6" />
      <path d="M135 67l54 34 54-34" fill="#5eead4" stroke="#0d9488" strokeWidth="2" />
      <path d="M135 115l41-32m67 32-41-32" fill="none" stroke="#0d9488" strokeWidth="2" />
      <path className="driver-permit-flap" d="M134 67l55-32 55 32-55 33z" fill="#99f6e4" stroke="#0d9488" strokeWidth="2" />
      <path d="M229 33h13m-6-6v12M113 30h10m-5-5v10" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}