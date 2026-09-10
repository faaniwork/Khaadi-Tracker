"use client";

export function MascotSVG({ mood }) {
  const eyes =
    mood === "sleepy" ? (
      <>
        <path d="M23 30 q4 -4 8 0" stroke="var(--mascot-ink)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M37 30 q4 -4 8 0" stroke="var(--mascot-ink)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx="27" cy="30" r="4.2" fill="var(--mascot-ink)" />
        <circle cx="41" cy="30" r="4.2" fill="var(--mascot-ink)" />
        <circle cx="28.4" cy="28.6" r="1.3" fill="#fff" />
        <circle cx="42.4" cy="28.6" r="1.3" fill="#fff" />
      </>
    );
  const mouth =
    mood === "sleepy" ? (
      <line x1="30" y1="41" x2="38" y2="41" stroke="var(--mascot-ink)" strokeWidth="2.2" strokeLinecap="round" />
    ) : mood === "hype" ? (
      <>
        <ellipse cx="34" cy="42" rx="6" ry="5" fill="var(--mascot-ink)" />
        <ellipse cx="34" cy="40" rx="5" ry="2.4" fill="#fff" />
      </>
    ) : (
      <path d="M27 39 q7 8 14 0" stroke="var(--mascot-ink)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    );
  const extras =
    mood === "sleepy" ? (
      <>
        <text x="46" y="18" fontSize="9" fill="var(--muted-foreground)" fontWeight="700">z</text>
        <text x="52" y="10" fontSize="6" fill="var(--muted-foreground)" fontWeight="700">z</text>
      </>
    ) : mood === "hype" ? (
      <>
        <path d="M10 14 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="var(--good)" />
        <path d="M54 46 l1.6 4 4 1.6 -4 1.6 -1.6 4 -1.6 -4 -4 -1.6 4 -1.6z" fill="var(--info)" />
      </>
    ) : null;
  return (
    <svg viewBox="0 0 64 64" className="mascot-svg">
      <defs>
        <linearGradient id="mascotGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--mascot-from)" />
          <stop offset="1" stopColor="var(--mascot-to)" />
        </linearGradient>
      </defs>
      <ellipse cx="34" cy="36" rx="19" ry="21" fill="url(#mascotGrad)" />
      <path d="M20 20 l-8 -10" stroke="var(--mascot-from)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="11" cy="9" r="3" fill="var(--mascot-to)" />
      <path d="M17 46 q-8 3 -11 10" stroke="var(--mascot-ink)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M51 46 q8 3 11 10" stroke="var(--mascot-ink)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {eyes}
      {mouth}
      {extras}
    </svg>
  );
}

export function MascotRider({ mood, message, active, onClick, leftPct }) {
  // The bubble is centred on the mascot by default, which overflows off a
  // narrow screen the moment the mascot itself sits near either end of its
  // track (a real, reproduced bug: at low progress the mascot clamps toward
  // the left edge, and a 172px bubble centred on a point that close to the
  // edge spills straight off a phone's viewport). Past roughly a fifth of
  // the way in from either edge, the bubble anchors from that edge of the
  // mascot instead of straddling it - see the align-start/align-end rules
  // in globals.css, which move the little pointer triangle to match.
  const align = leftPct < 22 ? "align-start" : leftPct > 78 ? "align-end" : "";
  return (
    <div
      className={`mascot-rider${active ? " is-active" : ""}`}
      style={{ left: `${leftPct}%` }}
    >
      <div className={`mascot-bubble ${align}${active ? " is-shown" : ""}`}>{message}</div>
      <button
        type="button"
        className="mascot-btn"
        aria-label="Cheer on the team"
        title="Give the team a cheer"
        onClick={onClick}
      >
        <MascotSVG mood={mood} />
      </button>
    </div>
  );
}
