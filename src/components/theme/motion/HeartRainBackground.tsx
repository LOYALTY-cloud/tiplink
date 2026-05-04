"use client";

import { useEffect, useRef } from "react";

interface Heart {
  x: number;
  y: number;
  size: number;
  speed: number;
  burstTimer: number;
  vx: number;
}

interface Burst {
  x: number;
  y: number;
  angle: number;
  life: number;
}

type HeartColor = "pink" | "red" | "purple" | "white";

interface Props {
  image?: string;
  speed?: number;
  color?: HeartColor;
}

const HEART_COLORS: Record<HeartColor, { fill: (alpha: number) => string; glow: string }> = {
  pink: {
    fill: (alpha) => `rgba(255, 80, 200, ${alpha})`,
    glow: "#ff4df0",
  },
  red: {
    fill: (alpha) => `rgba(255, 50, 50, ${alpha})`,
    glow: "#ff4d4d",
  },
  purple: {
    fill: (alpha) => `rgba(150, 80, 255, ${alpha})`,
    glow: "#9b4dff",
  },
  white: {
    fill: (alpha) => `rgba(255, 255, 255, ${alpha})`,
    glow: "#ffffff",
  },
};

export default function HeartRainBackground({
  image,
  speed = 5,
  color = "pink",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let frameId = 0;

    const baseCount = 22;
    const speedScale = 0.5 + speed * 0.12;
    const hearts: Heart[] = [];
    const bursts: Burst[] = [];

    const resetHeart = (heart: Heart) => {
      heart.x = Math.random() * width;
      heart.y = Math.random() * height - height;
      heart.size = 12 + Math.random() * 28;
      heart.speed = (0.4 + Math.random() * 1.2) * speedScale;
      heart.burstTimer = Math.random() * 100 + 50;
      heart.vx = (Math.random() - 0.5) * 0.8;
    };

    const makeHearts = () => {
      hearts.length = 0;
      for (let i = 0; i < baseCount; i++) {
        const heart: Heart = {
          x: 0,
          y: 0,
          size: 0,
          speed: 0,
          burstTimer: 0,
          vx: 0,
        };
        resetHeart(heart);
        hearts.push(heart);
      }
    };

    const drawHeart = (x: number, y: number, size: number, alpha = 1) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size / 50, size / 50);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(0, -15, -25, -15, -25, 0);
      ctx.bezierCurveTo(-25, 15, 0, 25, 0, 35);
      ctx.bezierCurveTo(0, 25, 25, 15, 25, 0);
      ctx.bezierCurveTo(25, -15, 0, -15, 0, 0);

      const colors = HEART_COLORS[color];
      ctx.fillStyle = colors.fill(Math.min(0.98, alpha));
      ctx.shadowBlur = 20 + size * 0.5;
      ctx.shadowColor = colors.glow;
      ctx.fill();

      ctx.restore();
    };

    const resize = () => {
      width = Math.max(1, Math.floor(container.offsetWidth));
      height = Math.max(1, Math.floor(container.offsetHeight));
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      makeHearts();
    };

    let lastTime = performance.now();
    const animate = (time: number) => {
      const dt = Math.min((time - lastTime) / 16.6667, 2.2);
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      // Draw background gradient as fallback if no image
      if (!image) {
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, "rgba(20, 10, 30, 0.85)");
        gradient.addColorStop(1, "rgba(40, 15, 50, 0.85)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
      }

      // Update and draw hearts
      for (const h of hearts) {
        h.y += h.speed * dt;
        h.x += h.vx * dt;
        h.burstTimer -= dt;

        if (h.y > height + 50) {
          resetHeart(h);
        }
        if (h.x < -30) h.x = width + 30;
        if (h.x > width + 30) h.x = -30;

        // Draw main heart
        drawHeart(h.x, h.y, h.size, 0.9);

        // Trigger burst
        if (h.burstTimer <= 0) {
          for (let i = 0; i < 8; i++) {
            bursts.push({
              x: h.x,
              y: h.y,
              angle: (Math.PI * 2 * i) / 8,
              life: 35,
            });
          }
          h.burstTimer = Math.random() * 140 + 80;
        }
      }

      // Update and draw burst particles
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i];
        b.x += Math.cos(b.angle) * 2.4 * dt;
        b.y += Math.sin(b.angle) * 2.4 * dt;
        b.life -= dt;

        const alpha = Math.max(0, b.life / 35);
        const scale = 1 - (1 - alpha) * 0.6;
        drawHeart(b.x, b.y, 8 * scale, alpha * 0.8);

        if (b.life <= 0) {
          bursts.splice(i, 1);
        }
      }

      frameId = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      resize();
    };

    resize();
    frameId = requestAnimationFrame(animate);

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frameId);
    };
  }, [image, speed, color]);

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{
          background: image
            ? `url('${image}') center / cover no-repeat`
            : "linear-gradient(135deg, #0a0515 0%, #1a0d32 100%)",
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
      />
    </>
  );
}
