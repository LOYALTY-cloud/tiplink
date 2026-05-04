"use client";

import { useEffect, useRef } from "react";

interface Props {
  image?: string;
  speed?: number;
  intensity?: "soft" | "medium" | "strong";
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  strength: number;
}

export default function RippleBackground({ image, speed = 5, intensity = "medium" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    if (image) img.src = image;

    let width = 0;
    let height = 0;
    let frameId = 0;
    let pulseTimerId: ReturnType<typeof setInterval> | null = null;
    let isDragging = false;
    let lastSpawnAt = 0;
    let pointerTarget = { x: 0, y: 0 };
    let pointerSmooth = { x: 0, y: 0 };
    const ripples: Ripple[] = [];

    const speedScale = 0.85 + speed * 0.11;
    const intensityMap = {
      soft: {
        pulseMs: Math.max(950, 2200 - speed * 95),
        dragSpawnMs: 42,
        dragStrength: 0.9,
        ambientStrength: 0.45,
        waveBase: 1.35,
      },
      medium: {
        pulseMs: Math.max(760, 1800 - speed * 120),
        dragSpawnMs: 30,
        dragStrength: 1.2,
        ambientStrength: 0.7,
        waveBase: 1.8,
      },
      strong: {
        pulseMs: Math.max(540, 1420 - speed * 135),
        dragSpawnMs: 20,
        dragStrength: 1.55,
        ambientStrength: 1.0,
        waveBase: 2.25,
      },
    } as const;
    const tune = intensityMap[intensity];
    const pulseEveryMs = tune.pulseMs;
    const dragSpawnEveryMs = tune.dragSpawnMs;

    const addRipple = (x: number, y: number, strength = 1) => {
      ripples.push({
        x,
        y,
        radius: 0,
        life: 1,
        maxLife: 1,
        strength,
      });
    };

    const drawImageCover = (offsetX = 0, offsetY = 0, alpha = 1) => {
      if (!image || !img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#081126");
        gradient.addColorStop(1, "#14284a");
        ctx.globalAlpha = alpha;
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
        return;
      }

      const imgRatio = img.naturalWidth / img.naturalHeight;
      const containerRatio = width / height;

      let drawWidth = width;
      let drawHeight = height;
      let drawX = 0;
      let drawY = 0;

      if (imgRatio > containerRatio) {
        drawHeight = height;
        drawWidth = drawHeight * imgRatio;
        drawX = (width - drawWidth) / 2;
      } else {
        drawWidth = width;
        drawHeight = drawWidth / imgRatio;
        drawY = (height - drawHeight) / 2;
      }

      ctx.globalAlpha = alpha;
      ctx.drawImage(img, drawX + offsetX, drawY + offsetY, drawWidth, drawHeight);
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      width = Math.max(1, Math.floor(container.clientWidth));
      height = Math.max(1, Math.floor(container.clientHeight));
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    let lastTime = performance.now();
    const animate = (time: number) => {
      const dt = Math.min((time - lastTime) / 16.6667, 2.2);
      lastTime = time;

      ctx.clearRect(0, 0, width, height);

      const driftX = Math.sin(time * 0.00055) * 1.8;
      const driftY = Math.cos(time * 0.00042) * 1.2;
      drawImageCover(driftX, driftY, 1);

      // Subtle extra liquid pass so the scene feels alive even without interaction.
      drawImageCover(
        Math.sin(time * 0.002) * (2 + tune.waveBase * 0.6),
        Math.cos(time * 0.0017) * (0.9 + tune.waveBase * 0.22),
        0.06 + tune.waveBase * 0.015
      );

      if (isDragging) {
        const smoothing = Math.min(1, 0.22 * dt);
        pointerSmooth.x += (pointerTarget.x - pointerSmooth.x) * smoothing;
        pointerSmooth.y += (pointerTarget.y - pointerSmooth.y) * smoothing;

        if (time - lastSpawnAt >= dragSpawnEveryMs) {
          lastSpawnAt = time;
          addRipple(pointerSmooth.x, pointerSmooth.y, tune.dragStrength);
        }
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const ripple = ripples[i];
        ripple.radius += (2.2 + speedScale * 1.4) * dt;
        ripple.life -= 0.012 * dt;

        const alpha = Math.max(0, ripple.life / ripple.maxLife);
        if (alpha <= 0) {
          ripples.splice(i, 1);
          continue;
        }

        const wave = Math.sin(ripple.radius * 0.12 - time * 0.011) * (tune.waveBase + ripple.strength * 2.2) * alpha;
        const ringThickness = 22 + 16 * alpha;

        ctx.save();
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, Math.max(1, ripple.radius), 0, Math.PI * 2);
        ctx.arc(ripple.x, ripple.y, Math.max(1, ripple.radius - ringThickness), 0, Math.PI * 2, true);
        ctx.clip();

        drawImageCover(driftX + wave, driftY + wave * 0.6, 0.2 * alpha);
        drawImageCover(driftX - wave * 0.7, driftY - wave, 0.13 * alpha);

        ctx.restore();

        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, Math.max(1, ripple.radius), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(220, 235, 255, ${0.25 * alpha})`;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      frameId = requestAnimationFrame(animate);
    };

    const toLocalPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      const point = toLocalPoint(event);
      isDragging = true;
      pointerTarget = point;
      pointerSmooth = point;
      lastSpawnAt = performance.now();
      addRipple(point.x, point.y, tune.dragStrength + 0.05);
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isDragging) return;
      pointerTarget = toLocalPoint(event);
    };

    const stopDragging = () => {
      isDragging = false;
    };

    const onPointerUp = (event: PointerEvent) => {
      stopDragging();
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    resize();
    frameId = requestAnimationFrame(animate);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", stopDragging);
    canvas.addEventListener("pointerleave", stopDragging);

    pulseTimerId = setInterval(() => {
      if (isDragging) return;
      addRipple(Math.random() * width, Math.random() * height, tune.ambientStrength);
    }, pulseEveryMs);

    const observer = new ResizeObserver(resize);
    observer.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", stopDragging);
      canvas.removeEventListener("pointerleave", stopDragging);
      observer.disconnect();
      if (pulseTimerId) clearInterval(pulseTimerId);
    };
  }, [image, speed, intensity]);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />
    </div>
  );
}
