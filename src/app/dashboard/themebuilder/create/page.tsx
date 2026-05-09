"use client";

import { useState, useEffect, useRef } from "react";
import AnimationRenderer from "@/components/theme/AnimationRenderer";
import {
  type AnimationType,
  LIGHTING_LABELS,
  MOTION_LABELS,
  OVERLAY_LABELS,
  type LightingType,
  type MotionType,
  type OverlayType,
  normalizeLighting,
  normalizeMotion,
  normalizeOverlay,
  isPhotoAnimationType,
  IMAGE_MOTION_OPTIONS,
  VIDEO_MOTION_OPTIONS,
} from "@/lib/animationAccess";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import ThemeBackgroundVideo from "@/components/theme/ThemeBackgroundVideo";
import ThemeCarousel3D from "@/components/theme/ThemeCarousel3D";
import { THEME_VIDEO_RULES } from "@/lib/themeVideoRules";

const VIDEO_MOTION_SET = new Set<MotionType>(VIDEO_MOTION_OPTIONS);

function isVideoMotion(motion: MotionType | null | undefined): boolean {
  return Boolean(motion && VIDEO_MOTION_SET.has(motion));
}

type CardBgMode = "color" | "gradient" | "image" | "transparent";

type ThemeCategory = {
  id: string;
  name: string;
  slug: string;
};

type ThemeState = {
  backgroundMediaType: "image" | "video";
  background: string;
  backgroundVideo: string;
  backgroundVideoPoster: string;
  backgroundVideoDuration: number | null;
  primaryColor: string;
  cardBgMode: CardBgMode;
  cardBackground: string;      // used in color mode
  cardGradientFrom: string;    // gradient mode
  cardGradientTo: string;
  cardGradientDir: string;
  cardImage: string;           // image mode (permanent URL after upload)
  cardOverlay: string;         // rgba overlay for image mode
  textColor: string;
  animation: "none" | "glow" | "pulse" | "neon";
  // Animation Engine v1
  backgroundType: "static" | "gradient" | "animation";
  motion: MotionType | null;
  overlay: OverlayType | null;
  lighting: LightingType | null;
  speed: number;
  intensity: number;
  motionSettings?: {
    color?: "pink" | "red" | "purple" | "white";
    subjectImage?: string;
    midImage?: string;
    backgroundImage?: string;
    rippleIntensity?: "soft" | "medium" | "strong";
    waterIntensity?: "soft" | "medium" | "strong";
    rainStyle?: "soft" | "storm" | "luxury";
    fireStyle?: "embers" | "flameEdge" | "sparks";
    vortexStyle?: "slow" | "fast" | "falling";
    clubBeat?: "slow" | "normal" | "fast";
    clubFlashMode?: "off" | "white" | "club";
    seasonalDensity?: "low" | "medium" | "high";
    rainGlassStyle?: "drizzle" | "storm" | "neon";
  };
};

async function getToken(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  const expiresAt = sessionData.session.expires_at ?? 0;
  if (expiresAt - Math.floor(Date.now() / 1000) < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? null;
  }
  return sessionData.session.access_token;
}

async function validateVideo(file: File) {
  if (!THEME_VIDEO_RULES.allowedMimeTypes.includes(file.type as (typeof THEME_VIDEO_RULES.allowedMimeTypes)[number])) {
    throw new Error("Only MP4 and WebM videos are allowed");
  }

  if (file.size > THEME_VIDEO_RULES.maxInputBytes) {
    throw new Error(`Max size is ${Math.round(THEME_VIDEO_RULES.maxInputBytes / (1024 * 1024))}MB`);
  }

  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);
  video.preload = "metadata";

  let canReadMetadata = false;

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Timed out while reading video metadata"));
      }, 5000);

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        video.onloadedmetadata = null;
        video.onerror = null;
      };

      video.onloadedmetadata = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      video.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Could not read video metadata"));
      };

      video.src = objectUrl;
      video.load();
    });

    canReadMetadata = true;
  } catch (error) {
    // Some valid files/codecs cannot be decoded locally; server-side validation still runs.
    console.warn("validateVideo: metadata unavailable, continuing with server validation", error);
  }

  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const width = video.videoWidth;
  const height = video.videoHeight;

  URL.revokeObjectURL(objectUrl);

  if (canReadMetadata && duration > THEME_VIDEO_RULES.maxUploadDurationSeconds) {
    throw new Error(`Max source duration is ${THEME_VIDEO_RULES.maxUploadDurationSeconds} seconds`);
  }

  const willDownscale = canReadMetadata && Math.max(width, height) > THEME_VIDEO_RULES.maxLongestEdgePx;

  return { duration, width, height, canReadMetadata, willDownscale };
}

export default function CreateThemePage() {
  const router = useRouter();
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);

  const [previewDevice, setPreviewDevice] = useState<"iphone" | "desktop">("iphone");
  const [creatorGateChecked, setCreatorGateChecked] = useState(false);
  const [isCreator, setIsCreator] = useState<boolean | null>(null);
  const [hasActiveStore, setHasActiveStore] = useState(false);
  const [reducedMotionPref, setReducedMotionPref] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setEditingThemeId(params.get("edit"));
  }, []);

  // ── Creator gate ──────────────────────────────────────────────────────────
  useEffect(() => {
    const channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const userId = sess.session?.user?.id;
      if (!token) { router.replace("/login"); return; }
      const res = await fetch("/api/creator/apply", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        // Fail-closed: any API error is treated as not a creator
        router.replace("/dashboard?creator_gate=1");
        return;
      }
      const json = await res.json();
      if (!json.is_creator) {
        router.replace("/dashboard?creator_gate=1");
        return;
      }
      // Require Stripe onboarding unless owner-elite
      if (!json.charges_enabled && !json.owner_elite) {
        router.replace("/dashboard/onboarding?themebuilder_gate=1");
        return;
      }
      // Block access if upload-banned
      if (json.upload_ban_until && new Date(json.upload_ban_until) > new Date()) {
        router.replace("/dashboard/themebuilder?suspended=1");
        return;
      }
      setIsCreator(true);
      setHasActiveStore(json.has_active_store === true);
      setCreatorGateChecked(true);
    })();

    // Cleanup subscription on unmount
    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Detect system/browser reduced-motion preference so preview behavior is explicit.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotionPref(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const [theme, setTheme] = useState<ThemeState>({
    backgroundMediaType: "image",
    background: "",
    backgroundVideo: "",
    backgroundVideoPoster: "",
    backgroundVideoDuration: null,
    primaryColor: "#00ff99",
    cardBgMode: "color",
    cardBackground: "#111111",
    cardGradientFrom: "#1a1a2e",
    cardGradientTo: "#16213e",
    cardGradientDir: "to bottom right",
    cardImage: "",
    cardOverlay: "",
    textColor: "#ffffff",
    animation: "none",
    backgroundType: "static",
    motion: "bounce",
    overlay: null,
    lighting: null,
    speed: 5,
    intensity: 5,
    motionSettings: {
      color: "pink",
      rippleIntensity: "medium",
      waterIntensity: "medium",
      rainStyle: "soft",
      fireStyle: "embers",
      vortexStyle: "slow",
      clubBeat: "normal",
      clubFlashMode: "club",
      seasonalDensity: "medium",
    },
  });
  const [themeName, setThemeName] = useState("My Theme");
  const [price, setPrice] = useState("");
  const [upgradePrice, setUpgradePrice] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [categories, setCategories] = useState<ThemeCategory[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [videoUploadStatus, setVideoUploadStatus] = useState<"idle" | "validating" | "compressing" | "uploading" | "error">("idle");
  const [videoUploadMessage, setVideoUploadMessage] = useState<string>("");
  const [depthUploadStatus, setDepthUploadStatus] = useState<{
    subjectImage: "idle" | "uploading" | "error";
    midImage: "idle" | "uploading" | "error";
    backgroundImage: "idle" | "uploading" | "error";
  }>({
    subjectImage: "idle",
    midImage: "idle",
    backgroundImage: "idle",
  });
  const [autoCutoutStatus, setAutoCutoutStatus] = useState<"idle" | "uploading" | "processing" | "ready" | "error">("idle");
  const [autoCutoutMessage, setAutoCutoutMessage] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error" | "warn">("idle");
  const [saveWarn, setSaveWarn] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [activePanel, setActivePanel] = useState<string | null>(null);

  // On desktop, default to the Style panel so the sidebar has content on first load.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      setActivePanel("style");
    }
  }, []);

  useEffect(() => {
    if (!editingThemeId) return;

    (async () => {
      setLoadingEdit(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not logged in");

        const res = await fetch(`/api/themes/${encodeURIComponent(editingThemeId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error("Failed to load theme for editing");
        }

        const json = await res.json();
        const existing = json.theme;
        if (!existing) throw new Error("Theme not found");

        setThemeName(existing.name ?? "My Theme");
        const existingBasePrice = existing.base_price != null ? existing.base_price : existing.price;
        setPrice(existingBasePrice != null ? String(existingBasePrice) : "");
        setUpgradePrice(existing.upgrade_price != null ? String(existing.upgrade_price) : "");
        setIsPublic(existing.is_public === true);
        setCategoryId(typeof existing.category_id === "string" ? existing.category_id : "");

        if (existing.config && typeof existing.config === "object") {
          const cfg = existing.config as Partial<ThemeState>;
          const normalizedMotion = normalizeMotion((cfg as any).motion ?? (cfg as any).animationType);
          const normalizedOverlay = normalizeOverlay((cfg as any).overlay ?? (Array.isArray((cfg as any).eliteEffects) ? (cfg as any).eliteEffects[0] : null));
          const normalizedLighting = normalizeLighting((cfg as any).lighting);
          const loadedMediaType = cfg.backgroundMediaType === "video" || Boolean(cfg.backgroundVideo) ? "video" : "image";
          const normalizedMotionForMedia = loadedMediaType === "video"
            ? (normalizedMotion && isVideoMotion(normalizedMotion) ? normalizedMotion : "videoSlowZoom")
            : (normalizedMotion && !isVideoMotion(normalizedMotion) ? normalizedMotion : "bounce");
          setTheme((prev) => ({
            ...prev,
            ...cfg,
            backgroundMediaType: loadedMediaType,
            motion: normalizedMotionForMedia,
            backgroundType: normalizedMotionForMedia ? "animation" : prev.backgroundType,
            overlay: normalizedOverlay,
            lighting: normalizedLighting,
            speed: typeof (cfg as any).speed === "number" ? (cfg as any).speed : (typeof (cfg as any).animationSpeed === "number" ? (cfg as any).animationSpeed : prev.speed),
            intensity: typeof (cfg as any).intensity === "number" ? (cfg as any).intensity : (typeof (cfg as any).animationIntensity === "number" ? (cfg as any).animationIntensity : prev.intensity),
            cardBgMode: (cfg.cardBgMode as ThemeState["cardBgMode"]) ?? prev.cardBgMode,
          }));
        }
      } catch (err) {
        console.error("load edit theme:", err);
      } finally {
        setLoadingEdit(false);
      }
    })();
  }, [editingThemeId]);

  useEffect(() => {
    (async () => {
      setCategoriesLoading(true);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch("/api/themes/categories", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load categories");
        setCategories(Array.isArray(json.categories) ? json.categories : []);
      } catch (err) {
        console.error("load categories:", err);
      } finally {
        setCategoriesLoading(false);
      }
    })();
  }, []);

  function update(field: keyof ThemeState, value: string) {
    setTheme((prev) => ({ ...prev, [field]: value }));
  }

  /** Resize an image File to fit within maxBytes using canvas, preserving aspect ratio.
   *  Tries decreasing quality first, then scales down dimensions if needed.
   *  Returns a base64 string (without the data-URL prefix) and the mime type. */
  async function resizeToFit(
    file: File,
    maxBytes: number
  ): Promise<{ base64: string; mime: string }> {
    const MAX_DIM = 2560; // never upscale, but cap large images here

    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const mime = "image/jpeg"; // always re-encode as JPEG for size control
        const canvas = document.createElement("canvas");

        // Start at native size (capped)
        let w = Math.min(img.naturalWidth, MAX_DIM);
        let h = Math.round((img.naturalHeight / img.naturalWidth) * w);
        if (img.naturalHeight > img.naturalWidth) {
          h = Math.min(img.naturalHeight, MAX_DIM);
          w = Math.round((img.naturalWidth / img.naturalHeight) * h);
        }

        const tryEncode = (width: number, height: number, quality: number): string => {
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d")!;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
          return canvas.toDataURL(mime, quality).split(",")[1];
        };

        // Try high quality first, then step down quality, then shrink dimensions
        const qualitySteps = [0.92, 0.85, 0.78, 0.70];
        for (const q of qualitySteps) {
          const b64 = tryEncode(w, h, q);
          if (atob(b64).length <= maxBytes) {
            resolve({ base64: b64, mime });
            return;
          }
        }

        // Still too large — iteratively shrink dimensions by 20% until it fits
        let scale = 0.8;
        for (let i = 0; i < 10; i++) {
          const sw = Math.round(w * scale);
          const sh = Math.round(h * scale);
          const b64 = tryEncode(sw, sh, 0.82);
          if (atob(b64).length <= maxBytes) {
            resolve({ base64: b64, mime });
            return;
          }
          scale *= 0.8;
        }

        reject(new Error("Unable to compress image to fit 2 MB"));
      };
      img.onerror = reject;
      img.src = objectUrl;
    });
  }

  /** Resize with alpha support for transparent cutouts.
   *  Encodes to WebP (keeps transparency) and progressively lowers quality/dimensions. */
  async function resizeToFitAlpha(
    file: File,
    maxBytes: number
  ): Promise<{ base64: string; mime: string }> {
    const MAX_DIM = 2048;

    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const mime = "image/webp";
        const canvas = document.createElement("canvas");

        let w = Math.min(img.naturalWidth, MAX_DIM);
        let h = Math.round((img.naturalHeight / img.naturalWidth) * w);
        if (img.naturalHeight > img.naturalWidth) {
          h = Math.min(img.naturalHeight, MAX_DIM);
          w = Math.round((img.naturalWidth / img.naturalHeight) * h);
        }

        const tryEncode = (width: number, height: number, quality: number): string => {
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d")!;
          ctx.clearRect(0, 0, width, height);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, width, height);
          return canvas.toDataURL(mime, quality).split(",")[1];
        };

        for (const q of [0.92, 0.85, 0.78, 0.7, 0.62, 0.56]) {
          const b64 = tryEncode(w, h, q);
          if (atob(b64).length <= maxBytes) {
            resolve({ base64: b64, mime });
            return;
          }
        }

        let scale = 0.82;
        for (let i = 0; i < 10; i++) {
          const sw = Math.max(320, Math.round(w * scale));
          const sh = Math.max(320, Math.round(h * scale));
          const b64 = tryEncode(sw, sh, 0.66);
          if (atob(b64).length <= maxBytes) {
            resolve({ base64: b64, mime });
            return;
          }
          scale *= 0.82;
        }

        reject(new Error("Unable to optimize subject image under 6 MB"));
      };
      img.onerror = reject;
      img.src = objectUrl;
    });
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      e.target.value = "";
      return;
    }

    setUploadStatus("uploading");
    const blobUrl = URL.createObjectURL(file);
    setTheme((prev) => ({
      ...prev,
      backgroundMediaType: "image",
      background: blobUrl,
      backgroundVideo: "",
      backgroundVideoPoster: "",
      backgroundVideoDuration: null,
    }));

    try {
      const token = await getToken();
      if (!token) throw new Error("Not logged in");

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("No user id");

      const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
      let base64: string;
      let mime: string;

      if (file.size > MAX_BYTES) {
        // Auto-resize — the blob preview stays while we compress
        ({ base64, mime } = await resizeToFit(file, MAX_BYTES));
      } else {
        // Already small enough — read as-is
        mime = file.type;
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      const ext = mime === "image/jpeg" ? "jpg" : (file.name.split(".").pop()?.toLowerCase() ?? "jpg");
      const fileName = `${userId}/theme-bg-${Date.now()}.${ext}`;

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bucket: "theme-backgrounds", fileName, fileBase64: base64 }),
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error ?? "Upload failed");
      }

      const { publicUrl } = await uploadRes.json();
      URL.revokeObjectURL(blobUrl);
      setTheme((prev) => ({ ...prev, backgroundMediaType: "image", background: publicUrl }));
      setUploadStatus("idle");
    } catch (err) {
      console.error("handleImageUpload:", err);
      setUploadStatus("error");
    }
  }

  async function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoUploadStatus("validating");
    setVideoUploadMessage("Validating...");

    try {
      const meta = await validateVideo(file);
      const localBlobUrl = URL.createObjectURL(file);

      const trimmedDuration = meta.canReadMetadata
        ? Math.min(meta.duration, THEME_VIDEO_RULES.targetDurationSeconds)
        : null;

      setTheme((prev) => ({
        ...prev,
        backgroundMediaType: "video",
        background: "",
        backgroundVideo: localBlobUrl,
        backgroundVideoPoster: prev.backgroundVideoPoster,
        backgroundVideoDuration: trimmedDuration,
      }));

      const token = await getToken();
      if (!token) throw new Error("Not logged in");

      setVideoUploadStatus("compressing");
      if (meta.willDownscale && meta.canReadMetadata && meta.duration > THEME_VIDEO_RULES.targetDurationSeconds) {
        setVideoUploadMessage(`Trimming to ${THEME_VIDEO_RULES.targetDurationSeconds}s and resizing to ${THEME_VIDEO_RULES.maxLongestEdgePx}p...`);
      } else if (meta.willDownscale) {
        setVideoUploadMessage(`Resizing to ${THEME_VIDEO_RULES.maxLongestEdgePx}p...`);
      } else if (meta.canReadMetadata && meta.duration > THEME_VIDEO_RULES.targetDurationSeconds) {
        setVideoUploadMessage(`Trimming to ${THEME_VIDEO_RULES.targetDurationSeconds}s...`);
      } else {
        setVideoUploadMessage("Compressing...");
      }

      const form = new FormData();
      form.append("file", file, file.name);

      const res = await fetch("/api/upload/theme-video", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error((payload as { error?: string } | null)?.error ?? "Video upload failed");
      }

      setVideoUploadStatus("uploading");
      setVideoUploadMessage("Generating preview...");

      const payload = await res.json() as {
        videoUrl?: string;
        posterUrl?: string;
        duration?: number;
        trimmed?: boolean;
      };

      if (!payload.videoUrl) {
        throw new Error("Upload did not return a video URL");
      }

      URL.revokeObjectURL(localBlobUrl);
      setTheme((prev) => ({
        ...prev,
        backgroundMediaType: "video",
        backgroundVideo: payload.videoUrl ?? "",
        backgroundVideoPoster: payload.posterUrl ?? "",
        backgroundVideoDuration:
          typeof payload.duration === "number"
            ? payload.duration
            : (meta.canReadMetadata ? Math.min(meta.duration, THEME_VIDEO_RULES.targetDurationSeconds) : meta.duration),
      }));

      setVideoUploadStatus("idle");
      setVideoUploadMessage(payload.trimmed ? `Trimmed to ${THEME_VIDEO_RULES.targetDurationSeconds}s` : "Ready");
    } catch (err) {
      setVideoUploadStatus("error");
      setVideoUploadMessage(err instanceof Error ? err.message : "Video upload failed");
    } finally {
      e.target.value = "";
    }
  }

  async function readBlobAsBase64(blob: Blob): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function base64ToFile(base64: string, mime: string, fileName: string): File {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return new File([blob], fileName, { type: mime });
  }

  async function prepareRemoveBgInput(file: File): Promise<File> {
    const MAX_REMOVE_BG_INPUT_BYTES = Math.floor(7.5 * 1024 * 1024);
    if (file.size <= MAX_REMOVE_BG_INPUT_BYTES) {
      return file;
    }

    const { base64, mime } = await resizeToFit(file, MAX_REMOVE_BG_INPUT_BYTES);
    const ext = mime === "image/jpeg" ? "jpg" : "png";
    return base64ToFile(base64, mime, `remove-bg-input-${Date.now()}.${ext}`);
  }

  async function uploadThemeAsset(params: {
    fileBase64: string;
    fileName: string;
  }): Promise<string> {
    const token = await getToken();
    if (!token) throw new Error("Not logged in");

    const uploadRes = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        bucket: "theme-backgrounds",
        fileName: params.fileName,
        fileBase64: params.fileBase64,
      }),
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.json();
      throw new Error(err.error ?? "Upload failed");
    }

    const { publicUrl } = await uploadRes.json();
    if (!publicUrl) throw new Error("Upload did not return public URL");
    return publicUrl as string;
  }

  async function handleAutoCutoutUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      e.target.value = "";
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      setAutoCutoutStatus("error");
      setAutoCutoutMessage("Not logged in");
      return;
    }

    const previewBlobUrl = URL.createObjectURL(file);
    setTheme((prev) => ({
      ...prev,
      motionSettings: {
        ...prev.motionSettings,
        backgroundImage: previewBlobUrl,
        subjectImage: "",
      },
    }));
    setDepthUploadStatus({ subjectImage: "uploading", midImage: "idle", backgroundImage: "uploading" });
    setAutoCutoutStatus("uploading");
    setAutoCutoutMessage("Uploading source image...");

    try {
      const MAX_BG_BYTES = 2 * 1024 * 1024;
      let backgroundBase64: string;
      let backgroundExt: string;

      if (file.size > MAX_BG_BYTES) {
        const resized = await resizeToFit(file, MAX_BG_BYTES);
        backgroundBase64 = resized.base64;
        backgroundExt = resized.mime === "image/jpeg" ? "jpg" : "png";
      } else {
        backgroundBase64 = await readBlobAsBase64(file);
        const rawExt = file.name.split(".").pop()?.toLowerCase();
        backgroundExt = rawExt && ["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(rawExt) ? rawExt : "jpg";
      }

      const backgroundFileName = `${userId}/theme-depth-auto-bg-${Date.now()}.${backgroundExt}`;
      const backgroundUrl = await uploadThemeAsset({
        fileBase64: backgroundBase64,
        fileName: backgroundFileName,
      });
      setTheme((prev) => ({
        ...prev,
        motionSettings: {
          ...prev.motionSettings,
          backgroundImage: backgroundUrl,
        },
      }));
      setDepthUploadStatus((prev) => ({ ...prev, backgroundImage: "idle" }));

      setAutoCutoutStatus("processing");
      setAutoCutoutMessage("Removing background...");

      const removeBgInput = await prepareRemoveBgInput(file);
      const removeForm = new FormData();
      removeForm.append("file", removeBgInput, removeBgInput.name);
      const cutoutRes = await fetch("/api/remove-bg", {
        method: "POST",
        body: removeForm,
      });

      if (!cutoutRes.ok) {
        const maybeJson = await cutoutRes.json().catch(() => null);
        throw new Error((maybeJson as { error?: string } | null)?.error ?? "Background removal failed");
      }

      const cutoutBlob = await cutoutRes.blob();
      if (cutoutBlob.size > 6 * 1024 * 1024) {
        throw new Error("Cutout result too large. Try a smaller image.");
      }
      const cutoutBase64 = await readBlobAsBase64(cutoutBlob);

      const subjectFileName = `${userId}/theme-depth-auto-subject-${Date.now()}.png`;
      const subjectUrl = await uploadThemeAsset({
        fileBase64: cutoutBase64,
        fileName: subjectFileName,
      });

      URL.revokeObjectURL(previewBlobUrl);
      setTheme((prev) => ({
        ...prev,
        motionSettings: {
          ...prev.motionSettings,
          backgroundImage: backgroundUrl,
          subjectImage: subjectUrl,
        },
      }));
      setDepthUploadStatus({ subjectImage: "idle", midImage: "idle", backgroundImage: "idle" });
      setAutoCutoutStatus("ready");
      setAutoCutoutMessage("Ready: both depth layers generated.");
    } catch (err) {
      console.error("handleAutoCutoutUpload:", err);
      setDepthUploadStatus((prev) => ({
        subjectImage: "error",
        midImage: prev.midImage,
        backgroundImage: prev.backgroundImage === "idle" ? "idle" : "error",
      }));
      setAutoCutoutStatus("error");
      setAutoCutoutMessage(err instanceof Error ? err.message : "Auto cutout failed");
    } finally {
      e.target.value = "";
    }
  }

  async function handleDepthLayerUpload(
    layer: "subjectImage" | "midImage" | "backgroundImage",
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      e.target.value = "";
      return;
    }

    setDepthUploadStatus((prev) => ({ ...prev, [layer]: "uploading" }));
    const blobUrl = URL.createObjectURL(file);
    setTheme((prev) => ({
      ...prev,
      motionSettings: { ...prev.motionSettings, [layer]: blobUrl },
    }));

    try {
      const token = await getToken();
      if (!token) throw new Error("Not logged in");

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("No user id");

      const MAX_BG_BYTES = 2 * 1024 * 1024;
      const MAX_SUBJECT_BYTES = 6 * 1024 * 1024;
      let base64: string;
      let mime: string;

      if (layer === "subjectImage") {
        setAutoCutoutStatus("processing");
        setAutoCutoutMessage("Removing background for subject...");

        const removeBgInput = await prepareRemoveBgInput(file);
        const removeForm = new FormData();
        removeForm.append("file", removeBgInput, removeBgInput.name);
        const cutoutRes = await fetch("/api/remove-bg", {
          method: "POST",
          body: removeForm,
        });

        if (!cutoutRes.ok) {
          const maybeJson = await cutoutRes.json().catch(() => null);
          throw new Error((maybeJson as { error?: string } | null)?.error ?? "Auto cutout failed for subject image");
        }

        const cutoutBlob = await cutoutRes.blob();
        const cutoutFile = new File([cutoutBlob], `cutout-${Date.now()}.png`, { type: "image/png" });

        if (cutoutFile.size > MAX_SUBJECT_BYTES) {
          ({ base64, mime } = await resizeToFitAlpha(cutoutFile, MAX_SUBJECT_BYTES));
        } else {
          mime = "image/png";
          base64 = await readBlobAsBase64(cutoutFile);
        }
      } else if (file.size > MAX_BG_BYTES) {
        ({ base64, mime } = await resizeToFit(file, MAX_BG_BYTES));
      } else {
        mime = file.type;
        base64 = await readBlobAsBase64(file);
      }

      const ext = layer === "subjectImage"
        ? (mime === "image/webp" ? "webp" : "png")
        : (mime === "image/jpeg" ? "jpg" : (file.name.split(".").pop()?.toLowerCase() ?? "jpg"));
      const layerSlug = layer === "subjectImage" ? "subject" : layer === "midImage" ? "mid" : "bg";
      const fileName = `${userId}/theme-depth-${layerSlug}-${Date.now()}.${ext}`;

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bucket: "theme-backgrounds", fileName, fileBase64: base64 }),
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error ?? "Upload failed");
      }

      const { publicUrl } = await uploadRes.json();
      URL.revokeObjectURL(blobUrl);
      setTheme((prev) => ({
        ...prev,
        motionSettings: { ...prev.motionSettings, [layer]: publicUrl },
      }));
      setDepthUploadStatus((prev) => ({ ...prev, [layer]: "idle" }));
      if (layer === "subjectImage") {
        setAutoCutoutStatus("ready");
        setAutoCutoutMessage("Ready: foreground cutout generated.");
      }
    } catch (err) {
      console.error("handleDepthLayerUpload:", err);
      setDepthUploadStatus((prev) => ({ ...prev, [layer]: "error" }));
      if (layer === "subjectImage") {
        setAutoCutoutStatus("error");
        setAutoCutoutMessage(err instanceof Error ? err.message : "Auto cutout failed for subject image");
      }
    }
  }

  function removeDepthLayer(layer: "subjectImage" | "midImage" | "backgroundImage") {
    setTheme((prev) => ({
      ...prev,
      motionSettings: { ...prev.motionSettings, [layer]: "" },
    }));
    setDepthUploadStatus((prev) => ({ ...prev, [layer]: "idle" }));
  }

  function removeBackground() {
    setTheme((prev) => ({
      ...prev,
      background: "",
      backgroundVideo: "",
      backgroundVideoPoster: "",
      backgroundVideoDuration: null,
      backgroundMediaType: "image",
    }));
    setUploadStatus("idle");
    setVideoUploadStatus("idle");
    setVideoUploadMessage("");
  }

  async function saveTheme() {
    // Require a real theme name — must differ from the default and contain at least one alphanumeric character
    const trimmedName = themeName.trim();
    if (!trimmedName || trimmedName.toLowerCase() === "my theme" || !/[a-z0-9]/i.test(trimmedName)) {
      setNameError("Give your theme a unique name before saving.");
      document.getElementById("theme-name-input")?.focus();
      return;
    }
    setNameError(null);

    if (
      uploadStatus === "uploading" ||
      videoUploadStatus === "validating" ||
      videoUploadStatus === "compressing" ||
      videoUploadStatus === "uploading" ||
      depthUploadStatus.subjectImage === "uploading" ||
      depthUploadStatus.midImage === "uploading" ||
      depthUploadStatus.backgroundImage === "uploading" ||
      autoCutoutStatus === "uploading" ||
      autoCutoutStatus === "processing"
    ) return;

    if (theme.background.startsWith("blob:")) {
      alert("Image upload failed — please re-select your image.");
      return;
    }

    if (theme.backgroundVideo.startsWith("blob:")) {
      alert("Video upload failed — please re-select your video.");
      return;
    }

    if (theme.motionSettings?.subjectImage?.startsWith("blob:") || theme.motionSettings?.midImage?.startsWith("blob:") || theme.motionSettings?.backgroundImage?.startsWith("blob:")) {
      alert("Depth layer upload is still local — please wait for upload or re-select image.");
      return;
    }

    const hasBackgroundMedia = Boolean(theme.background || theme.backgroundVideo);

    if (isPhotoAnimationType((theme.motion ? `${theme.motion}Motion` : null) as AnimationType | null) && !hasBackgroundMedia) {
      setSaveWarn("This motion requires a background image.");
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
      return;
    }

    if (theme.motion && !hasBackgroundMedia) {
      // Motion base layer will fallback to gradient — no hard stop needed
    }

    setSaveStatus("saving");
    setSaveWarn(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not logged in");

      // Treat $0 or blank as free (null base_price)
      const parsedPrice = price.trim() && Number(price) > 0 ? Number(price) : null;
      const parsedUpgradePrice = upgradePrice.trim() && Number(upgradePrice) > 0 ? Number(upgradePrice) : null;

      if (parsedPrice !== null && !Number.isFinite(parsedPrice)) {
        throw new Error("Invalid price");
      }
      if (parsedUpgradePrice !== null && !Number.isFinite(parsedUpgradePrice)) {
        throw new Error("Invalid upgrade price");
      }
      if (parsedUpgradePrice !== null && parsedPrice === null) {
        throw new Error("Upgrade price requires a base price");
      }

      const endpoint = editingThemeId
        ? `/api/themes/${encodeURIComponent(editingThemeId)}`
        : "/api/themes/create";

      const res = await fetch(endpoint, {
        method: editingThemeId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: themeName,
          category_id: categoryId || null,
          config: {
            ...theme,
            backgroundType: theme.motion ? "animation" : theme.backgroundType,
            motion: theme.motion,
            overlay: theme.overlay,
            lighting: theme.lighting,
            speed: theme.speed,
            intensity: theme.intensity,
          },
          price: parsedPrice,
          base_price: parsedPrice,
          upgrade_price: parsedUpgradePrice,
          is_public: isPublic && hasActiveStore,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error ?? "Save failed");
      }

      if (json.warning) {
        setSaveStatus("warn");
        setSaveWarn(json.warning);
        setTimeout(() => router.push("/dashboard/themebuilder"), 2500);
      } else {
        setSaveStatus("saved");
        setTimeout(() => router.push("/dashboard/themebuilder"), 900);
      }
    } catch (err) {
      console.error("saveTheme:", err);
      setSaveWarn(err instanceof Error ? err.message : "Save failed");
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  // Show nothing while gate check is in-flight (router.replace will fire on failure)
  if (!creatorGateChecked || !isCreator || loadingEdit) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      className={`
        text-white min-h-screen pb-32 md:pb-0
        transition-all duration-300 ease-out
        ${activePanel ? "md:pl-72" : "md:pl-0"}
      `}
    >

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/60 backdrop-blur-lg sticky top-14 md:top-[105px] z-50">
        <div className="flex items-center gap-2">
          <Link href="/dashboard/themebuilder" className="text-white/40 hover:text-white/70 transition p-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="text-sm font-medium">{editingThemeId ? "Edit Theme" : "New Theme"}</span>
          {theme.motion && (
            <span className="text-[10px] text-white/40 hidden sm:inline">· {MOTION_LABELS[theme.motion as keyof typeof MOTION_LABELS] ?? theme.motion}</span>
          )}
        </div>
        <button
          onClick={saveTheme}
          disabled={
            saveStatus === "saving" ||
            uploadStatus === "uploading" ||
            depthUploadStatus.subjectImage === "uploading" ||
            depthUploadStatus.backgroundImage === "uploading" ||
            autoCutoutStatus === "uploading" ||
            autoCutoutStatus === "processing"
          }
          className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition ${
            saveStatus === "saved" || saveStatus === "warn"
              ? "bg-green-500 text-black"
              : saveStatus === "error"
              ? "bg-red-500 text-white"
              : saveStatus === "saving" || uploadStatus === "uploading"
              ? "bg-white/15 text-white/40 cursor-not-allowed"
              : "bg-white text-black hover:bg-white/90"
          }`}
        >
          {saveStatus === "saving" ? "Saving…"
            : saveStatus === "saved" ? "✓ Saved"
            : saveStatus === "warn" ? "✓ Saved"
            : saveStatus === "error" ? "Failed"
            : editingThemeId ? "Save" : "Save"}
        </button>
      </div>

      {/* save warn */}
      {(saveStatus === "warn" || saveStatus === "error") && saveWarn && (
        <p className={`text-xs text-center py-1.5 ${saveStatus === "error" ? "text-red-400 bg-red-500/10" : "text-amber-400 bg-amber-500/10"}`}>{saveWarn}</p>
      )}

      {/* ── Preview Canvas ── */}
      <div className="relative flex items-start justify-center py-6 px-4">
        {/* Device toggle */}
        <div className="absolute top-3 right-4 flex items-center gap-1 bg-white/[0.06] rounded-lg p-1 z-10">
          <button
            onClick={() => setPreviewDevice("iphone")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${previewDevice === "iphone" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/60"}`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            iPhone
          </button>
          <button
            onClick={() => setPreviewDevice("desktop")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${previewDevice === "desktop" ? "bg-white/15 text-white" : "text-white/40 hover:text-white/60"}`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            Desktop
          </button>
        </div>

        {reducedMotionPref && (
          <div className="absolute top-14 left-4 right-4 z-10 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
            Reduced motion detected — preview movement is limited by your system setting.
          </div>
        )}

        {/* Preview IIFE */}
        {(() => {
          const tc = theme.textColor || "#fff";
          const muted = tc + "99";
          const cardBg = (() => {
            switch (theme.cardBgMode) {
              case "color": return theme.cardBackground || "#111111";
              case "gradient": return `linear-gradient(${theme.cardGradientDir || "to bottom right"}, ${theme.cardGradientFrom || "#1a1a2e"}, ${theme.cardGradientTo || "#16213e"})`;
              case "image": return theme.cardImage ? `url(${theme.cardImage}) center/cover no-repeat` : "rgba(255,255,255,0.04)";
              case "transparent": return "transparent";
              default: return "rgba(255,255,255,0.04)";
            }
          })();
          const cardBackdrop = theme.cardBgMode === "transparent" ? "none" : "blur(8px)";
          const inputBg = "rgba(255,255,255,0.07)";
          const border = "1px solid rgba(255,255,255,0.12)";
          const primary = theme.primaryColor || "#00ff99";
          const glowColor = primary;
          const hasBackgroundMedia = Boolean(theme.background || theme.backgroundVideo);
          const isVideoBackground = theme.backgroundMediaType === "video" && Boolean(theme.backgroundVideo);

          const previewContent = (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${theme.backgroundMediaType}-${theme.background}-${theme.backgroundVideo}-${theme.backgroundVideoPoster}-${theme.primaryColor}-${theme.cardBgMode}-${theme.cardBackground}-${theme.cardGradientFrom}-${theme.cardGradientTo}-${theme.cardGradientDir}-${theme.cardImage}-${theme.textColor}-${theme.backgroundType}-${theme.motion}-${theme.overlay}-${theme.lighting}-${theme.speed}-${theme.intensity}`}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="relative overflow-hidden"
                style={{
                  background: isVideoBackground ? "#060D1F" : theme.background ? `url(${theme.background}) center/cover no-repeat` : "#060D1F",
                  color: tc,
                }}
              >
                {isVideoBackground && (
                  <ThemeBackgroundVideo src={theme.backgroundVideo} poster={theme.backgroundVideoPoster || undefined} context="builder" motionType={theme.motion} speed={theme.speed} intensity={theme.intensity} motionSettings={theme.motionSettings} className="absolute inset-0 h-full w-full object-cover" />
                )}
                {isVideoBackground && theme.motion === "carousel3D" && (
                  <ThemeCarousel3D src={theme.backgroundVideo} mediaType="video" poster={theme.backgroundVideoPoster || undefined} speed={theme.speed ?? 5} className="absolute inset-0 w-full h-full" />
                )}
                <AnimationRenderer config={{ context: "builder", motion: theme.motion, overlay: theme.overlay, lighting: theme.lighting, intensity: theme.intensity, speed: theme.speed, background: theme.background, preserveUnderlyingMedia: isVideoBackground, motionSettings: theme.motionSettings }} />
                <div className="relative">
                  <div className="h-28 w-full bg-gradient-to-r from-purple-300/35 via-pink-200/25 to-amber-200/25" />
                  {hasBackgroundMedia && <div className="absolute inset-0 bg-black/50" />}
                  <div className="absolute inset-x-0 top-14 flex justify-center">
                    <motion.div animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }} className="h-20 w-20 rounded-2xl border flex items-center justify-center font-bold text-2xl" style={{ borderColor: "rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.15)", color: tc }}>C</motion.div>
                  </div>
                </div>
                <div className="relative px-5 pb-6">
                  {hasBackgroundMedia && <div className="absolute inset-0 bg-black/50 pointer-events-none" />}
                  <div className="relative z-10">
                    <div className="pt-12 text-center mb-5">
                      <p className="text-xl font-semibold" style={{ color: tc }}>DGO WORLD</p>
                      <p className="text-sm mt-0.5" style={{ color: muted }}>@born2win</p>
                      <p className="text-sm" style={{ color: muted }}>📍 Augusta, GA</p>
                    </div>
                    <motion.div
                      className="rounded-2xl overflow-hidden relative"
                      style={{ background: cardBg, backdropFilter: cardBackdrop, border, boxShadow: theme.animation === "glow" ? `0 0 28px ${glowColor}55, 0 0 8px ${glowColor}33` : undefined }}
                      animate={theme.animation === "pulse" ? { scale: [1, 1.015, 1] } : {}}
                      transition={theme.animation === "pulse" ? { repeat: Infinity, duration: 2, ease: "easeInOut" } : {}}
                    >
                      {theme.cardBgMode === "image" && theme.cardOverlay && (
                        <div className="absolute inset-0 pointer-events-none z-0" style={{ background: theme.cardOverlay }} />
                      )}
                      <div className="relative z-10 p-4">
                        <div className="flex justify-end mb-3">
                          <div className="h-8 w-8 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
                            <span className="text-emerald-300 font-semibold text-sm">$</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                          {[5, 10, 20].map((v, i) => (
                            <motion.button key={v} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 400, damping: 17 }} className="rounded-lg py-2.5 text-sm font-semibold text-center cursor-pointer" style={i === 0 ? { background: primary, color: "#000" } : { background: inputBg, border, color: tc }}>${v}</motion.button>
                          ))}
                        </div>
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 350, damping: 20 }} className="rounded-xl py-2.5 text-sm font-semibold text-center mb-3 cursor-pointer" style={{ background: inputBg, border, color: tc }}>Custom</motion.div>
                        <div className="text-xs font-medium mb-1.5" style={{ color: tc }}>Leave a note (optional)</div>
                        <motion.div whileHover={{ boxShadow: "0 0 0 2px rgba(255,255,255,0.15)" }} transition={{ duration: 0.15 }} className="rounded-xl px-3 py-2 text-xs mb-3 min-h-[48px]" style={{ background: inputBg, border, color: muted }}>Say something nice…</motion.div>
                        <div className="flex items-center justify-between rounded-xl p-2.5 mb-3" style={{ background: inputBg, border }}>
                          <span className="text-xs" style={{ color: tc }}>Send anonymously</span>
                          <div className="w-10 h-6 rounded-full bg-blue-500 relative flex-shrink-0"><div className="w-4 h-4 bg-white rounded-full absolute top-1 right-1" /></div>
                        </div>
                        <div className="rounded-xl p-3" style={{ background: inputBg, border }}>
                          <div className="flex items-center gap-2 mb-2.5">
                            <div className="w-7 h-7 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center flex-shrink-0">
                              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                            </div>
                            <div>
                              <div className="text-xs font-semibold" style={{ color: tc }}>Secure payment</div>
                              <div className="text-[10px]" style={{ color: muted }}>Powered by Stripe · 256-bit encryption</div>
                            </div>
                          </div>
                          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} transition={{ type: "spring", stiffness: 350, damping: 20 }} className="w-full rounded-xl py-2.5 text-sm font-semibold text-center cursor-pointer" style={{ background: primary, color: "#000", boxShadow: theme.animation === "glow" ? `0 0 20px ${glowColor}66` : theme.animation === "neon" ? `0 0 12px ${glowColor}88, 0 0 4px ${glowColor}` : undefined }}>Continue to payment</motion.div>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          );

          return (
            <AnimatePresence mode="wait" initial={false}>
              {previewDevice === "iphone" ? (
                <motion.div key="iphone-shell" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.2, ease: "easeOut" }} className="mx-auto" style={{ maxWidth: 320 }}>
                  <div className="relative rounded-[42px] border-[7px] border-[#2a2a2e] bg-[#1a1a1e] shadow-[0_0_0_1px_rgba(255,255,255,0.07),0_20px_60px_rgba(0,0,0,0.7)] overflow-hidden" style={{ minHeight: 620 }}>
                    <div className="absolute top-0 inset-x-0 z-20 flex justify-center pt-2 pointer-events-none"><div className="w-24 h-6 bg-[#1a1a1e] rounded-b-2xl" /></div>
                    <div className="absolute -left-[9px] top-24 w-1.5 h-8 bg-[#2a2a2e] rounded-l-sm" />
                    <div className="absolute -left-[9px] top-36 w-1.5 h-12 bg-[#2a2a2e] rounded-l-sm" />
                    <div className="absolute -left-[9px] top-52 w-1.5 h-12 bg-[#2a2a2e] rounded-l-sm" />
                    <div className="absolute -right-[9px] top-32 w-1.5 h-16 bg-[#2a2a2e] rounded-r-sm" />
                    <div className="overflow-y-auto" style={{ maxHeight: 620 }}><div className="pt-6">{previewContent}</div></div>
                    <div className="absolute bottom-2 inset-x-0 flex justify-center pointer-events-none"><div className="w-24 h-1 bg-white/30 rounded-full" /></div>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="desktop-shell" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.2, ease: "easeOut" }} className="w-full max-w-lg mx-auto">
                  <div className="rounded-t-xl border border-white/10 bg-[#1c1c24] px-3 py-2 flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/70" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                      <div className="w-3 h-3 rounded-full bg-green-500/70" />
                    </div>
                    <div className="flex-1 bg-white/[0.06] rounded-md px-3 py-1 text-[11px] text-white/30 font-mono truncate">tiplink.io/@born2win</div>
                  </div>
                  <div className="border-x border-b border-white/10 rounded-b-xl overflow-hidden">{previewContent}</div>
                </motion.div>
              )}
            </AnimatePresence>
          );
        })()}
      </div>

      {/* ── Desktop Sidebar ── */}
      {activePanel && (
        <div
          onClick={() => setActivePanel(null)}
          className="hidden md:block fixed inset-0 z-30"
        />
      )}
      <aside
        className={`
          hidden md:flex md:flex-col
          md:fixed md:left-0
          md:top-[105px]
          md:h-[calc(100vh-105px)]
          md:w-72
          md:bg-[#080C15]/95
          md:backdrop-blur-xl
          md:border-r md:border-white/10
          md:z-40
          md:transform md:transition-all md:duration-300 md:ease-out
          ${activePanel ? "md:translate-x-0 opacity-100" : "md:-translate-x-full opacity-0"}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tab nav */}
        <div className="flex-shrink-0 flex border-b border-white/[0.08]">
          {([
            { id: "style",    icon: "🎨", label: "Style" },
            { id: "motion",   icon: "🎞",  label: "Motion" },
            { id: "effects",  icon: "✨",  label: "FX" },
            { id: "lighting", icon: "💡",  label: "Light" },
            { id: "advanced", icon: "⚙️",  label: "More" },
          ] as const).map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => setActivePanel(id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition border-b-2 -mb-px ${
                activePanel === id ? "text-white border-white bg-white/[0.04]" : "text-white/40 border-transparent hover:text-white/60"
              }`}
            >
              <span className="text-sm leading-none">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
        {activePanel === "motion" && theme.motion && (
          <div className="px-4 py-1.5 bg-white/[0.03] border-b border-white/[0.06] text-[10px] text-white/40 flex-shrink-0">
            Applying: {MOTION_LABELS[theme.motion as keyof typeof MOTION_LABELS]}
          </div>
        )}
        {/* Panel content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* STYLE */}
          {activePanel === "style" && (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/30 mb-2">Theme Name</p>
                <input id="theme-name-input" type="text" value={themeName}
                  onChange={(e) => { setThemeName(e.target.value); if (nameError) setNameError(null); }}
                  placeholder="e.g. Neon Night, Clean & Bold…" maxLength={100}
                  className={`w-full p-2.5 rounded-xl bg-black border text-white text-sm outline-none transition ${nameError ? "border-red-500" : "border-white/10 focus:border-white/30"}`} />
                {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/30 mb-2">Category</p>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={categoriesLoading}
                  className="w-full p-2.5 rounded-xl bg-black border border-white/10 text-white text-sm outline-none focus:border-white/30 transition disabled:opacity-60">
                  <option value="">Auto detect / none</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/30 mb-3">Colors</p>
                <div className="space-y-3">
                  {([{ label: "Primary (buttons)", field: "primaryColor" }, { label: "Text", field: "textColor" }] as { label: string; field: keyof ThemeState }[]).map(({ label, field }) => (
                    <div key={field} className="flex items-center justify-between gap-3">
                      <label className="text-sm text-white/60 flex-1">{label}</label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-white/30">{String(theme[field])}</span>
                        <input type="color" value={String(theme[field])} onChange={(e) => update(field, e.target.value)} className="w-9 h-9 rounded-lg cursor-pointer border border-white/10 bg-transparent" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/30 mb-3">Card Background</p>
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {(["color", "gradient", "image", "transparent"] as CardBgMode[]).map((mode) => (
                    <button key={mode} onClick={() => setTheme((prev) => ({ ...prev, cardBgMode: mode }))} className={`px-3 py-1.5 text-xs rounded-lg capitalize transition font-medium ${theme.cardBgMode === mode ? "bg-white text-black" : "bg-white/10 text-white/60 hover:bg-white/15"}`}>{mode}</button>
                  ))}
                </div>
                {theme.cardBgMode === "color" && (
                  <div className="flex items-center gap-3">
                    <input type="color" value={theme.cardBackground || "#111111"} onChange={(e) => update("cardBackground", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent flex-shrink-0" />
                    <input type="text" value={theme.cardBackground || "#111111"} onChange={(e) => update("cardBackground", e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-black border border-white/10 text-white/80 text-xs font-mono outline-none focus:border-white/20" />
                  </div>
                )}
                {theme.cardBgMode === "gradient" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <input type="color" value={theme.cardGradientFrom || "#1a1a2e"} onChange={(e) => update("cardGradientFrom", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent flex-shrink-0" />
                      <span className="text-xs text-white/40">From</span>
                      <input type="color" value={theme.cardGradientTo || "#16213e"} onChange={(e) => update("cardGradientTo", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent flex-shrink-0" />
                      <span className="text-xs text-white/40">To</span>
                    </div>
                    <div className="h-6 rounded-lg w-full" style={{ background: `linear-gradient(${theme.cardGradientDir || "to bottom right"}, ${theme.cardGradientFrom || "#1a1a2e"}, ${theme.cardGradientTo || "#16213e"})` }} />
                    <select value={theme.cardGradientDir || "to bottom right"} onChange={(e) => update("cardGradientDir", e.target.value)} className="w-full p-2.5 rounded-xl bg-black border border-white/10 text-white text-xs outline-none">
                      <option value="to right">← Left → Right</option>
                      <option value="to bottom">↓ Top → Bottom</option>
                      <option value="to bottom right">↘ Diagonal</option>
                      <option value="to top right">↗ Diagonal up</option>
                    </select>
                  </div>
                )}
                {theme.cardBgMode === "image" && (
                  <div className="space-y-3">
                    {theme.cardImage && (
                      <div className="h-16 w-full rounded-xl bg-cover bg-center relative overflow-hidden border border-white/10" style={{ backgroundImage: `url(${theme.cardImage})` }}>
                        <button onClick={() => update("cardImage", "")} className="absolute top-1 right-1 text-[10px] bg-black/60 text-white/60 px-2 py-0.5 rounded">Remove</button>
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl bg-black border border-white/10 text-xs text-white/60 hover:border-white/20">
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 8.25V21h18V8.25M15.75 3.75H8.25A2.25 2.25 0 006 6v1.5" /></svg>
                      {theme.cardImage ? "Change image" : "Upload card image"}
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        try {
                          const { base64, mime } = await resizeToFit(file, 1.5 * 1024 * 1024);
                          const token = await getToken(); if (!token) return;
                          const { data: sessionData } = await supabase.auth.getSession();
                          const userId = sessionData.session?.user.id; if (!userId) return;
                          const ext = mime === "image/jpeg" ? "jpg" : (file.name.split(".").pop()?.toLowerCase() ?? "png");
                          const fileName = `${userId}/theme-card-${Date.now()}.${ext}`;
                          const uploadRes = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ bucket: "theme-backgrounds", fileName, fileBase64: base64 }) });
                          const uploadData = await uploadRes.json();
                          if (!uploadRes.ok) throw new Error(uploadData.error ?? "Upload failed");
                          if (uploadData.publicUrl) update("cardImage", uploadData.publicUrl);
                        } catch { update("cardImage", URL.createObjectURL(file)); }
                      }} />
                    </label>
                    <div className="flex items-center gap-3">
                      <input type="color" value={theme.cardOverlay ? theme.cardOverlay.slice(0, 7) : "#000000"} onChange={(e) => update("cardOverlay", e.target.value + "80")} className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent flex-shrink-0" />
                      <span className="text-xs text-white/40">Overlay tint</span>
                      {theme.cardOverlay && <button onClick={() => update("cardOverlay", "")} className="ml-auto text-[10px] text-white/30 hover:text-white/60">Clear</button>}
                    </div>
                  </div>
                )}
                {theme.cardBgMode === "transparent" && <p className="text-[10px] text-white/30">Card is fully transparent — your page background shows through.</p>}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/30 mb-2">Card Animation</p>
                <div className="grid grid-cols-4 gap-2">
                  {([{ v: "none", label: "None" }, { v: "glow", label: "✨ Glow" }, { v: "pulse", label: "💓 Pulse" }, { v: "neon", label: "⚡ Neon" }] as const).map(({ v, label }) => (
                    <button key={v} onClick={() => setTheme((prev) => ({ ...prev, animation: v }))} className={`px-2 py-2 rounded-xl text-xs font-medium transition border ${theme.animation === v ? "bg-white text-black border-transparent" : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"}`}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* MOTION */}
          {activePanel === "motion" && (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/30 mb-3">Background Media</p>
                <div className="flex gap-1.5 mb-3">
                  {(["image", "video"] as const).map((mode) => (
                    <button key={mode} type="button"
                      onClick={() => setTheme((prev) => {
                        const currentMotion = prev.motion;
                        if (mode === "video") return { ...prev, backgroundMediaType: mode, motion: currentMotion && isVideoMotion(currentMotion) ? currentMotion : "videoTilt" as MotionType };
                        return { ...prev, backgroundMediaType: mode, motion: currentMotion && !isVideoMotion(currentMotion) ? currentMotion : "bounce" };
                      })}
                      className={`px-3 py-1.5 text-xs rounded-lg capitalize transition font-medium ${theme.backgroundMediaType === mode ? "bg-white text-black" : "bg-white/10 text-white/60 hover:bg-white/15"}`}>{mode}</button>
                  ))}
                </div>
                {theme.backgroundMediaType === "image" && (
                  <>
                    <input type="file" accept="image/*" disabled={uploadStatus === "uploading"} onChange={handleImageUpload} className="w-full text-xs text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/15 disabled:opacity-40 transition" />
                    {uploadStatus === "uploading" && <p className="text-[11px] text-blue-400 animate-pulse mt-1">Uploading image...</p>}
                    {uploadStatus === "error" && <p className="text-[11px] text-red-400 mt-1">Upload failed — re-select</p>}
                    {theme.background && uploadStatus === "idle" && (
                      <div className="flex items-center gap-3 mt-2 p-2 rounded-xl bg-white/5">
                        <img src={theme.background} alt="bg" className="w-12 h-12 rounded-lg object-cover border border-white/10 flex-shrink-0" />
                        <div><p className="text-[10px] text-green-400 mb-1">✓ Stored</p><button onClick={removeBackground} className="text-xs text-red-400 hover:text-red-300 transition">Remove</button></div>
                      </div>
                    )}
                  </>
                )}
                {theme.backgroundMediaType === "video" && (
                  <>
                    <input type="file" accept={THEME_VIDEO_RULES.allowedMimeTypes.join(",")} disabled={videoUploadStatus === "validating" || videoUploadStatus === "compressing" || videoUploadStatus === "uploading"} onChange={handleVideoUpload} className="w-full text-xs text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/15 disabled:opacity-40 transition" />
                    <p className="mt-1 text-[10px] text-white/40">Videos longer than {THEME_VIDEO_RULES.targetDurationSeconds}s are auto-trimmed. Videos above {THEME_VIDEO_RULES.maxLongestEdgePx}p are auto-resized.</p>
                    {videoUploadStatus !== "idle" && <p className={`text-[11px] mt-1 ${videoUploadStatus === "error" ? "text-red-400" : "text-blue-400 animate-pulse"}`}>{videoUploadMessage || "Processing..."}</p>}
                    {theme.backgroundVideo && (
                      <div className="mt-2 p-2 rounded-xl bg-white/5 space-y-2">
                        <video src={theme.backgroundVideo} poster={theme.backgroundVideoPoster || undefined} muted loop autoPlay playsInline className="w-full h-28 rounded-lg object-cover border border-white/10" />
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] text-white/45">{theme.backgroundVideoDuration ? `Loop: ${theme.backgroundVideoDuration.toFixed(1)}s max` : "Loop ready"}</p>
                          <button onClick={removeBackground} className="text-xs text-red-400 hover:text-red-300 transition">Remove</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/30 mb-3">{theme.backgroundMediaType === "video" ? "Video Motion" : "Image Motion"}</p>
                <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1">
                  <button type="button" onClick={() => setTheme((prev) => ({ ...prev, motion: null, backgroundType: "static" }))}
                    className={`min-w-[72px] flex-shrink-0 snap-start p-3 rounded-xl border text-xs font-medium text-center transition ${!theme.motion ? "border-white/50 bg-white/12 text-white ring-1 ring-white/25" : "border-white/10 bg-white/5 text-white/55 hover:bg-white/8"}`}
                  >None</button>
                  {(theme.backgroundMediaType === "video" ? VIDEO_MOTION_OPTIONS : IMAGE_MOTION_OPTIONS).map((motionOption) => {
                    const selected = theme.motion === motionOption;
                    return (
                      <button key={motionOption} type="button"
                        onClick={() => setTheme((prev) => ({ ...prev, motion: motionOption, backgroundType: "animation" }))}
                        className={`min-w-[88px] flex-shrink-0 snap-start p-3 rounded-xl border text-xs font-medium text-center transition leading-tight ${selected ? "border-white/50 bg-white/12 text-white ring-1 ring-white/25" : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:border-white/20"}`}
                      >
                        {MOTION_LABELS[motionOption]}
                      </button>
                    );
                  })}
                </div>
              </div>
              {theme.motion === "heartRain" && (
                <div className="space-y-2 border border-white/10 rounded-xl p-3 bg-white/5">
                  <p className="text-xs text-white/50">Heart Color</p>
                  <div className="grid grid-cols-4 gap-2">
                    {(["pink", "red", "purple", "white"] as const).map((c) => {
                      const labels = { pink: "💖 Pink", red: "❤️ Red", purple: "💜 Purple", white: "🤍 White" };
                      return <button key={c} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, color: c } }))} className={theme.motionSettings?.color === c ? "px-2 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-2 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{labels[c]}</button>;
                    })}
                  </div>
                </div>
              )}
              {theme.motion === "ripple" && (
                <div className="space-y-2 border border-white/10 rounded-xl p-3 bg-white/5">
                  <p className="text-xs text-white/50">Ripple Intensity</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([{ k: "soft", l: "🌫️ Soft" }, { k: "medium", l: "🌊 Medium" }, { k: "strong", l: "⚡ Strong" }] as const).map(({ k, l }) => (
                      <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, rippleIntensity: k } }))} className={(theme.motionSettings?.rippleIntensity ?? "medium") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                    ))}
                  </div>
                </div>
              )}
              {theme.motion === "waterDistortion" && (
                <div className="space-y-2 border border-white/10 rounded-xl p-3 bg-white/5">
                  <p className="text-xs text-white/50">Water Intensity</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([{ k: "soft", l: "🌫️ Soft" }, { k: "medium", l: "💧 Medium" }, { k: "strong", l: "🌊 Strong" }] as const).map(({ k, l }) => (
                      <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, waterIntensity: k } }))} className={(theme.motionSettings?.waterIntensity ?? "medium") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                    ))}
                  </div>
                </div>
              )}
              {theme.motion === "vortexTunnel" && (
                <div className="space-y-2 border border-white/10 rounded-xl p-3 bg-white/5">
                  <p className="text-xs text-white/50">Vortex Style</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([{ k: "slow", l: "🌙 Slow" }, { k: "fast", l: "⚡ Fast" }, { k: "falling", l: "🌀 Falling" }] as const).map(({ k, l }) => (
                      <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, vortexStyle: k } }))} className={(theme.motionSettings?.vortexStyle ?? "slow") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                    ))}
                  </div>
                </div>
              )}
              {theme.motion === "videoShakeClub" && (
                <div className="space-y-3 border border-white/10 rounded-xl p-3 bg-white/5">
                  <div>
                    <p className="text-xs text-white/50 mb-2">Beat Frequency</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([{ k: "slow", l: "🐢 Slow" }, { k: "normal", l: "🎵 Normal" }, { k: "fast", l: "⚡ Fast" }] as const).map(({ k, l }) => (
                        <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, clubBeat: k } }))} className={(theme.motionSettings?.clubBeat ?? "normal") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-white/50 mb-2">Flash Mode</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([{ k: "off", l: "Off" }, { k: "white", l: "White" }, { k: "club", l: "Club RGB" }] as const).map(({ k, l }) => (
                        <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, clubFlashMode: k } }))} className={(theme.motionSettings?.clubFlashMode ?? "club") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {theme.motion === "rainGlass" && (
                <div className="border border-white/10 rounded-xl p-3 bg-white/5">
                  <p className="text-xs text-white/50 mb-2">Rain Glass Style</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([{ k: "drizzle", l: "🌫️ Drizzle" }, { k: "storm", l: "⛈️ Storm" }, { k: "neon", l: "🌆 Neon" }] as const).map(({ k, l }) => (
                      <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, rainGlassStyle: k } }))} className={(theme.motionSettings?.rainGlassStyle ?? "drizzle") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                    ))}
                  </div>
                </div>
              )}
              {(theme.motion === "depth3D" || theme.motion === "layeredPopOut" || theme.motion === "multiLayerPop" || theme.motion === "vortexTunnel") && (
                <div className="space-y-3 border border-white/10 rounded-xl p-3 bg-white/5">
                  <div>
                    <p className="text-xs text-white/50">Depth Layer Assets</p>
                    <p className="text-[10px] text-white/30 mt-0.5">Upload separated layers for cinematic depth.</p>
                  </div>
                  <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-2.5">
                    <label className="text-[11px] text-white/60 block">Auto-generate both layers (single upload)</label>
                    <input type="file" accept="image/*" disabled={autoCutoutStatus === "uploading" || autoCutoutStatus === "processing"} onChange={handleAutoCutoutUpload} className="w-full text-xs text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-indigo-500/25 file:text-indigo-100 hover:file:bg-indigo-500/35 disabled:opacity-40 transition" />
                    {autoCutoutStatus !== "idle" && (
                      <p className={`text-[10px] ${autoCutoutStatus === "error" ? "text-red-400" : autoCutoutStatus === "ready" ? "text-emerald-400" : "text-blue-400"}`}>{autoCutoutMessage}</p>
                    )}
                  </div>
                  {([{ key: "subjectImage", label: "Foreground Subject" }, { key: "midImage", label: "Mid Layer" }, { key: "backgroundImage", label: "Background Layer" }] as const).map(({ key, label }) => {
                    const slotStatus = depthUploadStatus[key]; const previewUrl = theme.motionSettings?.[key];
                    return (
                      <div key={key} className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] text-white/60">{label}</label>
                          {slotStatus === "uploading" && <span className="text-[10px] text-blue-400 animate-pulse">Uploading…</span>}
                          {slotStatus === "error" && <span className="text-[10px] text-red-400">Failed</span>}
                          {slotStatus === "idle" && previewUrl && <span className="text-[10px] text-emerald-400">Stored</span>}
                        </div>
                        <input type="file" accept="image/*" disabled={slotStatus === "uploading"} onChange={(e) => handleDepthLayerUpload(key, e)} className="w-full text-xs text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/15 disabled:opacity-40 transition" />
                        {previewUrl && (
                          <div className="flex items-center gap-3 rounded-lg bg-white/5 p-2">
                            <img src={previewUrl} alt={`${key} preview`} className="h-12 w-12 flex-shrink-0 rounded-lg border border-white/10 object-cover" />
                            <button type="button" onClick={() => removeDepthLayer(key)} className="text-xs text-red-400 hover:text-red-300 transition">Remove</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* EFFECTS */}
          {activePanel === "effects" && (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/30 mb-3">Overlay Effects</p>
                <div className="space-y-2">
                  {([null, "dust", "sparkle", "lightRain", "smoke", "fire"] as Array<OverlayType | null>).map((overlayOption) => {
                    const selected = theme.overlay === overlayOption;
                    return (
                      <button key={overlayOption ?? "none"} type="button"
                        onClick={() => setTheme((prev) => ({ ...prev, overlay: overlayOption as OverlayType | null }))}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition ${selected ? "border-white/50 bg-white/12 text-white" : "border-white/10 bg-black text-white/65 hover:bg-white/8"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span>{overlayOption === null ? "None" : OVERLAY_LABELS[overlayOption]}</span>
                          {selected && <span className="text-[10px] text-emerald-300">ON</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              {theme.overlay === "lightRain" && (
                <div className="border border-white/10 rounded-xl p-3 bg-white/5">
                  <p className="text-xs text-white/50 mb-2">Rain Style</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([{ k: "soft", l: "Soft" }, { k: "storm", l: "Storm" }, { k: "luxury", l: "Luxury" }] as const).map(({ k, l }) => (
                      <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, rainStyle: k } }))} className={`rounded-md border px-2 py-1.5 text-[11px] transition ${(theme.motionSettings?.rainStyle ?? "soft") === k ? "border-white/45 bg-white/15 text-white" : "border-white/10 bg-black text-white/60 hover:bg-white/8"}`}>{l}</button>
                    ))}
                  </div>
                </div>
              )}
              {theme.overlay === "fire" && (
                <div className="border border-white/10 rounded-xl p-3 bg-white/5">
                  <p className="text-xs text-white/50 mb-2">Fire Style</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([{ k: "embers", l: "Embers" }, { k: "flameEdge", l: "Flame Edge" }, { k: "sparks", l: "Sparks" }] as const).map(({ k, l }) => (
                      <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, fireStyle: k } }))} className={`rounded-md border px-2 py-1.5 text-[11px] transition ${(theme.motionSettings?.fireStyle ?? "embers") === k ? "border-white/45 bg-white/15 text-white" : "border-white/10 bg-black text-white/60 hover:bg-white/8"}`}>{l}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LIGHTING */}
          {activePanel === "lighting" && (
            <div className="space-y-4">
              <p className="text-[11px] uppercase tracking-wider text-white/30">Lighting</p>
              <div className="grid grid-cols-3 gap-3">
                {([null, "sweep", "glow"] as Array<LightingType | null>).map((lightOption) => (
                  <button key={lightOption ?? "none"} type="button"
                    onClick={() => setTheme((prev) => ({ ...prev, lighting: lightOption as LightingType | null }))}
                    className={`px-2 py-3 rounded-xl border text-xs font-medium transition ${theme.lighting === lightOption ? "border-white/50 bg-white/12 text-white" : "border-white/10 bg-black text-white/65 hover:bg-white/8"}`}
                  >
                    {lightOption === null ? "None" : LIGHTING_LABELS[lightOption]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ADVANCED */}
          {activePanel === "advanced" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <div className="flex justify-between"><label className="text-xs text-white/50">Speed</label><span className="text-xs text-white/30">{theme.speed}/10</span></div>
                <input type="range" min={1} max={10} value={theme.speed} onChange={(e) => setTheme((prev) => ({ ...prev, speed: Number(e.target.value) }))} className="w-full accent-white/70" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><label className="text-xs text-white/50">Intensity</label><span className="text-xs text-white/30">{theme.intensity}/10</span></div>
                <input type="range" min={1} max={10} value={theme.intensity} onChange={(e) => setTheme((prev) => ({ ...prev, intensity: Number(e.target.value) }))} className="w-full accent-white/70" />
              </div>
              <div className="border-t border-white/10 pt-4 space-y-4">
                <p className="text-[11px] uppercase tracking-wider text-white/30">Monetization</p>
                <div className="space-y-1.5">
                  <label className="text-sm text-white/60">Full Price (USD)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-white/30 text-sm">$</span>
                    <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00 = free" className="flex-1 p-2.5 rounded-xl bg-black border border-white/10 text-white text-sm outline-none focus:border-white/30 transition" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-white/60">Upgrade Price (USD, optional)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-white/30 text-sm">$</span>
                    <input type="number" min="0" step="0.01" value={upgradePrice} onChange={(e) => setUpgradePrice(e.target.value)} placeholder="Optional" className="flex-1 p-2.5 rounded-xl bg-black border border-white/10 text-white text-sm outline-none focus:border-white/30 transition" />
                  </div>
                </div>
                <div>
                  <label className={`flex items-center gap-3 ${hasActiveStore ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                    <div onClick={() => { if (hasActiveStore) setIsPublic((v) => !v); }} className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${!hasActiveStore ? "bg-white/5" : isPublic ? "bg-emerald-500" : "bg-white/10"}`}>
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isPublic && hasActiveStore ? "translate-x-4" : "translate-x-0.5"}`} />
                    </div>
                    <span className="text-sm text-white/60">List in Theme Store</span>
                    {!hasActiveStore && <span className="text-[10px] text-amber-400/80">🔒 Store required</span>}
                  </label>
                </div>
              </div>
            </div>
          )}

        </div>
      </aside>

      {/* ── Slide-up Panels (mobile only) ── */}
      <div className="md:hidden">
      <AnimatePresence>
        {activePanel && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            className="fixed bottom-[74px] left-0 right-0 z-50 bg-[#0B1220] border-t border-white/10 rounded-t-3xl max-h-[72vh] overflow-y-auto"
          >
            {/* Panel header */}
            <div className="sticky top-0 bg-[#0B1220]/95 backdrop-blur z-10 px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/[0.06]">
              <div>
                <p className="text-sm font-semibold">
                  {activePanel === "style" ? "🎨 Style" : activePanel === "motion" ? "🎞 Motion" : activePanel === "effects" ? "✨ Effects" : activePanel === "lighting" ? "💡 Lighting" : "⚙️ Advanced"}
                </p>
                {activePanel === "motion" && theme.motion && (
                  <p className="text-[10px] text-white/40 mt-0.5">Applying: {MOTION_LABELS[theme.motion as keyof typeof MOTION_LABELS]}</p>
                )}
              </div>
              <button onClick={() => setActivePanel(null)} className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 transition text-xs font-semibold">✕</button>
            </div>

            <div className="p-5 space-y-5">

              {/* ═══════════ STYLE PANEL ═══════════ */}
              {activePanel === "style" && (
                <div className="space-y-5">
                  {/* Theme name */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/30 mb-2">Theme Name</p>
                    <input
                      id="theme-name-input"
                      type="text"
                      value={themeName}
                      onChange={(e) => { setThemeName(e.target.value); if (nameError) setNameError(null); }}
                      placeholder="e.g. Neon Night, Clean & Bold…"
                      maxLength={100}
                      className={`w-full p-2.5 rounded-xl bg-black border text-white text-sm outline-none transition ${nameError ? "border-red-500" : "border-white/10 focus:border-white/30"}`}
                    />
                    {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
                  </div>

                  {/* Category */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/30 mb-2">Category</p>
                    <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={categoriesLoading} className="w-full p-2.5 rounded-xl bg-black border border-white/10 text-white text-sm outline-none focus:border-white/30 transition disabled:opacity-60">
                      <option value="">Auto detect / none</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Colors */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/30 mb-3">Colors</p>
                    <div className="space-y-3">
                      {([
                        { label: "Primary (buttons)", field: "primaryColor" },
                        { label: "Text", field: "textColor" },
                      ] as { label: string; field: keyof ThemeState }[]).map(({ label, field }) => (
                        <div key={field} className="flex items-center justify-between gap-3">
                          <label className="text-sm text-white/60 flex-1">{label}</label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-white/30">{String(theme[field])}</span>
                            <input type="color" value={String(theme[field])} onChange={(e) => update(field, e.target.value)} className="w-9 h-9 rounded-lg cursor-pointer border border-white/10 bg-transparent" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Card Background */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/30 mb-3">Card Background</p>
                    <div className="flex gap-1.5 flex-wrap mb-3">
                      {(["color", "gradient", "image", "transparent"] as CardBgMode[]).map((mode) => (
                        <button key={mode} onClick={() => setTheme((prev) => ({ ...prev, cardBgMode: mode }))} className={`px-3 py-1.5 text-xs rounded-lg capitalize transition font-medium ${theme.cardBgMode === mode ? "bg-white text-black" : "bg-white/10 text-white/60 hover:bg-white/15"}`}>{mode}</button>
                      ))}
                    </div>
                    {theme.cardBgMode === "color" && (
                      <div className="flex items-center gap-3">
                        <input type="color" value={theme.cardBackground || "#111111"} onChange={(e) => update("cardBackground", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent flex-shrink-0" />
                        <input type="text" value={theme.cardBackground || "#111111"} onChange={(e) => update("cardBackground", e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-black border border-white/10 text-white/80 text-xs font-mono outline-none focus:border-white/20" />
                      </div>
                    )}
                    {theme.cardBgMode === "gradient" && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <input type="color" value={theme.cardGradientFrom || "#1a1a2e"} onChange={(e) => update("cardGradientFrom", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent flex-shrink-0" />
                          <span className="text-xs text-white/40">From</span>
                          <input type="color" value={theme.cardGradientTo || "#16213e"} onChange={(e) => update("cardGradientTo", e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent flex-shrink-0" />
                          <span className="text-xs text-white/40">To</span>
                        </div>
                        <div className="h-6 rounded-lg w-full" style={{ background: `linear-gradient(${theme.cardGradientDir || "to bottom right"}, ${theme.cardGradientFrom || "#1a1a2e"}, ${theme.cardGradientTo || "#16213e"})` }} />
                        <select value={theme.cardGradientDir || "to bottom right"} onChange={(e) => update("cardGradientDir", e.target.value)} className="w-full p-2.5 rounded-xl bg-black border border-white/10 text-white text-xs outline-none">
                          <option value="to right">← Left → Right</option>
                          <option value="to bottom">↓ Top → Bottom</option>
                          <option value="to bottom right">↘ Diagonal</option>
                          <option value="to top right">↗ Diagonal up</option>
                        </select>
                      </div>
                    )}
                    {theme.cardBgMode === "image" && (
                      <div className="space-y-3">
                        {theme.cardImage && (
                          <div className="h-16 w-full rounded-xl bg-cover bg-center relative overflow-hidden border border-white/10" style={{ backgroundImage: `url(${theme.cardImage})` }}>
                            <button onClick={() => update("cardImage", "")} className="absolute top-1 right-1 text-[10px] bg-black/60 text-white/60 px-2 py-0.5 rounded">Remove</button>
                          </div>
                        )}
                        <label className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl bg-black border border-white/10 text-xs text-white/60 hover:border-white/20">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 8.25V21h18V8.25M15.75 3.75H8.25A2.25 2.25 0 006 6v1.5" /></svg>
                          {theme.cardImage ? "Change image" : "Upload card image"}
                          <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const { base64, mime } = await resizeToFit(file, 1.5 * 1024 * 1024);
                              const token = await getToken();
                              if (!token) return;
                              const { data: sessionData } = await supabase.auth.getSession();
                              const userId = sessionData.session?.user.id;
                              if (!userId) return;
                              const ext = mime === "image/jpeg" ? "jpg" : (file.name.split(".").pop()?.toLowerCase() ?? "png");
                              const fileName = `${userId}/theme-card-${Date.now()}.${ext}`;
                              const uploadRes = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ bucket: "theme-backgrounds", fileName, fileBase64: base64 }) });
                              const uploadData = await uploadRes.json();
                              if (!uploadRes.ok) throw new Error(uploadData.error ?? "Upload failed");
                              if (uploadData.publicUrl) update("cardImage", uploadData.publicUrl);
                            } catch { update("cardImage", URL.createObjectURL(file)); }
                          }} />
                        </label>
                        <div className="flex items-center gap-3">
                          <input type="color" value={theme.cardOverlay ? theme.cardOverlay.slice(0, 7) : "#000000"} onChange={(e) => update("cardOverlay", e.target.value + "80")} className="w-10 h-10 rounded-lg cursor-pointer border border-white/10 bg-transparent flex-shrink-0" />
                          <span className="text-xs text-white/40">Overlay tint</span>
                          {theme.cardOverlay && <button onClick={() => update("cardOverlay", "")} className="ml-auto text-[10px] text-white/30 hover:text-white/60">Clear</button>}
                        </div>
                      </div>
                    )}
                    {theme.cardBgMode === "transparent" && <p className="text-[10px] text-white/30">Card is fully transparent — your page background shows through.</p>}
                  </div>

                  {/* Card animation */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/30 mb-2">Card Animation</p>
                    <div className="grid grid-cols-4 gap-2">
                      {([{ v: "none", label: "None" }, { v: "glow", label: "✨ Glow" }, { v: "pulse", label: "💓 Pulse" }, { v: "neon", label: "⚡ Neon" }] as const).map(({ v, label }) => (
                        <button key={v} onClick={() => setTheme((prev) => ({ ...prev, animation: v }))} className={`px-2 py-2 rounded-xl text-xs font-medium transition border ${theme.animation === v ? "bg-white text-black border-transparent" : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"}`}>{label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════ MOTION PANEL ═══════════ */}
              {activePanel === "motion" && (
                <div className="space-y-5">
                  {/* Background media */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/30 mb-3">Background Media</p>
                    <div className="flex gap-1.5 mb-3">
                      {(["image", "video"] as const).map((mode) => (
                        <button key={mode} type="button"
                          onClick={() => setTheme((prev) => {
                            const currentMotion = prev.motion;
                            if (mode === "video") return { ...prev, backgroundMediaType: mode, motion: currentMotion && isVideoMotion(currentMotion) ? currentMotion : "videoTilt" as MotionType };
                            return { ...prev, backgroundMediaType: mode, motion: currentMotion && !isVideoMotion(currentMotion) ? currentMotion : "bounce" };
                          })}
                          className={`px-3 py-1.5 text-xs rounded-lg capitalize transition font-medium ${theme.backgroundMediaType === mode ? "bg-white text-black" : "bg-white/10 text-white/60 hover:bg-white/15"}`}>{mode}</button>
                      ))}
                    </div>
                    {theme.backgroundMediaType === "image" && (
                      <>
                        <input type="file" accept="image/*" disabled={uploadStatus === "uploading"} onChange={handleImageUpload} className="w-full text-xs text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/15 disabled:opacity-40 transition" />
                        {uploadStatus === "uploading" && <p className="text-[11px] text-blue-400 animate-pulse mt-1">Uploading image...</p>}
                        {uploadStatus === "error" && <p className="text-[11px] text-red-400 mt-1">Upload failed — re-select</p>}
                        {theme.background && uploadStatus === "idle" && (
                          <div className="flex items-center gap-3 mt-2 p-2 rounded-xl bg-white/5">
                            <img src={theme.background} alt="bg" className="w-12 h-12 rounded-lg object-cover border border-white/10 flex-shrink-0" />
                            <div><p className="text-[10px] text-green-400 mb-1">✓ Stored</p><button onClick={removeBackground} className="text-xs text-red-400 hover:text-red-300 transition">Remove</button></div>
                          </div>
                        )}
                      </>
                    )}
                    {theme.backgroundMediaType === "video" && (
                      <>
                        <input type="file" accept={THEME_VIDEO_RULES.allowedMimeTypes.join(",")} disabled={videoUploadStatus === "validating" || videoUploadStatus === "compressing" || videoUploadStatus === "uploading"} onChange={handleVideoUpload} className="w-full text-xs text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/15 disabled:opacity-40 transition" />
                        <p className="mt-1 text-[10px] text-white/40">Videos longer than {THEME_VIDEO_RULES.targetDurationSeconds}s are auto-trimmed on upload. Videos above {THEME_VIDEO_RULES.maxLongestEdgePx}p are auto-resized.</p>
                        {videoUploadStatus !== "idle" && <p className={`text-[11px] mt-1 ${videoUploadStatus === "error" ? "text-red-400" : "text-blue-400 animate-pulse"}`}>{videoUploadMessage || "Processing..."}</p>}
                        {theme.backgroundVideo && (
                          <div className="mt-2 p-2 rounded-xl bg-white/5 space-y-2">
                            <video src={theme.backgroundVideo} poster={theme.backgroundVideoPoster || undefined} muted loop autoPlay playsInline className="w-full h-28 rounded-lg object-cover border border-white/10" />
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] text-white/45">{theme.backgroundVideoDuration ? `Loop: ${theme.backgroundVideoDuration.toFixed(1)}s max` : "Loop ready"}</p>
                              <button onClick={removeBackground} className="text-xs text-red-400 hover:text-red-300 transition">Remove</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Motion selector — horizontal snap scroll */}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/30 mb-3">
                      {theme.backgroundMediaType === "video" ? "Video Motion" : "Image Motion"}
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1">
                      <button type="button"
                        onClick={() => setTheme((prev) => ({ ...prev, motion: null, backgroundType: "static" }))}
                        className={`min-w-[72px] flex-shrink-0 snap-start p-3 rounded-xl border text-xs font-medium text-center transition ${!theme.motion ? "border-white/50 bg-white/12 text-white ring-1 ring-white/25" : "border-white/10 bg-white/5 text-white/55 hover:bg-white/8"}`}
                      >None</button>
                      {(theme.backgroundMediaType === "video" ? VIDEO_MOTION_OPTIONS : IMAGE_MOTION_OPTIONS).map((motionOption) => {
                        const selected = theme.motion === motionOption;
                        return (
                          <button key={motionOption} type="button"
                            onClick={() => setTheme((prev) => ({ ...prev, motion: motionOption, backgroundType: "animation" }))}
                            className={`min-w-[88px] flex-shrink-0 snap-start p-3 rounded-xl border text-xs font-medium text-center transition leading-tight ${selected ? "border-white/50 bg-white/12 text-white ring-1 ring-white/25" : "border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:border-white/20"}`}
                          >
                            {MOTION_LABELS[motionOption]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Per-motion sub-settings */}
                  {theme.motion === "heartRain" && (
                    <div className="space-y-2 border border-white/10 rounded-xl p-3 bg-white/5">
                      <p className="text-xs text-white/50">Heart Color</p>
                      <div className="grid grid-cols-4 gap-2">
                        {(["pink", "red", "purple", "white"] as const).map((c) => {
                          const labels = { pink: "💖 Pink", red: "❤️ Red", purple: "💜 Purple", white: "🤍 White" };
                          return <button key={c} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, color: c } }))} className={theme.motionSettings?.color === c ? "px-2 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-2 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{labels[c]}</button>;
                        })}
                      </div>
                    </div>
                  )}
                  {theme.motion === "ripple" && (
                    <div className="space-y-2 border border-white/10 rounded-xl p-3 bg-white/5">
                      <p className="text-xs text-white/50">Ripple Intensity</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([{ k: "soft", l: "🌫️ Soft" }, { k: "medium", l: "🌊 Medium" }, { k: "strong", l: "⚡ Strong" }] as const).map(({ k, l }) => (
                          <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, rippleIntensity: k } }))} className={(theme.motionSettings?.rippleIntensity ?? "medium") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {theme.motion === "waterDistortion" && (
                    <div className="space-y-2 border border-white/10 rounded-xl p-3 bg-white/5">
                      <p className="text-xs text-white/50">Water Intensity</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([{ k: "soft", l: "🌫️ Soft" }, { k: "medium", l: "💧 Medium" }, { k: "strong", l: "🌊 Strong" }] as const).map(({ k, l }) => (
                          <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, waterIntensity: k } }))} className={(theme.motionSettings?.waterIntensity ?? "medium") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {theme.motion === "vortexTunnel" && (
                    <div className="space-y-2 border border-white/10 rounded-xl p-3 bg-white/5">
                      <p className="text-xs text-white/50">Vortex Style</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([{ k: "slow", l: "🌙 Slow" }, { k: "fast", l: "⚡ Fast" }, { k: "falling", l: "🌀 Falling" }] as const).map(({ k, l }) => (
                          <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, vortexStyle: k } }))} className={(theme.motionSettings?.vortexStyle ?? "slow") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {theme.motion === "videoShakeClub" && (
                    <div className="space-y-3 border border-white/10 rounded-xl p-3 bg-white/5">
                      <div>
                        <p className="text-xs text-white/50 mb-2">Beat Frequency</p>
                        <div className="grid grid-cols-3 gap-2">
                          {([{ k: "slow", l: "🐢 Slow" }, { k: "normal", l: "🎵 Normal" }, { k: "fast", l: "⚡ Fast" }] as const).map(({ k, l }) => (
                            <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, clubBeat: k } }))} className={(theme.motionSettings?.clubBeat ?? "normal") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-white/50 mb-2">Flash Mode</p>
                        <div className="grid grid-cols-3 gap-2">
                          {([{ k: "off", l: "Off" }, { k: "white", l: "White" }, { k: "club", l: "Club RGB" }] as const).map(({ k, l }) => (
                            <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, clubFlashMode: k } }))} className={(theme.motionSettings?.clubFlashMode ?? "club") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {theme.motion === "rainGlass" && (
                    <div className="border border-white/10 rounded-xl p-3 bg-white/5">
                      <p className="text-xs text-white/50 mb-2">Rain Glass Style</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([{ k: "drizzle", l: "🌫️ Drizzle" }, { k: "storm", l: "⛈️ Storm" }, { k: "neon", l: "🌆 Neon" }] as const).map(({ k, l }) => (
                          <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, rainGlassStyle: k } }))} className={(theme.motionSettings?.rainGlassStyle ?? "drizzle") === k ? "px-3 py-2 rounded-lg border border-white/60 bg-white/15 text-white text-xs" : "px-3 py-2 rounded-lg border border-white/10 bg-black text-white/60 text-xs hover:border-white/25"}>{l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {(theme.motion === "depth3D" || theme.motion === "layeredPopOut" || theme.motion === "multiLayerPop" || theme.motion === "vortexTunnel") && (
                    <div className="space-y-3 border border-white/10 rounded-xl p-3 bg-white/5">
                      <div>
                        <p className="text-xs text-white/50">Depth Layer Assets</p>
                        <p className="text-[10px] text-white/30 mt-0.5">Upload separated layers for cinematic depth.</p>
                      </div>
                      <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-2.5">
                        <label className="text-[11px] text-white/60 block">Auto-generate both layers (single upload)</label>
                        <input type="file" accept="image/*" disabled={autoCutoutStatus === "uploading" || autoCutoutStatus === "processing"} onChange={handleAutoCutoutUpload} className="w-full text-xs text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-indigo-500/25 file:text-indigo-100 hover:file:bg-indigo-500/35 disabled:opacity-40 transition" />
                        {autoCutoutStatus !== "idle" && (
                          <p className={`text-[10px] ${autoCutoutStatus === "error" ? "text-red-400" : autoCutoutStatus === "ready" ? "text-emerald-400" : "text-blue-400"}`}>{autoCutoutMessage}</p>
                        )}
                      </div>
                      {([
                        { key: "subjectImage", label: "Foreground Subject" },
                        { key: "midImage", label: "Mid Layer" },
                        { key: "backgroundImage", label: "Background Layer" },
                      ] as const).map(({ key, label }) => {
                        const slotStatus = depthUploadStatus[key];
                        const previewUrl = theme.motionSettings?.[key];
                        return (
                          <div key={key} className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-2.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] text-white/60">{label}</label>
                              {slotStatus === "uploading" && <span className="text-[10px] text-blue-400 animate-pulse">Uploading…</span>}
                              {slotStatus === "error" && <span className="text-[10px] text-red-400">Failed</span>}
                              {slotStatus === "idle" && previewUrl && <span className="text-[10px] text-emerald-400">Stored</span>}
                            </div>
                            <input type="file" accept="image/*" disabled={slotStatus === "uploading"} onChange={(e) => handleDepthLayerUpload(key, e)} className="w-full text-xs text-white/50 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/15 disabled:opacity-40 transition" />
                            {previewUrl && (
                              <div className="flex items-center gap-3 rounded-lg bg-white/5 p-2">
                                <img src={previewUrl} alt={`${key} preview`} className="h-12 w-12 flex-shrink-0 rounded-lg border border-white/10 object-cover" />
                                <button type="button" onClick={() => removeDepthLayer(key)} className="text-xs text-red-400 hover:text-red-300 transition">Remove</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════ EFFECTS PANEL ═══════════ */}
              {activePanel === "effects" && (
                <div className="space-y-5">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/30 mb-3">Overlay Effects</p>
                    <div className="space-y-2">
                      {([null, "dust", "sparkle", "lightRain", "smoke", "fire"] as Array<OverlayType | null>).map((overlayOption) => {
                        const selected = theme.overlay === overlayOption;
                        return (
                          <button key={overlayOption ?? "none"} type="button"
                            onClick={() => setTheme((prev) => ({ ...prev, overlay: overlayOption as OverlayType | null }))}
                            className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition ${selected ? "border-white/50 bg-white/12 text-white" : "border-white/10 bg-black text-white/65 hover:bg-white/8"}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span>{overlayOption === null ? "None" : OVERLAY_LABELS[overlayOption]}</span>
                              {selected && <span className="text-[10px] text-emerald-300">ON</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {theme.overlay === "lightRain" && (
                    <div className="border border-white/10 rounded-xl p-3 bg-white/5">
                      <p className="text-xs text-white/50 mb-2">Rain Style</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([{ k: "soft", l: "Soft" }, { k: "storm", l: "Storm" }, { k: "luxury", l: "Luxury" }] as const).map(({ k, l }) => (
                          <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, rainStyle: k } }))} className={`rounded-md border px-2 py-1.5 text-[11px] transition ${(theme.motionSettings?.rainStyle ?? "soft") === k ? "border-white/45 bg-white/15 text-white" : "border-white/10 bg-black text-white/60 hover:bg-white/8"}`}>{l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {theme.overlay === "fire" && (
                    <div className="border border-white/10 rounded-xl p-3 bg-white/5">
                      <p className="text-xs text-white/50 mb-2">Fire Style</p>
                      <div className="grid grid-cols-3 gap-2">
                        {([{ k: "embers", l: "Embers" }, { k: "flameEdge", l: "Flame Edge" }, { k: "sparks", l: "Sparks" }] as const).map(({ k, l }) => (
                          <button key={k} type="button" onClick={() => setTheme((prev) => ({ ...prev, motionSettings: { ...prev.motionSettings, fireStyle: k } }))} className={`rounded-md border px-2 py-1.5 text-[11px] transition ${(theme.motionSettings?.fireStyle ?? "embers") === k ? "border-white/45 bg-white/15 text-white" : "border-white/10 bg-black text-white/60 hover:bg-white/8"}`}>{l}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════ LIGHTING PANEL ═══════════ */}
              {activePanel === "lighting" && (
                <div className="space-y-4">
                  <p className="text-[11px] uppercase tracking-wider text-white/30">Lighting</p>
                  <div className="grid grid-cols-3 gap-3">
                    {([null, "sweep", "glow"] as Array<LightingType | null>).map((lightOption) => (
                      <button key={lightOption ?? "none"} type="button"
                        onClick={() => setTheme((prev) => ({ ...prev, lighting: lightOption as LightingType | null }))}
                        className={`px-2 py-3 rounded-xl border text-xs font-medium transition ${theme.lighting === lightOption ? "border-white/50 bg-white/12 text-white" : "border-white/10 bg-black text-white/65 hover:bg-white/8"}`}
                      >
                        {lightOption === null ? "None" : LIGHTING_LABELS[lightOption]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ═══════════ ADVANCED PANEL ═══════════ */}
              {activePanel === "advanced" && (
                <div className="space-y-5">
                  {/* Speed */}
                  <div className="space-y-2">
                    <div className="flex justify-between"><label className="text-xs text-white/50">Speed</label><span className="text-xs text-white/30">{theme.speed}/10</span></div>
                    <input type="range" min={1} max={10} value={theme.speed} onChange={(e) => setTheme((prev) => ({ ...prev, speed: Number(e.target.value) }))} className="w-full accent-white/70" />
                  </div>
                  {/* Intensity */}
                  <div className="space-y-2">
                    <div className="flex justify-between"><label className="text-xs text-white/50">Intensity</label><span className="text-xs text-white/30">{theme.intensity}/10</span></div>
                    <input type="range" min={1} max={10} value={theme.intensity} onChange={(e) => setTheme((prev) => ({ ...prev, intensity: Number(e.target.value) }))} className="w-full accent-white/70" />
                  </div>

                  <div className="border-t border-white/10 pt-4 space-y-4">
                    <p className="text-[11px] uppercase tracking-wider text-white/30">Monetization</p>
                    <div className="space-y-1.5">
                      <label className="text-sm text-white/60">Full Price (USD)</label>
                      <div className="flex items-center gap-2">
                        <span className="text-white/30 text-sm">$</span>
                        <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00 = free" className="flex-1 p-2.5 rounded-xl bg-black border border-white/10 text-white text-sm outline-none focus:border-white/30 transition" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm text-white/60">Upgrade Price (USD, optional)</label>
                      <div className="flex items-center gap-2">
                        <span className="text-white/30 text-sm">$</span>
                        <input type="number" min="0" step="0.01" value={upgradePrice} onChange={(e) => setUpgradePrice(e.target.value)} placeholder="Optional" className="flex-1 p-2.5 rounded-xl bg-black border border-white/10 text-white text-sm outline-none focus:border-white/30 transition" />
                      </div>
                    </div>
                    <div>
                      <label className={`flex items-center gap-3 ${hasActiveStore ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                        <div onClick={() => { if (hasActiveStore) setIsPublic((v) => !v); }} className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${!hasActiveStore ? "bg-white/5" : isPublic ? "bg-emerald-500" : "bg-white/10"}`}>
                          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isPublic && hasActiveStore ? "translate-x-4" : "translate-x-0.5"}`} />
                        </div>
                        <span className="text-sm text-white/60">List in Theme Store</span>
                        {!hasActiveStore && <span className="text-[10px] text-amber-400/80">🔒 Store required</span>}
                      </label>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* ── Bottom Dock (mobile only) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-black/85 backdrop-blur-xl border-t border-white/10 md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="flex justify-around items-center py-2 px-2 max-w-lg mx-auto">
          {([
            { id: "style",    icon: "🎨", label: "Style" },
            { id: "motion",   icon: "🎞",  label: "Motion" },
            { id: "effects",  icon: "✨",  label: "Effects" },
            { id: "lighting", icon: "💡",  label: "Lighting" },
            { id: "advanced", icon: "⚙️",  label: "More" },
          ] as const).map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => setActivePanel(activePanel === id ? null : id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition min-w-[52px] ${activePanel === id ? "text-white bg-white/10" : "text-white/50 hover:text-white/80"}`}
            >
              <span className="text-xl leading-none">{icon}</span>
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

