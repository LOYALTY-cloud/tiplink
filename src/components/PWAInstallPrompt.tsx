"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa_install_dismissed";

export default function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already installed (running in standalone / PWA mode)
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    // Don't show if previously dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(navigator as unknown as { standalone?: boolean }).standalone;

    if (ios) {
      setIsIOS(true);
      setVisible(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed top-4 left-0 right-0 z-50 px-4 pointer-events-none">
      <div className="max-w-lg mx-auto pointer-events-auto">
        <div className="rounded-2xl border border-white/10 bg-[#0f1623]/95 backdrop-blur-xl shadow-2xl p-4 flex items-start gap-3">
          {/* App icon */}
          <div className="shrink-0 w-10 h-10 rounded-xl overflow-hidden shadow-lg">
            <Image src="/icon-192.png" alt="1neLink" width={40} height={40} className="w-full h-full object-cover" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {!showIOSSteps ? (
              <>
                <p className="text-sm font-semibold text-white leading-tight">Install 1neLink</p>
                <p className="text-xs text-white/50 mt-0.5">
                  Add to your home screen for quick access
                </p>

                {isIOS ? (
                  <button
                    onClick={() => setShowIOSSteps(true)}
                    className="mt-2.5 text-xs font-semibold text-violet-400 hover:text-violet-300 transition"
                  >
                    Show me how →
                  </button>
                ) : (
                  <button
                    onClick={install}
                    className="mt-2.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition active:scale-95"
                  >
                    Install App
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-white leading-tight">Add to Home Screen</p>
                <ol className="mt-1.5 space-y-1 text-xs text-white/60">
                  <li>1. Tap the <span className="text-white/80 font-medium">Share</span> button at the bottom of Safari</li>
                  <li>2. Scroll down and tap <span className="text-white/80 font-medium">&ldquo;Add to Home Screen&rdquo;</span></li>
                  <li>3. Tap <span className="text-white/80 font-medium">Add</span> in the top right</li>
                </ol>
              </>
            )}
          </div>

          {/* Dismiss */}
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 text-white/30 hover:text-white/60 transition p-1 -mt-0.5 -mr-1"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
