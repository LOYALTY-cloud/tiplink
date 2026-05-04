"use client";

import { useEffect, useRef, useState } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
    } else {
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Sheet */}
      <div
        className={`absolute bottom-0 left-0 right-0 max-h-[90svh] bg-[#0B1220] rounded-t-3xl overflow-y-auto transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        onTouchStart={(e) => {
          startYRef.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          if (startYRef.current === null) return;
          const delta = e.changedTouches[0].clientY - startYRef.current;
          startYRef.current = null;
          if (delta > 80) onClose();
        }}
      >
        {/* Drag handle */}
        <div className="sticky top-0 pt-3 pb-1 flex justify-center bg-[#0B1220]">
          <div className="w-10 h-1.5 bg-white/25 rounded-full" />
        </div>

        <div className="px-4 pb-8">{children}</div>
      </div>
    </div>
  );
}
