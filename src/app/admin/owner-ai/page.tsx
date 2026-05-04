"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import { ui } from "@/lib/ui";

type ChatMessage = {
  id: string;
  role: "user" | "ai";
  text: string;
  tool?: string | null;
  data?: unknown;
};

const QUICK_PROMPTS = [
  "Show critical alerts",
  "Today summary",
  "Owner approvals",
  "Financial today",
  "Financial last 7 days",
  "Activity for admin admin_123",
];

function formatData(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export default function OwnerAIPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const session = getAdminSession();
    const headers = getAdminHeaders();

    if (!session || !headers.Authorization) {
      router.replace("/admin/login");
      return;
    }

    if (session.role !== "owner") {
      router.replace("/admin");
      return;
    }

    setReady(true);
  }, [router]);

  const emptyState = useMemo(
    () => "Owner-only AI operator. GPT reasons, tools fetch live data, and responses stay structured.",
    [],
  );

  async function sendMessage(nextMessage?: string) {
    const text = (nextMessage ?? input).trim();
    if (!text || loading) return;

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const conversation = [...messages, userMessage].map((message) => ({
        role: message.role === "ai" ? "assistant" as const : "user" as const,
        content: message.text,
      }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ message: text, messages: conversation }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json?.error === "string" ? json.error : "Request failed");
      }

      const aiMessage: ChatMessage = {
        id: `${Date.now()}-ai`,
        role: "ai",
        text: typeof json?.reply === "string" ? json.reply : "No response",
        tool: typeof json?.tool === "string" ? json.tool : null,
        data: json?.data ?? undefined,
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          role: "ai",
          text: message,
          tool: "error",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className={ui.muted}>Loading owner controls...</p>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className={`${ui.card} p-6 md:p-8 overflow-hidden relative`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_32%)]" />
        <div className="relative space-y-4">
          <div className="space-y-2">
            <p className={ui.label}>Owner Control Brain</p>
            <h1 className={ui.h1}>Owner Intelligence</h1>
            <p className={`${ui.muted} max-w-2xl`}>
              {emptyState}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void sendMessage(prompt)}
                className={`${ui.btnGhost} !px-3 !py-2 text-sm`}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.9fr)]">
        <div className={`${ui.card} p-4 md:p-5 space-y-4`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Command Stream</h2>
              <p className={`${ui.muted2} text-sm`}>GPT-guided tool calls with owner-only server execution.</p>
            </div>
            {loading ? <span className={`${ui.chip} text-blue-200`}>Running</span> : null}
          </div>

          <div className="min-h-[420px] max-h-[620px] overflow-y-auto rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full min-h-[340px] flex items-center justify-center text-center px-6">
                <p className={`${ui.muted2} max-w-md text-sm`}>{emptyState}</p>
              </div>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-2xl border p-4 ${message.role === "ai"
                    ? "border-blue-400/20 bg-blue-500/[0.05]"
                    : "border-white/10 bg-white/[0.03]"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${message.role === "ai" ? "text-blue-300" : "text-white/55"}`}>
                      {message.role === "ai" ? "AI Operator" : "Owner"}
                    </span>
                    {message.tool ? <span className={`${ui.chip} !text-[10px]`}>{message.tool}</span> : null}
                  </div>
                  {message.role === "ai" ? (
                    <div className="mt-3 rounded-xl border border-blue-400/20 bg-blue-500/[0.05] p-3">
                      <p className="text-sm leading-6 text-white whitespace-pre-wrap">{message.text}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm leading-6 text-white/90 whitespace-pre-wrap">{message.text}</p>
                  )}
                  {Array.isArray(message.data) && message.data.length > 0 ? (
                    <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/35 p-3 text-xs leading-5 text-white/65">
                      {formatData(message.data)}
                    </pre>
                  ) : null}
                </article>
              ))
            )}
          </div>

          <div className="space-y-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about platform state..."
              className={`${ui.input} min-h-[110px] resize-y`}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-white/40">Owner only. GPT chooses tools. Server stays in control.</p>
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={loading || !input.trim()}
                className={`${ui.btnPrimary} min-w-28`}
              >
                {loading ? "Running..." : "Send"}
              </button>
            </div>
            {error ? <p className="text-sm text-red-300">{error}</p> : null}
          </div>
        </div>

        <aside className="space-y-4">
          <div className={`${ui.card} p-5 space-y-3`}>
            <p className={ui.label}>Active Tools</p>
            <div className="space-y-3 text-sm text-white/80">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-medium text-white">Critical Alerts</p>
                <p className="mt-1 text-white/55">Lists active critical admin notifications that still need attention.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-medium text-white">Today Summary</p>
                <p className="mt-1 text-white/55">Aggregates today&apos;s admin activity by type and severity.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-medium text-white">Admin Activity</p>
                <p className="mt-1 text-white/55">Shows recent log items for a specific admin identifier.</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="font-medium text-white">Owner Approvals</p>
                <p className="mt-1 text-white/55">Surfaces pending refund requests that cannot execute without an owner vote.</p>
              </div>
            </div>
          </div>

          <div className={`${ui.card} p-5 space-y-3`}>
            <p className={ui.label}>Operating Model</p>
            <ul className="space-y-2 text-sm text-white/65">
              <li>GPT decides when live data is needed and calls the right server tool.</li>
              <li>Tools fetch real platform data; the model only formats and reasons over the result.</li>
              <li>If no API key is configured, the page falls back to deterministic routing.</li>
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}