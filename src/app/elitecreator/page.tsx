import Hero from "./components/Hero";
import InteractionScene from "./components/InteractionScene";
import ThemeFeed from "./components/ThemeFeed";
import EarningsFlow from "./components/EarningsFlow";
import EliteAccess from "./components/EliteAccess";
import ApplicationForm from "./components/ApplicationForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Elite Creator - 1NELINK",
  description: "Join the elite creators program and monetize your audience.",
};

export default function EliteCreatorPage() {
  return (
    <main className="bg-black text-white overflow-x-hidden">
      <Hero />

      {/* 🔥 INTERACTIVE THEME CAROUSEL - ENGAGEMENT ENGINE */}
      <InteractionScene />

      {/* 🎬 VERTICAL SCROLL FEED */}
      <ThemeFeed />

      <EarningsFlow />
      <EliteAccess />
      <ApplicationForm />
    </main>
  );
}
