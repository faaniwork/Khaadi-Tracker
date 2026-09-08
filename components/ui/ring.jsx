export function Ring({ pct = 0, size = 56, label, sub, color = "var(--primary)" }) {
  const p = Math.max(0, Math.min(100, pct));
  const bg = `conic-gradient(${color} ${p * 3.6}deg, var(--muted) 0deg)`;
  return (
    <div className="ring-chart" style={{ width: size, height: size, background: bg }}>
      <span
        className="f-mono font-bold text-foreground"
        style={{ fontSize: size * 0.24 }}
      >
        {label != null ? label : Math.round(p) + "%"}
      </span>
      {sub ? (
        <span
          className="absolute f-mono text-muted-foreground whitespace-nowrap"
          style={{ bottom: -(size * 0.28), fontSize: size * 0.16 }}
        >
          {sub}
        </span>
      ) : null}
    </div>
  );
}
