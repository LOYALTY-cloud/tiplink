"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { TipPagePreview } from "@/components/TipPagePreview";

interface Theme {
  id: number;
  name: string;
  type: "video" | "image" | "gradient";
  src?: string;
  fallbackClass: string;
  description: string;
}

const THEMES: Theme[] = [
  {
    id: 1,
    name: "Rainforest",
    type: "video",
    src: "/themes/rainforest.mp4",
    fallbackClass: "from-emerald-700 via-green-700 to-teal-800",
    description: "Organic creator vibe with cinematic depth",
  },
  {
    id: 2,
    name: "Volleyball",
    type: "video",
    src: "/themes/volleyball.mp4",
    fallbackClass: "from-orange-600 via-amber-600 to-rose-700",
    description: "Energetic social scene made for tipping moments",
  },
  {
    id: 3,
    name: "Core Dark",
    type: "gradient",
    fallbackClass: "from-black via-zinc-900 to-gray-900",
    description: "Minimal dark mode for clean conversion focus",
  },
  {
    id: 4,
    name: "Night City",
    type: "image",
    src: "/themes/city.jpg",
    fallbackClass: "from-slate-900 via-indigo-900 to-black",
    description: "Urban premium atmosphere with strong contrast",
  },
  {
    id: 5,
    name: "Miami",
    type: "image",
    src: "/themes/miami.jpg",
    fallbackClass: "from-cyan-700 via-sky-600 to-pink-700",
    description: "Bright destination look with high visual pop",
  },
];

export default function ThemeFeed() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadedAssets, setLoadedAssets] = useState<Record<number, true>>({});
  const [failedAssets, setFailedAssets] = useState<Record<number, true>>({});

  const markAssetLoaded = (id: number) => {
    setLoadedAssets((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  const markAssetFailed = (id: number) => {
    setFailedAssets((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const element = e.target as HTMLElement;
      const index = Math.round(element.scrollTop / window.innerHeight);
      setActiveIndex(Math.min(index, THEMES.length - 1));
    };

    const feedElement = document.getElementById("theme-feed");
    if (feedElement) {
      feedElement.addEventListener("scroll", handleScroll, { passive: true });
      return () => feedElement.removeEventListener("scroll", handleScroll);
    }
  }, []);

  return (
    <section
      id="theme-feed"
      className="h-screen overflow-y-scroll snap-y snap-mandatory scroll-smooth bg-black"
      style={{ scrollBehavior: "smooth" }}
    >
      {THEMES.map((theme, index) => {
        const isActive = activeIndex === index;

        return (
          <div
            key={theme.id}
            className="h-screen snap-start flex items-center justify-center px-4"
            style={{
              background: isActive ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.7)",
              transition: "background 0.4s ease-out",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{
                opacity: isActive ? 1 : 0.5,
                scale: isActive ? 1 : 0.85,
                y: isActive ? 0 : 20,
              }}
              transition={{
                duration: 0.6,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="relative w-[240px] h-[500px] rounded-3xl shadow-2xl overflow-hidden"
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
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${loadedAssets[theme.id] ? "opacity-100" : "opacity-0"}`}
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
                  className="absolute inset-0 h-full w-full object-cover opacity-100"
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
            </motion.div>
          </div>
        );
      })}

      {/* Scroll Indicator */}
      <motion.div
        className="fixed bottom-8 left-1/2 -translate-x-1/2 pointer-events-none"
        animate={{
          y: [0, 8, 0],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
        }}
      >
        <div className="text-white/40 text-sm text-center">
          Scroll ↓
        </div>
      </motion.div>
    </section>
  );
}
