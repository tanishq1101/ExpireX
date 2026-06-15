// Pure CSS, perf-gated ambient background (see globals.css .bg-aurora). No JS/WebGL so it
// costs nothing on the main thread; animation auto-disables on mobile / reduced-motion.
export function Background() {
  return <div className="bg-aurora" aria-hidden />;
}
