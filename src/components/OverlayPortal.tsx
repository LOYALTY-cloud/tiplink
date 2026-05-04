"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

export function OverlayPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const el = document.getElementById("overlay-root");
  if (!el) return null;

  return createPortal(children, el);
}
