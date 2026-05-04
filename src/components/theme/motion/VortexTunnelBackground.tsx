"use client";

import { useEffect, useMemo, useRef } from "react";

interface Props {
  image?: string;
  images?: string[];
  speed?: number;
  vortexStyle?: "slow" | "fast" | "falling";
}

export default function VortexTunnelBackground({ image, images = [], speed = 5, vortexStyle = "slow" }: Props) {
  const layerRefs = useRef<Array<HTMLDivElement | null>>([]);
  const clampedSpeed = Math.min(10, Math.max(1, speed));
  const layerCount = 15;

  const tuning =
    vortexStyle === "fast"
      ? { baseForward: 9.5, spin: 0.48, spiral: 0.09, zoomDiv: 820, resetZ: -5000, nearZ: 620, drift: 14 }
      : vortexStyle === "falling"
      ? { baseForward: 12.5, spin: 0.56, spiral: 0.11, zoomDiv: 760, resetZ: -5600, nearZ: 720, drift: 18 }
      : { baseForward: 6.2, spin: 0.3, spiral: 0.055, zoomDiv: 940, resetZ: -4600, nearZ: 520, drift: 10 };

  const layerConfig = useMemo(() => Array.from({ length: layerCount }), [layerCount]);
  const collageImages = useMemo(() => {
    const merged = [...images, image].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    return Array.from(new Set(merged)).slice(0, 3);
  }, [images, image]);

  useEffect(() => {
    const applyImage = (el: HTMLDivElement, src?: string) => {
      if (src) {
        el.style.background = `center / cover no-repeat url(${src})`;
      } else {
        el.style.background = "linear-gradient(135deg, rgba(255,255,255,0.16), rgba(120,140,255,0.14), rgba(255,90,130,0.12))";
      }
    };

    const pickIndex = () => Math.floor(Math.random() * collageImages.length);

    const items = layerRefs.current
      .map((el, i) => {
        if (!el) return null;
        const sourceIndex = collageImages.length > 0 ? pickIndex() : -1;
        applyImage(el, sourceIndex >= 0 ? collageImages[sourceIndex] : undefined);
        return { el, z: -(i * 320 + 200), index: i, sourceIndex };
      })
      .filter((v): v is { el: HTMLDivElement; z: number; index: number; sourceIndex: number } => v !== null);

    if (items.length === 0) return;

    let raf = 0;
    let angle = 0;

    const forwardStep = tuning.baseForward * (0.62 + clampedSpeed * 0.11);

    const animate = () => {
      angle += tuning.spin * (0.55 + clampedSpeed * 0.08);

      for (const item of items) {
        item.z += forwardStep;

        if (item.z > tuning.nearZ) {
          item.z = tuning.resetZ - Math.random() * 420;
          if (collageImages.length > 0) {
            item.sourceIndex = pickIndex();
            applyImage(item.el, collageImages[item.sourceIndex]);
          }
        }

        const scale = Math.max(0.08, 1 + item.z / tuning.zoomDiv);
        const depthRatio = (item.z - tuning.resetZ) / (tuning.nearZ - tuning.resetZ);
        const opacity = Math.min(0.95, Math.max(0.08, 0.16 + depthRatio));
        const blur = Math.max(0, -item.z / 1900);
        const rotate = angle + item.z * tuning.spiral;

        const driftX = Math.sin(angle * 0.03 + item.index * 0.72) * tuning.drift + (item.z / tuning.nearZ) * 4;
        const driftY = Math.cos(angle * 0.02 + item.index * 0.45) * (tuning.drift * 0.45) + (item.z / tuning.nearZ) * 7;

        item.el.style.transform = `translate(-50%, -50%) translate3d(${driftX}px, ${driftY}px, 0) rotate(${rotate}deg) scale(${scale})`;
        item.el.style.opacity = String(opacity);
        item.el.style.filter = `blur(${blur}px)`;
      }

      raf = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [clampedSpeed, collageImages, tuning]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black [perspective:1200px]" aria-hidden>
      {layerConfig.map((_, i) => (
        <div
          key={`vortex-layer-${i}`}
          ref={(el) => {
            layerRefs.current[i] = el;
          }}
          className="absolute top-1/2 left-1/2"
          style={{
            width: "320px",
            height: "198px",
            transformStyle: "preserve-3d",
            borderRadius: "18px",
            overflow: "hidden",
            opacity: 0.2,
            transform: "translate(-50%, -50%) scale(0.2)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
            background: "linear-gradient(135deg, rgba(255,255,255,0.16), rgba(120,140,255,0.14), rgba(255,90,130,0.12))",
          }}
        />
      ))}

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="h-48 w-48 rounded-full bg-black/95 blur-2xl" />
      </div>

      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
    </div>
  );
}
