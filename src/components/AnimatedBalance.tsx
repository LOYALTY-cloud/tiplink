"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedBalanceProps {
  value: number;
  /** Duration in ms (default 600) */
  duration?: number;
  className?: string;
}

export default function AnimatedBalance({
  value,
  duration = 600,
  className,
}: AnimatedBalanceProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number>(undefined);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    prevRef.current = value;

    if (start === end) return;

    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (end - start) * eased);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplay(end);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span className={className}>
      ${display.toFixed(2)}
    </span>
  );
}
