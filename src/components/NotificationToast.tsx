"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ToastData {
  title: string;
  body?: string;
  type?: string;
}

const icon = (type?: string) => {
  if (type === "tip") return "💰";
  if (type === "payout") return "🏦";
  return "🔔";
};

export function NotificationToast() {
  const [toast, setToast] = useState<ToastData | null>(null);

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout>;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.title) return;
      clearTimeout(timerId);
      setToast({ title: detail.title, body: detail.body, type: detail.type });
      timerId = setTimeout(() => setToast(null), 4000);
    };

    window.addEventListener("new-notification", handler);
    return () => {
      window.removeEventListener("new-notification", handler);
      clearTimeout(timerId);
    };
  }, []);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed top-20 right-4 z-[9999] bg-[#0B1220] border border-white/[0.12] rounded-xl px-4 py-3 shadow-2xl max-w-sm cursor-pointer"
          onClick={() => setToast(null)}
        >
          <div className="flex items-start gap-3">
            <span className="text-lg">{icon(toast.type)}</span>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{toast.title}</p>
              {toast.body && (
                <p className="text-gray-400 text-xs truncate mt-0.5">{toast.body}</p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
