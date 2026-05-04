"use client";

export default function EliteAccess() {
  return (
    <section className="py-20 px-4 bg-gradient-to-b from-black to-purple-950/20">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-12 text-center">
          Elite Creator Features
        </h2>
        <div className="space-y-4">
          {[
            "💎 Unlimited custom themes",
            "🎨 Full design control",
            "💰 Higher tip amounts",
            "📊 Advanced analytics",
            "⚡ Priority support",
            "🌍 Global reach",
          ].map((feature, i) => (
            <div key={i} className="p-4 rounded-lg bg-white/5 border border-white/10 text-white">
              {feature}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
