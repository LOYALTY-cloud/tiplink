"use client";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center bg-gradient-to-b from-black to-black/80 px-4">
      <div className="max-w-3xl text-center space-y-6">
        <h1 className="text-5xl md:text-6xl font-bold text-white">
          Become an <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">Elite Creator</span>
        </h1>
        <p className="text-lg text-white/70">
          Turn your presence into income with custom themes, direct tips, and exclusive monetization tools.
        </p>
        <div>
          <button className="px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-400 to-purple-500 text-black font-bold hover:opacity-90 transition">
            Start Creating
          </button>
        </div>
      </div>
    </section>
  );
}
