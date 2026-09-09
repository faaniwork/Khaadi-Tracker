/**
 * The Khaadi Tracker wordmark.
 *
 * Two files rather than one, because the supplied artwork is an orange cloud
 * behind a black wordmark: the black disappears against the dark theme, so
 * the dark copy carries the same cloud with the wordmark lifted to near-white.
 * Both have had the white background knocked out, so neither shows a slab.
 *
 * Swapping by CSS rather than by JS keeps it correct on the very first paint,
 * with no flash of the wrong one while React hydrates.
 */
export function Logo({ width = 132, className = "" }) {
  const style = { width, height: "auto" };
  return (
    <span className={`inline-block shrink-0 ${className}`} style={{ width }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/khaadi-tracker-logo.png"
        alt="Khaadi Tracker"
        style={style}
        className="block dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/khaadi-tracker-logo-dark.png"
        alt=""
        aria-hidden="true"
        style={style}
        className="hidden dark:block"
      />
    </span>
  );
}
