"use client";

import { useState, useCallback } from "react";
import { ui } from "@/lib/ui";
import FraudLiveFeed, { type EscalationAlert } from "@/components/fraud/FraudLiveFeed";
import FraudCases from "@/components/fraud/FraudCases";
import FraudAIAssistant from "@/components/fraud/FraudAIAssistant";

type Tab = "cases" | "live";

const tabs: { key: Tab; label: string; description: string }[] = [
  { key: "cases", label: "Cases", description: "Review & unfreeze frozen accounts" },
  { key: "live", label: "Live Feed", description: "Real-time anomaly detection" },
];

export default function AdminFraudPage() {
  const [activeTab, setActiveTab] = useState<Tab>("cases");
  const [escalationAlert, setEscalationAlert] = useState<EscalationAlert | null>(null);

  const handleEscalation = useCallback((alert: EscalationAlert) => {
    setEscalationAlert(alert);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className={ui.h1}>Fraud Center</h1>
      </div>

      {/* Escalation Alert (shared across tabs) */}
      {escalationAlert && (
        <div className="bg-red-500/15 border border-red-500/40 rounded-xl p-4 flex items-start justify-between gap-3 animate-pulse">
          <div>
            <p className="text-red-400 font-semibold text-sm">{escalationAlert.title}</p>
            <p className="text-xs text-red-300/80 mt-0.5">{escalationAlert.message}</p>
          </div>
          <button
            onClick={() => setEscalationAlert(null)}
            className="text-red-400 hover:text-red-300 text-sm font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-xl transition ${
              activeTab === tab.key ? ui.navActive : ui.navIdle
            }`}
            title={tab.description}
          >
            {tab.key === "cases" ? "📋 " : "📡 "}
            {tab.label}
          </button>
        ))}
      </div>

      {/* AI Assistant (always visible) */}
      <FraudAIAssistant />

      {/* Tab Content */}
      {activeTab === "cases" && <FraudCases />}
      {activeTab === "live" && <FraudLiveFeed onEscalation={handleEscalation} />}
    </div>
  );
}
