"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import RippleBackground from "./RippleBackground";

interface Props {
  image?: string;
  speed?: number;
  intensity?: "soft" | "medium" | "strong";
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

export default function WaterDistortionBackground({
  image,
  speed = 5,
  intensity = "medium",
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    if (!supportsWebGL()) {
      setFallback(true);
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth || 1, mount.clientHeight || 1);
    mount.appendChild(renderer.domElement);

    const fallbackTextureCanvas = document.createElement("canvas");
    fallbackTextureCanvas.width = 64;
    fallbackTextureCanvas.height = 64;
    const fallbackCtx = fallbackTextureCanvas.getContext("2d");
    if (fallbackCtx) {
      const gradient = fallbackCtx.createLinearGradient(0, 0, 64, 64);
      gradient.addColorStop(0, "#0b1326");
      gradient.addColorStop(1, "#1d3557");
      fallbackCtx.fillStyle = gradient;
      fallbackCtx.fillRect(0, 0, 64, 64);
    }

    const texture = image
      ? new THREE.TextureLoader().load(image)
      : new THREE.CanvasTexture(fallbackTextureCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const intensityMap = {
      soft: { amount: 0.013, freq: 24, speedMul: 3.8 },
      medium: { amount: 0.021, freq: 30, speedMul: 4.9 },
      strong: { amount: 0.031, freq: 36, speedMul: 6.2 },
    } as const;
    const tune = intensityMap[intensity];

    const uniforms = {
      uTexture: { value: texture },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uBurstCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uBurstAge: { value: 99 },
      uStrength: { value: tune.amount },
      uFrequency: { value: tune.freq },
      uSpeedMul: { value: tune.speedMul * (0.65 + speed * 0.08) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uTexture;
        uniform float uTime;
        uniform vec2 uMouse;
        uniform vec2 uBurstCenter;
        uniform float uBurstAge;
        uniform float uStrength;
        uniform float uFrequency;
        uniform float uSpeedMul;
        varying vec2 vUv;

        void main() {
          vec2 uv = vUv;

          float dist = distance(uv, uMouse);
          float ripple = sin(uFrequency * dist - uTime * uSpeedMul) * uStrength;
          vec2 direction = normalize(uv - uMouse + vec2(0.00001));
          uv += direction * ripple;

          // Tap/click burst wave: strong at impact, then decays over ~1.2s.
          float burstActive = max(0.0, 1.0 - uBurstAge * 0.9);
          float burstDist = distance(vUv, uBurstCenter);
          float burstRing = sin(42.0 * burstDist - uBurstAge * 14.0) * 0.045 * burstActive;
          vec2 burstDir = normalize(vUv - uBurstCenter + vec2(0.00001));
          uv += burstDir * burstRing;

          float ambientX = sin((uv.y + uTime * 0.16) * 9.0) * (uStrength * 0.25);
          float ambientY = cos((uv.x + uTime * 0.12) * 8.0) * (uStrength * 0.2);
          uv += vec2(ambientX, ambientY);

          vec4 color = texture2D(uTexture, uv);
          gl_FragColor = color;
        }
      `,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const pointer = {
      x: 0.5,
      y: 0.5,
      tx: 0.5,
      ty: 0.5,
      lastMoveAt: performance.now(),
    };
    let burstAge = 99;

    const toUvPoint = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
        y: Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / Math.max(1, rect.height))),
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const uv = toUvPoint(event);
      pointer.tx = uv.x;
      pointer.ty = uv.y;
      pointer.lastMoveAt = performance.now();
    };

    const onPointerDown = (event: PointerEvent) => {
      const uv = toUvPoint(event);
      pointer.tx = uv.x;
      pointer.ty = uv.y;
      pointer.lastMoveAt = performance.now();
      uniforms.uBurstCenter.value.set(uv.x, uv.y);
      burstAge = 0;
      uniforms.uBurstAge.value = 0;
    };

    const onResize = () => {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      renderer.setSize(w, h);
    };

    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onResize);

    let rafId = 0;
    let last = performance.now();

    const animate = (time: number) => {
      const dt = Math.min((time - last) / 16.6667, 2.2);
      last = time;

      uniforms.uTime.value += 0.018 * dt;
      burstAge += 0.016 * dt;
      uniforms.uBurstAge.value = burstAge;

      const idle = time - pointer.lastMoveAt > 1200;
      if (idle) {
        pointer.tx = 0.5 + Math.sin(uniforms.uTime.value * 0.9) * 0.06;
        pointer.ty = 0.5 + Math.cos(uniforms.uTime.value * 0.72) * 0.06;
      }

      const lerp = 0.085 * dt;
      pointer.x += (pointer.tx - pointer.x) * lerp;
      pointer.y += (pointer.ty - pointer.y) * lerp;
      uniforms.uMouse.value.set(pointer.x, pointer.y);

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [image, speed, intensity]);

  if (fallback) {
    return <RippleBackground image={image} speed={speed} intensity={intensity} />;
  }

  return <div ref={mountRef} className="absolute inset-0 overflow-hidden" />;
}
