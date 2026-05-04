"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  intensity?: number; // 1–10
  speed?: number;     // 1–10
  rainStyle?: "soft" | "storm" | "luxury";
}

export default function LightRainOverlay({ intensity = 5, speed = 5, rainStyle = "soft" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const flashActiveRef = useRef(false);
  const [flashOn, setFlashOn] = useState(false);

  const styleTuning =
    rainStyle === "storm"
      ? { density: 1.55, speed: 1.6, opacity: 1.2, angle: 0.62, tint: "cool", glow: 1.15, splash: 1.4 }
      : rainStyle === "luxury"
      ? { density: 0.8, speed: 0.78, opacity: 0.75, angle: 0.28, tint: "gold", glow: 0.9, splash: 0.85 }
      : { density: 1, speed: 1, opacity: 1, angle: 0.4, tint: "cool", glow: 1, splash: 1 };

  const dropCount = Math.round((40 + (intensity / 10) * 60) * styleTuning.density); // base 40–100
  const speedMult = (0.6 + (speed / 10) * 1.0) * styleTuning.speed; // base 0.6–1.6×
  const opacityScale = (0.08 + (intensity / 10) * 0.2) * styleTuning.opacity; // base 0.08–0.28
  const splashLife = Math.round(14 + (intensity / 10) * 10); // 14–24 frames

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    flashActiveRef.current = flashOn;
  }, [flashOn]);

  useEffect(() => {
    if (rainStyle !== "storm") {
      setFlashOn(false);
      return;
    }

    const timeouts: number[] = [];

    const playSyntheticThunder = () => {
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const now = ctx.currentTime;
      const duration = 1.8 + Math.random() * 1.1;

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.22, now + 0.08);
      master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      master.connect(ctx.destination);

      const oscA = ctx.createOscillator();
      oscA.type = "triangle";
      oscA.frequency.setValueAtTime(64 + Math.random() * 12, now);
      oscA.frequency.exponentialRampToValueAtTime(36, now + duration);

      const oscB = ctx.createOscillator();
      oscB.type = "sawtooth";
      oscB.frequency.setValueAtTime(46 + Math.random() * 10, now);
      oscB.frequency.exponentialRampToValueAtTime(28, now + duration);

      const tonal = ctx.createGain();
      tonal.gain.setValueAtTime(0.45, now);
      tonal.connect(master);
      oscA.connect(tonal);
      oscB.connect(tonal);

      const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * 0.4;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(180, now);
      lowpass.frequency.exponentialRampToValueAtTime(80, now + duration);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noise.connect(lowpass);
      lowpass.connect(noiseGain);
      noiseGain.connect(master);

      oscA.start(now);
      oscB.start(now);
      noise.start(now);

      oscA.stop(now + duration);
      oscB.stop(now + duration);
      noise.stop(now + duration);
    };

    const playThunder = () => {
      playSyntheticThunder();
    };

    const triggerLightning = () => {
      setFlashOn(true);
      timeouts.push(window.setTimeout(() => setFlashOn(false), 380));

      // Occasional second strike for realism before thunder roll.
      if (Math.random() < 0.3) {
        timeouts.push(
          window.setTimeout(() => {
            setFlashOn(true);
            timeouts.push(window.setTimeout(() => setFlashOn(false), 240));
          }, 170 + Math.random() * 120)
        );
      }

      // Flash first, thunder after delay (distance cue).
      const thunderDelay = 300 + Math.random() * 800;
      timeouts.push(window.setTimeout(playThunder, thunderDelay));
    };

    const interval = window.setInterval(() => {
      if (Math.random() < 0.3) triggerLightning();
    }, 4000);

    return () => {
      window.clearInterval(interval);
      for (const id of timeouts) window.clearTimeout(id);
    };
  }, [rainStyle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf: number;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();

    const drops = Array.from({ length: dropCount }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      length: Math.random() * 18 + 8,   // 8–26px thin streaks
      speed: (Math.random() * 3 + 2) * speedMult,
      opacity: Math.random() * opacityScale + 0.04,
    }));

    const splashes: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
    }> = [];

    const createSplash = (x: number) => {
      const count = Math.max(2, Math.round((2 + (intensity / 10) * 3) * styleTuning.splash));
      for (let i = 0; i < count; i += 1) {
        splashes.push({
          x,
          y: canvas.height - 6,
          vx: (Math.random() - 0.5) * 1.8,
          vy: -Math.random() * 1.7 - 0.4,
          life: splashLife,
          maxLife: splashLife,
        });
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drops.forEach((d) => {
        d.y += d.speed;
        d.x += styleTuning.angle; // slight diagonal — premium feel

        if (d.y > canvas.height) {
          createSplash(d.x);
          d.y = -d.length - Math.random() * 40;
          d.x = Math.random() * canvas.width;
        }

        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + 1.5, d.y + d.length);

        const flashBoost = flashActiveRef.current ? 0.94 : null;
        const dropColor =
          flashBoost !== null
            ? `rgba(255,255,255,${flashBoost})`
            : styleTuning.tint === "gold"
            ? `rgba(255,236,190,${Math.min(0.32, d.opacity)})`
            : `rgba(255,255,255,${d.opacity})`;
        ctx.strokeStyle = dropColor;
        ctx.lineWidth = 0.8;
        ctx.shadowBlur = 4;
        ctx.shadowColor = styleTuning.tint === "gold" ? "rgba(255,216,150,0.55)" : "rgba(200,220,255,0.6)";
        ctx.stroke();
      });

      for (let i = splashes.length - 1; i >= 0; i -= 1) {
        const s = splashes[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.08; // gravity
        s.life -= 1;

        const alpha = Math.max(0, s.life / s.maxLife);

        // Impact dot
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.1, 0, Math.PI * 2);
        ctx.fillStyle = styleTuning.tint === "gold"
          ? `rgba(255,226,168,${alpha * 0.7})`
          : `rgba(230,240,255,${alpha * 0.8})`;
        ctx.fill();

        // Ripple ring at surface line
        const ringProgress = 1 - s.life / s.maxLife;
        ctx.beginPath();
        ctx.arc(s.x, canvas.height - 5, 1.5 + ringProgress * 4.5, 0, Math.PI * 2);
        ctx.strokeStyle = styleTuning.tint === "gold"
          ? `rgba(255,220,150,${alpha * 0.4})`
          : `rgba(220,235,255,${alpha * 0.45})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();

        if (s.life <= 0) {
          splashes.splice(i, 1);
        }
      }

      raf = requestAnimationFrame(animate);
    };

    animate();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [dropCount, speedMult, opacityScale, intensity, splashLife, styleTuning.angle, styleTuning.splash, styleTuning.tint]);

  const glowOpacity = (0.06 + (intensity / 10) * 0.1) * styleTuning.glow;
  const surfaceColor = styleTuning.tint === "gold" ? "rgba(255,224,170,0.1)" : "rgba(220,235,255,0.08)";

  return (
    <>
      {/* Rain streaks */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ opacity: 1 }}
      />

      {/* Wet-surface glow at bottom so impacts feel grounded */}
      <div
        className="absolute bottom-0 left-0 w-full h-20 pointer-events-none"
        style={{
          background: `linear-gradient(to top, ${surfaceColor}, transparent)`,
          opacity: rainStyle === "storm" ? 0.62 : rainStyle === "luxury" ? 0.48 : 0.55,
        }}
      />

      {/* Roaming light glow — rain catching light */}
      <motion.div
        className="absolute inset-0 pointer-events-none mix-blend-overlay"
        animate={{
          background: [
            "radial-gradient(ellipse at 30% 40%, rgba(255,255,255,0.12), transparent 60%)",
            "radial-gradient(ellipse at 68% 55%, rgba(220,235,255,0.18), transparent 58%)",
            "radial-gradient(ellipse at 45% 70%, rgba(255,255,255,0.10), transparent 62%)",
            "radial-gradient(ellipse at 30% 40%, rgba(255,255,255,0.12), transparent 60%)",
          ],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        style={{ opacity: glowOpacity * 10 }} // glowOpacity is ~0.06–0.16, boost to 0.6–1.6 then clip
      />

      {/* Ambient light flicker */}
      <motion.div
        className="absolute inset-0 pointer-events-none bg-white"
        animate={{ opacity: [0, 0.03, 0, 0.015, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      {rainStyle === "storm" && (
        <motion.div
          key={flashOn ? "storm-flash-on" : "storm-flash-off"}
          className="absolute inset-0 bg-white pointer-events-none"
          animate={{ opacity: flashOn ? [0, 1, 0.3, 0.8, 0.2, 0] : 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ mixBlendMode: "screen" }}
        />
      )}
    </>
  );
}
