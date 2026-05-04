"use client";

import { useEffect, useRef } from "react";

interface MoneyParticle {
  x: number;
  y: number;
  size: number;
  speed: number;
  rotation: number;
  rotationSpeed: number;
  driftPhase: number;
  driftAmount: number;
  symbol: string;
  alpha: number;
}

interface Props {
  image?: string;
  speed?: number;
}

const SYMBOLS = ["$", "$", "$", "💸", "💵", "💰"];

export default function MoneyRainBackground({ image, speed = 5 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let width = 0;
    let height = 0;
    let frameId = 0;

    const baseCount = 54;
    const speedScale = 0.7 + speed * 0.11;
    let particles: MoneyParticle[] = [];

    const resetParticle = (particle: MoneyParticle, topSpawn = false) => {
      particle.x = Math.random() * width;
      particle.y = topSpawn ? -Math.random() * height * 0.35 : Math.random() * height;
      particle.size = 10 + Math.random() * 30;
      particle.speed = (0.35 + particle.size * 0.045) * speedScale;
      particle.rotation = Math.random() * Math.PI * 2;
      particle.rotationSpeed = (Math.random() - 0.5) * (0.025 + (40 - particle.size) * 0.0005);
      particle.driftPhase = Math.random() * Math.PI * 2;
      particle.driftAmount = 0.25 + Math.random() * 1.6;
      particle.symbol = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
      particle.alpha = 0.25 + particle.size / 52;
    };

    const makeParticles = () => {
      particles = Array.from({ length: baseCount }, () => {
        const particle = {
          x: 0,
          y: 0,
          size: 0,
          speed: 0,
          rotation: 0,
          rotationSpeed: 0,
          driftPhase: 0,
          driftAmount: 0,
          symbol: "$",
          alpha: 0.5,
        };
        resetParticle(particle, false);
        return particle;
      });
    };

    const resize = () => {
      width = Math.max(1, Math.floor(container.offsetWidth));
      height = Math.max(1, Math.floor(container.offsetHeight));
      const ratio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);

      makeParticles();
    };

    let lastTime = performance.now();
    const animate = (time: number) => {
      const dt = Math.min((time - lastTime) / 16.6667, 2.2);
      lastTime = time;

      context.clearRect(0, 0, width, height);

      for (const particle of particles) {
        particle.y += particle.speed * dt;
        particle.rotation += particle.rotationSpeed * dt;
        particle.driftPhase += 0.018 * dt;
        particle.x += Math.sin(particle.driftPhase) * particle.driftAmount * dt;

        if (particle.y > height + particle.size * 1.25) {
          resetParticle(particle, true);
        }
        if (particle.x < -40) particle.x = width + 24;
        if (particle.x > width + 40) particle.x = -24;

        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.font = `${particle.size}px "Trebuchet MS", "Arial Black", sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.globalAlpha = Math.min(0.95, particle.alpha);
        context.shadowBlur = 8 + particle.size * 0.42;
        context.shadowColor = "rgba(255, 205, 92, 0.9)";
        context.fillStyle = "rgba(255, 215, 102, 0.96)";
        context.fillText(particle.symbol, 0, 0);
        context.restore();
      }

      context.globalAlpha = 1;
      context.shadowBlur = 0;
      frameId = requestAnimationFrame(animate);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener("resize", resize);
    frameId = requestAnimationFrame(animate);

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
        background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)",
      };

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div className="absolute inset-0" style={backgroundStyle} />
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div className="absolute inset-0 bg-black/10" />
    </div>
  );
}
