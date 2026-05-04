"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  alpha: number;
  twinkleOffset: number;
}

interface Props {
  image?: string;
  speed?: number;
}

export default function ParticlesSoftBackground({ image, speed = 5 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let frameId = 0;
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    const density = 78;
    const speedScale = 0.35 + speed * 0.06;

    const createParticles = () => {
      particles = Array.from({ length: density }, () => {
        const depth = Math.random();
        const drift = (0.05 + depth * 0.22) * speedScale;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          radius: 0.9 + depth * 2.4,
          vx: (Math.random() - 0.5) * drift,
          vy: -(0.12 + depth * 0.3) * speedScale,
          alpha: 0.18 + depth * 0.5,
          twinkleOffset: Math.random() * Math.PI * 2,
        };
      });
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      createParticles();
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);

      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < -particle.radius * 2) particle.x = width + particle.radius * 2;
        if (particle.x > width + particle.radius * 2) particle.x = -particle.radius * 2;
        if (particle.y < -particle.radius * 2) {
          particle.y = height + particle.radius * 2;
          particle.x = Math.random() * width;
        }

        const twinkle = 0.72 + Math.sin(time * 0.001 + particle.twinkleOffset) * 0.28;
        const alpha = Math.max(0.08, particle.alpha * twinkle);

        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.shadowBlur = 16 + particle.radius * 6;
        context.shadowColor = `rgba(255,255,255,${Math.min(alpha + 0.15, 0.9)})`;
        context.fillStyle = `rgba(255,255,255,${alpha})`;
        context.fill();
      }

      frameId = requestAnimationFrame(draw);
    };

    resize();
    frameId = requestAnimationFrame(draw);

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [speed]);

  const backgroundStyle: React.CSSProperties = image
    ? {
        backgroundImage: `url(${image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: "linear-gradient(135deg, #121828 0%, #18253e 42%, #0e3656 100%)",
      };

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute inset-0" style={backgroundStyle} />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 mix-blend-screen opacity-95"
      />
      <div className="absolute inset-0 bg-black/15" />
    </div>
  );
}