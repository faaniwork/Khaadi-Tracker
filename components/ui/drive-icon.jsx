/**
 * The Google Drive mark, for the links that leave this app and open a folder
 * in Drive itself.
 *
 * Drawn rather than shipped as an image file so it inherits size from a
 * `size-*` class like every lucide icon next to it, stays crisp at any size,
 * and costs no extra request.
 *
 * Three stroked arms, each owning one corner of a triangle and meeting the
 * next at the midpoint of a side, with round caps and joins — which is what
 * produces the soft rounded corners and the seams of the real mark. Colours
 * are Google's own, since a recoloured Drive logo reads as a different
 * product.
 */
export function DriveIcon({ className = "size-4" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="3.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* top corner */}
      <path d="M8.15 11.4 L12 4.2 L15.85 11.4" stroke="#00AC47" />
      {/* bottom-left corner */}
      <path d="M8.15 11.4 L4.3 18.6 L12 18.6" stroke="#4285F4" />
      {/* bottom-right corner */}
      <path d="M12 18.6 L19.7 18.6 L15.85 11.4" stroke="#FFCD00" />
    </svg>
  );
}
