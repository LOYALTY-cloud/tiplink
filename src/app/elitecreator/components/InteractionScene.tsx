"use client";

import { useEffect, useRef, useState } from "react";
import { motion, type PanInfo } from "framer-motion";
import { TipPagePreview } from "@/components/TipPagePreview";

type ThemeType = "video" | "image" | "gradient";

type Theme = {
  id: number;
  name: string;
  type: ThemeType;
  src?: string;
  fallbackClass: string;
};

const themes: Theme[] = [
  { id: 1, name: "Rainforest", type: "video", src: "/themes/rainforest.mp4", fallbackClass: "from-emerald-700 via-green-700 to-teal-800" },
  { id: 2, name: "Volleyball", type: "video", src: "/themes/volleyball.mp4", fallbackClass: "from-orange-600 via-amber-600 to-rose-700" },
  { id: 3, name: "Core Dark", type: "gradient", fallbackClass: "from-black via-zinc-900 to-gray-900" },
  { id: 4, name: "Night City", type: "image", src: "/themes/city.jpg", fallbackClass: "from-slate-900 via-indigo-900 to-black" },
  { id: 5, name: "Miami", type: "image", src: "/themes/miami.jpg", fallbackClass: "from-cyan-700 via-sky-600 to-pink-700" },
];

export default function InteractionScene() {
  const [index, setIndex] = useState(2);
  const [failedAssets, setFailedAssets] = useState<Record<number, true>>({});
  const [loadedAssets, setLoadedAssets] = useState<Record<number, true>>({});
  const [showPerson, setShowPerson] = useState(true);
  const [glow, setGlow] = useState({ x: 0, y: 0, visible: false });
  const [isInteracting, setIsInteracting] = useState(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markAssetFailed = (id: number) => {
    setFailedAssets((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  const markAssetLoaded = (id: number) => {
    setLoadedAssets((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  const pauseAutoplay = (ms = 1200) => {
    setIsInteracting(true);
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => {
      setIsInteracting(false);
    }, ms);
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    pauseAutoplay(1600);
    if (info.offset.x < -50) {
      setIndex((prev) => (prev + 1) % themes.length);
      return;
    }
    if (info.offset.x > 50) {
      setIndex((prev) => (prev - 1 + themes.length) % themes.length);
    }
  };

  const handleTap = (i: number, e: React.MouseEvent<HTMLDivElement>) => {
    pauseAutoplay();
    setIndex(i);

    const rect = e.currentTarget.getBoundingClientRect();
    setGlow({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      visible: true,
    });

    setTimeout(() => {
      setGlow((g) => ({ ...g, visible: false }));
    }, 500);
  };

  useEffect(() => {
    if (isInteracting) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % themes.length);
    }, 2400);
    return () => clearInterval(timer);
  }, [isInteracting]);

  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, []);

  return (
    <section className="relative h-screen flex items-center justify-center bg-black overflow-hidden">
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        onDragStart={() => setIsInteracting(true)}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => setIsInteracting(true)}
        onMouseLeave={() => pauseAutoplay(700)}
        className="relative flex items-center justify-center"
      >
        {themes.map((theme, i) => {
          let offset = i - index;
          const half = Math.floor(themes.length / 2);
          if (offset > half) offset -= themes.length;
          if (offset < -half) offset += themes.length;

          return (
            <motion.div
              key={theme.id}
              onClick={(e) => handleTap(i, e)}
              animate={{
                scale: offset === 0 ? 1 : 0.8,
                opacity: offset === 0 ? 1 : 0.3,
                x: offset * 260,
                rotateY: offset * -25,
              }}
              transition={{ type: "spring", stiffness: 120 }}
              className="absolute w-[240px] h-[500px] rounded-3xl overflow-hidden"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${theme.fallbackClass}`} />

              {theme.type === "video" && theme.src && !failedAssets[theme.id] && (
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedData={() => markAssetLoaded(theme.id)}
                  onCanPlay={() => markAssetLoaded(theme.id)}
                  onError={() => markAssetFailed(theme.id)}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loadedAssets[theme.id] ? "opacity-100" : "opacity-0"}`}
                >
                  <source src={theme.src} />
                </video>
              )}

              {theme.type === "image" && theme.src && !failedAssets[theme.id] && (
                <img
                  src={theme.src}
                  alt={theme.name}
                  loading="eager"
                  onLoad={() => markAssetLoaded(theme.id)}
                  onError={() => markAssetFailed(theme.id)}
                  className="absolute inset-0 w-full h-full object-cover opacity-100"
                />
              )}

              <div className="absolute inset-0 bg-black/45" />

              <div className="relative z-10 p-3 h-full text-white">
                <TipPagePreview
                  themeName={theme.name}
                  description={`${theme.type} backdrop`}
                  themeKey="default"
                />
              </div>

              <div className="absolute bottom-2 left-3 text-xs text-white/80">
                {theme.name} • {theme.type}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {glow.visible && (
        <motion.div
          initial={{ scale: 0.5, opacity: 0.6 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed w-24 h-24 rounded-full bg-white/30 blur-2xl pointer-events-none"
          style={{
            left: glow.x - 48,
            top: glow.y - 48,
          }}
        />
      )}

      <div className="absolute bottom-0 w-full h-40 bg-gradient-to-t from-black to-transparent z-20" />

      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex justify-center">
        {showPerson && (
          <motion.img
            src="/person.png"
            alt="person"
            className="w-[85vw] max-w-[420px] h-auto object-contain drop-shadow-[0_20px_60px_rgba(0,0,0,0.8)]"
            onError={() => setShowPerson(false)}
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 3 }}
          />
        )}

        {!showPerson && (
          <div className="relative w-[85vw] max-w-[420px] h-[70vh] opacity-95">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="absolute inset-0"
            >
              <div className="absolute bottom-0 left-1/2 h-[58vh] w-[140px] -translate-x-1/2 rounded-[70px] bg-gradient-to-t from-white/22 via-white/12 to-transparent blur-[1px]" />
              <div className="absolute top-[12%] left-1/2 h-[84px] w-[84px] -translate-x-1/2 rounded-full bg-white/24" />
            </motion.div>
          </div>
        )}

        <div className="absolute top-[22%] left-[64%] w-16 h-16 rounded-full bg-white/20 blur-xl animate-pulse" />
      </div>

      <div className="absolute top-16 z-30 rounded-full border border-white/20 bg-black/35 px-5 py-2 text-center backdrop-blur-sm">
        <p className="text-sm font-semibold text-white">{themes[index]?.name}</p>
        <p className="text-xs text-white/70">center selected</p>
      </div>

      <div className="absolute bottom-20 text-gray-400 text-sm">
        Drag to explore • Tap to select
      </div>
    </section>
  );
}
