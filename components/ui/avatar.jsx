/**
 * Someone's picture, falling back to their initials.
 *
 * Initials are derived from the display name rather than the email, and the
 * background colour is derived from the name too, so the same person is
 * always the same colour and two people in a list are tellable apart at a
 * glance. It is a hue rotation, not a random pick, so it stays stable across
 * reloads and between users.
 */
function initialsFor(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hueFor(name) {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({ name, avatar, size = 28, className = "" }) {
  const px = { width: size, height: size };
  if (avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatar}
        alt={name || "Profile picture"}
        style={px}
        className={`rounded-full object-cover shrink-0 border border-border ${className}`}
      />
    );
  }
  const hue = hueFor(name);
  return (
    <span
      aria-hidden="true"
      title={name || undefined}
      style={{
        ...px,
        background: `oklch(0.92 0.05 ${hue})`,
        color: `oklch(0.42 0.14 ${hue})`,
        fontSize: Math.max(9, Math.round(size * 0.36)),
      }}
      className={`rounded-full grid place-items-center f-mono font-bold shrink-0 ${className}`}
    >
      {initialsFor(name)}
    </span>
  );
}
