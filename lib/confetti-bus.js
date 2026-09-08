// Tiny pub/sub so any component can trigger a confetti burst without prop drilling.
const target = typeof window !== "undefined" ? new EventTarget() : null;

export function burstConfetti(x, y, count) {
  if (!target) return;
  target.dispatchEvent(new CustomEvent("burst", { detail: { x, y, count } }));
}

export function onConfettiBurst(handler) {
  if (!target) return () => {};
  const listener = (e) => handler(e.detail);
  target.addEventListener("burst", listener);
  return () => target.removeEventListener("burst", listener);
}
