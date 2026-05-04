"use client";

export default function EarningsFlow() {
  return (
    <section className="py-20 px-4 bg-black">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-white mb-12 text-center">
          Your Earnings Flow
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            { label: "Create", desc: "Build your custom theme" },
            { label: "Earn", desc: "Receive tips and sales" },
            { label: "Withdraw", desc: "Get paid instantly" },
          ].map((step, i) => (
            <div key={i} className="text-center">
              <div className="text-4xl font-bold text-cyan-400 mb-2">{i + 1}</div>
              <h3 className="font-semibold text-white mb-1">{step.label}</h3>
              <p className="text-white/60 text-sm">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
