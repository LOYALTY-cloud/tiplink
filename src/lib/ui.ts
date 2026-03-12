export const ui = {
  // page background container
  page:
    "min-h-screen bg-[color:var(--bg0)] text-[color:var(--text)] relative overflow-hidden",

  // glow blobs
  glowWrap: "pointer-events-none absolute inset-0 overflow-hidden",
  glow1:
    "absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-blue-600/20 blur-[120px]",
  glow2:
    "absolute top-10 -right-40 h-[520px] w-[520px] rounded-full bg-indigo-500/20 blur-[120px]",
  glow3:
    "absolute bottom-[-220px] left-1/2 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-[140px]",
  topLine:
    "absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500/70 to-transparent opacity-70",

  // glass card
  card:
    "rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.55)]",
  cardInner:
    "rounded-xl bg-white/5 border border-white/10 backdrop-blur-xl",

  // text
  h1: "text-3xl md:text-4xl font-semibold tracking-tight",
  h2: "text-xl md:text-2xl font-semibold",
  muted: "text-white/65",
  muted2: "text-white/45",

  // buttons
  btnPrimary:
    "rounded-xl px-4 py-3 font-semibold text-white bg-gradient-to-b from-blue-500 to-blue-700 shadow-[0_10px_30px_rgba(59,130,246,0.35)] hover:from-blue-400 hover:to-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed",
  btnGhost:
    "rounded-xl px-4 py-3 font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/10 transition",
  btnSmall:
    "rounded-lg px-3 py-2 text-sm font-semibold",

  // inputs
  input:
    "w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-blue-400/40 focus:ring-2 focus:ring-blue-500/15 transition",

  // chips / pills
  chip:
    "inline-flex items-center rounded-full bg-white/7 border border-white/10 px-3 py-1 text-xs font-semibold text-white/80",

  // nav active tab
  navActive:
    "rounded-xl bg-blue-500/15 border border-blue-400/30 text-blue-200 shadow-[0_8px_24px_rgba(59,130,246,0.25)]",
  navIdle:
    "rounded-xl text-white/70 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition",
};

export default ui;
