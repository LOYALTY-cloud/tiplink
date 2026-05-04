"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { LightingType, MotionType, OverlayType } from "@/lib/animationAccess";

const BouncingBackground = dynamic(() => import("./motion/BouncingBackground"), { ssr: false });
const HeartbeatBackground = dynamic(() => import("./motion/HeartbeatBackground"), { ssr: false });
const FlashHitBackground = dynamic(() => import("./motion/FlashHitBackground"), { ssr: false });
const ParticlesSoftBackground = dynamic(() => import("./motion/ParticlesSoftBackground"), { ssr: false });
const Image3DBackground = dynamic(() => import("./motion/Image3DBackground"), { ssr: false });
const MoneyRainBackground = dynamic(() => import("./motion/MoneyRainBackground"), { ssr: false });
const HeartRainBackground = dynamic(() => import("./motion/HeartRainBackground"), { ssr: false });
const Depth3DBackground = dynamic(() => import("./motion/Depth3DBackground"), { ssr: false });
const GlassBreakBackground = dynamic(() => import("./motion/GlassBreakBackground"), { ssr: false });
const RippleBackground = dynamic(() => import("./motion/RippleBackground"), { ssr: false });
const WaterDistortionBackground = dynamic(() => import("./motion/WaterDistortionBackground"), { ssr: false });
const LayeredPopOutBackground = dynamic(() => import("./motion/LayeredPopOutBackground"), { ssr: false });
const MultiLayerPopBackground = dynamic(() => import("./motion/MultiLayerPopBackground"), { ssr: false });
const VortexTunnelBackground = dynamic(() => import("./motion/VortexTunnelBackground"), { ssr: false });
const CinematicOverlayStack = dynamic(() => import("./overlay/CinematicOverlayStack"), { ssr: false });

export interface AnimationConfig {
  backgroundType?: "static" | "gradient" | "animation";
  context?: "builder" | "public";
  background?: string;
  preserveUnderlyingMedia?: boolean;
  motion?: MotionType | null;
  overlay?: OverlayType | null;
  lighting?: LightingType | null;
  speed?: number;
  motionSettings?: {
    color?: "pink" | "red" | "purple" | "white";
    rippleIntensity?: "soft" | "medium" | "strong";
    waterIntensity?: "soft" | "medium" | "strong";
    rainStyle?: "soft" | "storm" | "luxury";
    fireStyle?: "embers" | "flameEdge" | "sparks";
    vortexStyle?: "slow" | "fast" | "falling";
    [key: string]: unknown;
  };
  // kept for API compat — unused by current renderer
  [key: string]: unknown;
}

interface AnimationRendererProps {
  config: AnimationConfig;
}

export default function AnimationRenderer({ config }: AnimationRendererProps) {
  const flashTrigger = config.motion === "flashHit";
  const [cameraPos, setCameraPos] = useState({ x: 0, y: 0 });
  const rainStyle =
    config.motionSettings?.rainStyle === "storm" || config.motionSettings?.rainStyle === "luxury"
      ? config.motionSettings.rainStyle
      : "soft";
  const fireStyle =
    config.motionSettings?.fireStyle === "flameEdge" || config.motionSettings?.fireStyle === "sparks"
      ? config.motionSettings.fireStyle
      : "embers";
  const vortexStyle =
    config.motionSettings?.vortexStyle === "fast" || config.motionSettings?.vortexStyle === "falling"
      ? config.motionSettings.vortexStyle
      : "slow";
  const vortexImages = [
    typeof config.motionSettings?.subjectImage === "string" ? config.motionSettings.subjectImage : undefined,
    typeof config.motionSettings?.midImage === "string" ? config.motionSettings.midImage : undefined,
    typeof config.motionSettings?.backgroundImage === "string" ? config.motionSettings.backgroundImage : undefined,
  ].filter((value): value is string => Boolean(value));

  useEffect(() => {
    if (config.motion !== "multiLayerPop") {
      setCameraPos({ x: 0, y: 0 });
    }
  }, [config.motion]);

  if (config.preserveUnderlyingMedia) {
    return (
      <CinematicOverlayStack
        overlay={config.overlay}
        lighting={config.lighting}
        intensity={typeof config.intensity === "number" ? config.intensity : 5}
        speed={config.speed ?? 5}
        flashTrigger={flashTrigger}
        rainStyle={rainStyle}
        fireStyle={fireStyle}
        cameraPos={cameraPos}
      />
    );
  }

  if (config.motion === "bounce") {
    return (
      <>
        <BouncingBackground
          image={config.background}
          speed={config.speed ?? 5}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "heartbeat") {
    return (
      <>
        <HeartbeatBackground
          image={config.background}
          speed={config.speed ?? 5}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "flashHit") {
    return (
      <>
        <FlashHitBackground
          image={config.background}
          speed={config.speed ?? 5}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "particlesSoft") {
    return (
      <>
        <ParticlesSoftBackground
          image={config.background}
          speed={config.speed ?? 5}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "image3D") {
    return (
      <>
        <Image3DBackground
          image={config.background}
          speed={config.speed ?? 5}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "moneyRain") {
    return (
      <>
        <MoneyRainBackground
          image={config.background}
          speed={config.speed ?? 5}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "heartRain") {
    return (
      <>
        <HeartRainBackground
          image={config.background}
          speed={config.speed ?? 5}
          color={config.motionSettings?.color ?? "pink"}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "depth3D") {
    return (
      <>
        <Depth3DBackground
          image={config.background}
          speed={config.speed ?? 5}
          subjectImage={typeof config.motionSettings?.subjectImage === "string" ? config.motionSettings.subjectImage : undefined}
          backgroundImage={typeof config.motionSettings?.backgroundImage === "string" ? config.motionSettings.backgroundImage : undefined}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "glassBreak") {
    return (
      <>
        <GlassBreakBackground
          image={config.background}
          speed={config.speed ?? 5}
          autoPlay={config.context !== "public"}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "ripple") {
    return (
      <>
        <RippleBackground
          image={config.background}
          speed={config.speed ?? 5}
          intensity={config.motionSettings?.rippleIntensity ?? "medium"}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "waterDistortion") {
    return (
      <>
        <WaterDistortionBackground
          image={config.background}
          speed={config.speed ?? 5}
          intensity={config.motionSettings?.waterIntensity ?? "medium"}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "layeredPopOut") {
    return (
      <>
        <LayeredPopOutBackground
          image={config.background}
          speed={config.speed ?? 5}
          subjectImage={typeof config.motionSettings?.subjectImage === "string" ? config.motionSettings.subjectImage : undefined}
          backgroundImage={typeof config.motionSettings?.backgroundImage === "string" ? config.motionSettings.backgroundImage : undefined}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "multiLayerPop") {
    return (
      <>
        <MultiLayerPopBackground
          image={config.background}
          speed={config.speed ?? 5}
          subjectImage={typeof config.motionSettings?.subjectImage === "string" ? config.motionSettings.subjectImage : undefined}
          midImage={typeof config.motionSettings?.midImage === "string" ? config.motionSettings.midImage : undefined}
          backgroundImage={typeof config.motionSettings?.backgroundImage === "string" ? config.motionSettings.backgroundImage : undefined}
          onCameraPosChange={setCameraPos}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  if (config.motion === "vortexTunnel") {
    return (
      <>
        <VortexTunnelBackground
          image={config.background}
          images={vortexImages}
          speed={config.speed ?? 5}
          vortexStyle={vortexStyle}
        />
        <CinematicOverlayStack
          overlay={config.overlay}
          lighting={config.lighting}
          intensity={typeof config.intensity === "number" ? config.intensity : 5}
          speed={config.speed ?? 5}
          flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
        />
      </>
    );
  }

  // motion is null (None) — still render overlays if selected
  return (
    <CinematicOverlayStack
      overlay={config.overlay}
      lighting={config.lighting}
      intensity={typeof config.intensity === "number" ? config.intensity : 5}
      speed={config.speed ?? 5}
      flashTrigger={flashTrigger}
          rainStyle={rainStyle}
          fireStyle={fireStyle}
          cameraPos={cameraPos}
    />
  );
}
