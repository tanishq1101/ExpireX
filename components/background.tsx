// Perf-gated ambient background (see globals.css). Pure CSS — no JS/WebGL, so it costs
// nothing on the main thread. Animations auto-disable on mobile / reduced-motion.
export function Background() {
  return (
    <>
      <div className="bg-aurora" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div
        className="bg-blob left-[-8%] top-[-6%] h-72 w-72 animate-blob bg-emerald-500/40"
        aria-hidden
      />
      <div
        className="bg-blob right-[-10%] top-[12%] h-80 w-80 animate-blob bg-teal-400/30 [animation-delay:-7s]"
        aria-hidden
      />
      <div
        className="bg-blob bottom-[-12%] left-[35%] h-96 w-96 animate-blob bg-green-500/25 [animation-delay:-14s]"
        aria-hidden
      />
    </>
  );
}
