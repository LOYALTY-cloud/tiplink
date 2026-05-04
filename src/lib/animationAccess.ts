export type AnimationType =
  | "glow"
  | "grid"
  | "liquid"
  | "particles"
  | "glass"
  | "neonWave"
  | "cinematicMotion"
  | "swirlMotion"
  | "pushPullMotion";

export type MotionType =
  | "bounce"
  | "heartbeat"
  | "flashHit"
  | "particlesSoft"
  | "image3D"
  | "moneyRain"
  | "heartRain"
  | "depth3D"
  | "glassBreak"
  | "ripple"
  | "waterDistortion"
  | "layeredPopOut"
  | "multiLayerPop"
  | "vortexTunnel"
  | "videoCinematicPan"
  | "videoParallax"
  | "videoWaveDrift"
  | "videoSlowZoom"
  | "videoVortexZoom"
  | "videoTilt"
  | "videoShakeClub"
  | "videoGlitch"
  | "streetImpact"
  | "rainGlass"
  | "carousel3D"
  | "beachBall"
  | "leaves"
  | "leafWind";
export type OverlayType = "dust" | "sparkle" | "lightRain" | "smoke" | "fire";
export type LightingType = "sweep" | "glow";

export type EliteEffectType =
  | "depthBlur"
  | "fog"
  | "dust";

export const ALL_ANIMATIONS: AnimationType[] = [
  "glow", "grid", "liquid", "particles", "glass", "neonWave",
  "cinematicMotion", "swirlMotion", "pushPullMotion",
];

export const PHOTO_ANIMATIONS: AnimationType[] = [];

export const ELITE_EFFECTS: EliteEffectType[] = [
  "depthBlur",
  "fog",
  "dust",
];

export const MOTION_LABELS: Record<MotionType, string> = {
  bounce: "🎱 Bounce",
  heartbeat: "❤️ Heartbeat",
  flashHit: "⚡ Flash Hit",
  particlesSoft: "✨ Soft Particles",
  image3D: "🧊 Image 3D",
  moneyRain: "💰 Money Rain",
  heartRain: "💕 Heart Rain",
  depth3D: "🪟 Depth 3D",
  glassBreak: "🧱 Glass Break",
  ripple: "🌊 Ripple",
  waterDistortion: "💧 Water Distortion",
  layeredPopOut: "🪄 Layered Pop Out",
  multiLayerPop: "🎬 Multi-Layer Pop",
  vortexTunnel: "🌀 Vortex Tunnel",
  videoCinematicPan: "🎥 Cinematic Pan",
  videoParallax: "🎯 Parallax Video",
  videoWaveDrift: "🌊 Wave Drift",
  videoSlowZoom: "🎢 Slow Zoom Loop",
  videoVortexZoom: "🌀 Vortex Zoom",
  videoTilt: "⚡ Tilt Camera",
  videoShakeClub: "🎛️ Club Shake + Flash",
  videoGlitch: "📺 Digital Glitch",
  streetImpact: "💥 Street Impact",
  rainGlass: "🌧️ Rain Glass",
  carousel3D: "🎠 3D Carousel",
  beachBall: "🏐 Beach Ball Physics",
  leaves: "🍂 Leaves Pack",
  leafWind: "🍃 Leaf Wind",
};

export const OVERLAY_LABELS: Record<OverlayType, string> = {
  dust: "✨ Dust",
  sparkle: "💫 Sparkle",
  lightRain: "🌧️ Light Rain",
  smoke: "💨 Smoke",
  fire: "🔥 Fire",
};

export const LIGHTING_LABELS: Record<LightingType, string> = {
  sweep: "💡 Sweep",
  glow: "🌟 Glow",
};

export const MAX_ELITE_EFFECTS = 1;

export const ELITE_EFFECT_LABELS: Record<EliteEffectType, string> = {
  depthBlur: "🔍 Depth Blur",
  fog: "🌫️ Atmospheric Fog",
  dust: "✨ Dust Particles",
};

export const ELITE_EFFECT_DESCRIPTIONS: Record<EliteEffectType, string> = {
  depthBlur: "Fake depth-of-field with sharp center and soft background",
  fog: "Cinematic drifting haze over your photo",
  dust: "Floating dust particles for premium texture",
};

export const ANIMATION_LABELS: Record<AnimationType, string> = {
  glow: "✨ Glow",
  grid: "⬛ Grid",
  liquid: "💧 Liquid",
  particles: "✨ Particles",
  glass: "🧊 Glass",
  neonWave: "⚡ Neon Wave",
  cinematicMotion: "🎬 Cinematic Motion",
  swirlMotion: "🌀 Swirl Motion",
  pushPullMotion: "↔️ Push & Pull",
};

export const ANIMATION_DESCRIPTIONS: Record<AnimationType, string> = {
  glow: "Pulsing radial light in your primary color",
  grid: "Scrolling perspective grid lines",
  liquid: "Shifting gradient waves",
  particles: "Lightweight moving particle field",
  glass: "Premium frosted-glass backdrop",
  neonWave: "Animated neon gradient wave",
  cinematicMotion: "Elite cinematic camera motion effect",
  swirlMotion: "Elite swirling vortex motion",
  pushPullMotion: "Elite push and pull depth effect",
};

export function getAllowedAnimations(): AnimationType[] {
  return ALL_ANIMATIONS;
}

export function isPhotoAnimationType(type: AnimationType | null | undefined): boolean {
  if (!type) return false;
  return PHOTO_ANIMATIONS.includes(type);
}

// ── Motion options ─────────────────────────────────────────────────────────
export const IMAGE_MOTION_OPTIONS: MotionType[] = [
  "bounce",
  "heartbeat",
  "particlesSoft",
  "flashHit",
  "image3D",
  "moneyRain",
  "heartRain",
  "glassBreak",
  "depth3D",
  "ripple",
  "waterDistortion",
  "layeredPopOut",
  "multiLayerPop",
  "vortexTunnel",
];

export const VIDEO_MOTION_OPTIONS: MotionType[] = [
  "particlesSoft",
  "videoTilt",
  "videoShakeClub",
  "videoGlitch",
  "streetImpact",
  "rainGlass",
  "carousel3D",
  "glassBreak",
  "beachBall",
  "leaves",
  "leafWind",
];

export function getAllowedImageMotions(): MotionType[] {
  return IMAGE_MOTION_OPTIONS;
}

export function getAllowedVideoMotions(): MotionType[] {
  return VIDEO_MOTION_OPTIONS;
}

export function getAllowedEliteEffects(): EliteEffectType[] {
  return ELITE_EFFECTS;
}

// ── Overlay options ────────────────────────────────────────────────────────
export const ALL_OVERLAYS: OverlayType[] = ["sparkle", "lightRain", "smoke", "fire", "dust"];

export function getAllowedOverlays(): OverlayType[] {
  return ALL_OVERLAYS;
}

export function getAllowedLighting(): LightingType[] {
  return ["sweep", "glow"];
}

export function normalizeEliteEffects(input: unknown): EliteEffectType[] {
  if (!Array.isArray(input)) return [];

  const unique: EliteEffectType[] = [];
  for (const raw of input) {
    if (raw !== "depthBlur" && raw !== "fog" && raw !== "dust") {
      continue;
    }
    if (!unique.includes(raw)) {
      unique.push(raw);
    }
    if (unique.length >= MAX_ELITE_EFFECTS) {
      break;
    }
  }

  return unique;
}

export function normalizeMotion(input: unknown): MotionType | null {
  if (
    input === "bounce" ||
    input === "heartbeat" ||
    input === "flashHit" ||
    input === "particlesSoft" ||
    input === "image3D" ||
    input === "moneyRain" ||
    input === "heartRain" ||
    input === "depth3D" ||
    input === "glassBreak" ||
    input === "ripple" ||
    input === "waterDistortion" ||
    input === "layeredPopOut" ||
    input === "multiLayerPop" ||
    input === "vortexTunnel" ||
    input === "videoCinematicPan" ||
    input === "videoParallax" ||
    input === "videoWaveDrift" ||
    input === "videoSlowZoom" ||
    input === "videoVortexZoom" ||
    input === "videoTilt" ||
    input === "videoShakeClub" ||
    input === "videoGlitch" ||
    input === "streetImpact" ||
    input === "rainGlass" ||
    input === "carousel3D" ||
    input === "beachBall" ||
    input === "leaves" ||
    input === "leafWind"
  ) return input;
  return null;
}

export function normalizeOverlay(input: unknown): OverlayType | null {
  if (input === "dust" || input === "sparkle" || input === "lightRain" || input === "smoke" || input === "fire") {
    return input;
  }
  return null;
}

export function normalizeLighting(input: unknown): LightingType | null {
  if (input === "sweep" || input === "glow") {
    return input;
  }
  return null;
}

/**
 * Normalizes static/gradient animation keys.
 */
export function normalizeAnimationType(input: string | null | undefined): AnimationType | null {
  if (!input) return null;

  const value = input as AnimationType;
  if (
    value === "glow" ||
    value === "grid" ||
    value === "liquid" ||
    value === "particles" ||
    value === "glass" ||
    value === "neonWave"
  ) {
    return value;
  }

  return null;
}
