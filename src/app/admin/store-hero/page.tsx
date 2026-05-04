"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { getAdminHeaders, getAdminSession } from "@/lib/auth/adminSession";
import AnimationEngine from "@/components/theme/AnimationEngine";

type HeroMotion = "particlesSoft" | "moneyRain" | "heartbeat";
type HeroOverlay = "smoke" | "sparkle" | "dust";
type HeroLighting = "glow" | null;

type HeroAd = {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  cta_label: string;
  cta_href: string;
  cta_external: boolean;
  accent: string;
  motion: HeroMotion;
  overlay: HeroOverlay;
  lighting: HeroLighting;
  image_url: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  created_at: string;
};

type DraftAd = Omit<HeroAd, "id" | "created_at">;

const DEFAULT_DRAFT: DraftAd = {
  title: "",
  subtitle: "",
  badge: "Ad",
  cta_label: "Learn More",
  cta_href: "/store",
  cta_external: false,
  accent: "#22d3ee",
  motion: "particlesSoft",
  overlay: "smoke",
  lighting: "glow",
  image_url: null,
  is_active: true,
  starts_at: null,
  ends_at: null,
  sort_order: 0,
};

function toDraft(ad: HeroAd): DraftAd {
  return {
    title: ad.title,
    subtitle: ad.subtitle,
    badge: ad.badge,
    cta_label: ad.cta_label,
    cta_href: ad.cta_href,
    cta_external: ad.cta_external,
    accent: ad.accent,
    motion: ad.motion,
    overlay: ad.overlay,
    lighting: ad.lighting,
    image_url: ad.image_url,
    is_active: ad.is_active,
    starts_at: ad.starts_at,
    ends_at: ad.ends_at,
    sort_order: ad.sort_order,
  };
}

function toLocalInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function resizeImageFile(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Failed to get canvas context")); return; }

        const targetRatio = 1920 / 480;
        const imgRatio = img.width / img.height;
        let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;

        if (imgRatio > targetRatio) {
          srcW = Math.round(img.height * targetRatio);
          srcX = Math.round((img.width - srcW) / 2);
        } else {
          srcH = Math.round(img.width / targetRatio);
          srcY = Math.round((img.height - srcH) / 2);
        }

        canvas.width = 1920;
        canvas.height = 480;
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, 1920, 480);

        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error("Canvas to blob failed")); return; }
            const resized = new File([blob], file.name.replace(/\.[^/.]+$/, ".webp"), { type: "image/webp" });
            if (resized.size > 8 * 1024 * 1024) {
              canvas.toBlob(
                (compressedBlob) => {
                  if (!compressedBlob) { reject(new Error("Compression failed")); return; }
                  const compressed = new File([compressedBlob], resized.name, { type: "image/webp" });
                  resolve(compressed);
                },
                "image/webp",
                0.75
              );
            } else {
              resolve(resized);
            }
          },
          "image/webp",
          0.85
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

// ─── Mini live preview ────────────────────────────────────────────────────────
function HeroPreview({ ad }: { ad: DraftAd }) {
  return (
    <div className="relative h-40 rounded-xl overflow-hidden bg-[#0B1220]">
      {/* Background image */}
      {ad.image_url && (
        <img src={ad.image_url} alt="background" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <AnimationEngine
        config={{
          motion: ad.motion,
          overlay: ad.overlay,
          lighting: ad.lighting,
          background: ad.image_url ?? undefined,
        }}
      />
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute bottom-3 left-3 right-3">
        <p className="text-[10px] text-white/60 uppercase tracking-wide">{ad.badge || "Badge"}</p>
        <p className="text-sm font-semibold leading-tight mt-0.5">{ad.title || "Campaign title"}</p>
        {ad.subtitle && <p className="text-xs text-white/60 mt-0.5">{ad.subtitle}</p>}
        <button
          className="mt-2 px-3 py-1 text-black text-xs font-medium rounded-lg"
          style={{ background: ad.accent }}
        >
          {ad.cta_label || "CTA"}
        </button>
      </div>
    </div>
  );
}

// ─── Grouped form editor ──────────────────────────────────────────────────────
const inputCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30 transition";
const selectCls =
  "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/30 transition";
const sectionLabel = "text-[10px] uppercase tracking-widest text-white/40 pt-4";

function AdEditor({
  ad,
  onChange,
  onUpload,
  uploading,
}: {
  ad: DraftAd;
  onChange: (next: DraftAd) => void;
  onUpload?: (file: File) => Promise<void>;
  uploading: boolean;
}) {
  function setField<K extends keyof DraftAd>(key: K, value: DraftAd[K]) {
    onChange({ ...ad, [key]: value });
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    try {
      const resized = await resizeImageFile(file);
      await onUpload(resized);
      e.target.value = "";
    } catch (err) {
      console.error("Image resize failed:", err);
    }
  }

  return (
    <div className="space-y-2">

      {/* Content */}
      <p className={sectionLabel}>Content</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className={inputCls} placeholder="Title *" value={ad.title} onChange={(e) => setField("title", e.target.value)} />
        <input className={inputCls} placeholder="Badge" value={ad.badge} onChange={(e) => setField("badge", e.target.value)} />
        <input
          className={inputCls + " md:col-span-2"}
          placeholder="Subtitle"
          value={ad.subtitle}
          onChange={(e) => setField("subtitle", e.target.value)}
        />
      </div>

      {/* CTA */}
      <p className={sectionLabel}>Call to Action</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input className={inputCls} placeholder="Button label" value={ad.cta_label} onChange={(e) => setField("cta_label", e.target.value)} />
        <input className={inputCls} placeholder="Button link" value={ad.cta_href} onChange={(e) => setField("cta_href", e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-white/60 md:col-span-2">
          <input type="checkbox" checked={ad.cta_external} onChange={(e) => setField("cta_external", e.target.checked)} />
          Open link in new tab
        </label>
      </div>

      {/* Visual */}
      <p className={sectionLabel}>Visual</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          className={inputCls}
          placeholder="Accent colour #hex"
          value={ad.accent}
          onChange={(e) => setField("accent", e.target.value)}
        />
        <select className={selectCls} value={ad.motion} onChange={(e) => setField("motion", e.target.value as HeroMotion)}>
          <option value="particlesSoft">Motion: particlesSoft</option>
          <option value="moneyRain">Motion: moneyRain</option>
          <option value="heartbeat">Motion: heartbeat</option>
        </select>
        <select className={selectCls} value={ad.overlay} onChange={(e) => setField("overlay", e.target.value as HeroOverlay)}>
          <option value="smoke">Overlay: smoke</option>
          <option value="sparkle">Overlay: sparkle</option>
          <option value="dust">Overlay: dust</option>
        </select>
        <select
          className={selectCls}
          value={ad.lighting ?? "none"}
          onChange={(e) => setField("lighting", e.target.value === "none" ? null : (e.target.value as HeroLighting))}
        >
          <option value="none">Lighting: none</option>
          <option value="glow">Lighting: glow</option>
        </select>

        <div className="md:col-span-2 space-y-2">
          {onUpload && (
            <div>
              <p className="text-xs text-white/40 mb-2">Background image (auto-resizes to 1920×480)</p>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer flex-1">
                  <div className="px-4 py-3 rounded-xl bg-white/10 border-2 border-dashed border-white/20 text-center text-xs text-white/50 hover:bg-white/15 hover:border-white/30 transition">
                    {uploading ? "Uploading…" : "Click to upload or drag image"}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={onFileChange} disabled={uploading} />
                </label>
              </div>
              {ad.image_url && (
                <div className="mt-3 rounded-lg overflow-hidden border border-white/10">
                  <img src={ad.image_url} alt="preview" className="w-full h-auto max-h-40 object-cover" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scheduling */}
      <p className={sectionLabel}>Scheduling</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-xs text-white/40">Starts at</p>
          <input
            type="datetime-local"
            className={inputCls}
            value={toLocalInputValue(ad.starts_at)}
            onChange={(e) => {
              const value = e.target.value;
              setField("starts_at", value ? new Date(value).toISOString() : null);
            }}
          />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-white/40">Ends at</p>
          <input
            type="datetime-local"
            className={inputCls}
            value={toLocalInputValue(ad.ends_at)}
            onChange={(e) => {
              const value = e.target.value;
              setField("ends_at", value ? new Date(value).toISOString() : null);
            }}
          />
        </div>
        <input
          type="number"
          className={inputCls}
          value={ad.sort_order}
          onChange={(e) => setField("sort_order", Number(e.target.value) || 0)}
          placeholder="Sort order (lower = first)"
        />
        <label className="flex items-center gap-2 text-sm text-white/60">
          <input type="checkbox" checked={ad.is_active} onChange={(e) => setField("is_active", e.target.checked)} />
          Campaign active
        </label>
      </div>

    </div>
  );
}

// ─── Existing campaign card ───────────────────────────────────────────────────
function AdCard({
  ad,
  busy,
  onSave,
  onDelete,
  onUpload,
  cardId,
}: {
  ad: HeroAd;
  busy: boolean;
  onSave: (next: DraftAd) => Promise<void>;
  onDelete: () => void;
  onUpload: (file: File, draft: DraftAd) => Promise<void>;
  cardId: string;
}) {
  const [draft, setDraft] = useState<DraftAd>(toDraft(ad));
  const [expanded, setExpanded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(toDraft(ad));
    setSaveState("idle");
  }, [ad]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (statusResetRef.current) clearTimeout(statusResetRef.current);
    };
  }, []);

  function formatDate(value?: string | null, short = false) {
    if (!value) return short ? "Now" : "No start date";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Invalid";
    return short ? d.toLocaleDateString() : d.toLocaleString();
  }

  function formatRange(start?: string | null, end?: string | null, short = true) {
    const startText = start ? formatDate(start, short) : "Now";
    const endText = end ? formatDate(end, short) : "∞";
    return `${startText} → ${endText}`;
  }

  const rangeShort = formatRange(ad.starts_at, ad.ends_at, true);
  const rangeFull = formatRange(ad.starts_at, ad.ends_at, false);

  function handleChange(next: DraftAd) {
    setDraft(next);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (statusResetRef.current) clearTimeout(statusResetRef.current);

    setSaveState("saving");

    debounceRef.current = setTimeout(async () => {
      try {
        await onSave(next);
        setSaveState("saved");
        statusResetRef.current = setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("idle");
      }
    }, 600);
  }

  return (
    <article id={cardId} className="rounded-2xl border border-white/10 bg-[#0d1117] overflow-hidden scroll-mt-6">

      {/* Preview banner — click to expand */}
      <div
        className="relative h-32 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <AnimationEngine
          config={{
            motion: draft.motion,
            overlay: draft.overlay,
            lighting: draft.lighting,
            background: draft.image_url ?? undefined,
          }}
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute bottom-2 left-3 right-3">
          <p className="text-[10px] text-white/50 uppercase tracking-wide">{draft.badge}</p>
          <p className="text-sm font-semibold leading-tight">{draft.title || "(no title)"}</p>
          {draft.subtitle && <p className="text-xs text-white/50">{draft.subtitle}</p>}
        </div>
        <div className="absolute top-2 right-3 flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">
            {rangeShort}
          </span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              draft.is_active ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/50"
            }`}
          >
            {draft.is_active ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className={`p-5 space-y-4 border-t border-white/10 transition ${saveState === "saving" ? "opacity-70" : "opacity-100"}`}>
          <div className="text-xs text-white/50">
            <span className="text-white/30">Schedule:</span>{" "}
            <span className="text-cyan-300">{rangeFull}</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-white/30">Auto-saving</span>
            <span
              className={`transition ${
                saveState === "saving"
                  ? "text-yellow-400"
                  : saveState === "saved"
                  ? "text-green-400"
                  : "text-white/30"
              }`}
            >
              {saveState === "saving" && "Saving..."}
              {saveState === "saved" && "Saved ✓"}
              {saveState === "idle" && ""}
            </span>
          </div>

          {/* Live preview of current edits */}
          <HeroPreview ad={draft} />

          <AdEditor ad={draft} onChange={handleChange} onUpload={(file) => onUpload(file, draft)} uploading={busy} />

          <div className="flex gap-2">
            <button
              onClick={() => handleChange({ ...draft, is_active: !draft.is_active })}
              disabled={busy}
              className="flex-1 bg-white text-black py-3 rounded-xl text-sm font-medium disabled:opacity-50 transition"
            >
              Toggle Active
            </button>
            <button
              onClick={onDelete}
              disabled={busy}
              className="px-4 py-3 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
            >
              Delete
            </button>
          </div>
        </div>
      )}

    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminStoreHeroPage() {
  const [ads, setAds] = useState<HeroAd[]>([]);
  const [draft, setDraft] = useState<DraftAd>(DEFAULT_DRAFT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    const session = getAdminSession();
    if (!session) { window.location.href = "/admin/login"; return; }
    void loadAds();
  }, []);

  async function loadAds() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store/hero-ads", { headers: getAdminHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setAds(json.ads ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hero ads");
    } finally {
      setLoading(false);
    }
  }

  async function createAd() {
    if (!draft.title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/store/hero-ads", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create");
      setAds((prev) => [json.ad, ...prev]);
      setDraft(DEFAULT_DRAFT);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create ad");
    } finally {
      setSaving(false);
    }
  }

  async function updateAd(id: string, next: DraftAd) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/store/hero-ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAdminHeaders() },
        body: JSON.stringify({
          id,
          ...next,
          starts_at: next.starts_at ?? null,
          ends_at: next.ends_at ?? null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update");
      setAds((prev) => prev.map((ad) => {
        if (ad.id !== id) return ad;
        const responseAd = (json.ad ?? {}) as Partial<HeroAd>;
        return {
          ...ad,
          ...responseAd,
          starts_at: responseAd.starts_at ?? next.starts_at ?? ad.starts_at,
          ends_at: responseAd.ends_at ?? next.ends_at ?? ad.ends_at,
        };
      }));
      await loadAds();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update ad");
    } finally {
      setBusyId(null);
    }
  }

  async function removeAd(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/store/hero-ads?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete");
      setAds((prev) => prev.filter((ad) => ad.id !== id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete ad");
    } finally {
      setBusyId(null);
    }
  }

  async function uploadImage(id: string, file: File, draftOverride?: DraftAd) {
    if (file.size > 8 * 1024 * 1024) { setError("Image must be under 8 MB"); return; }
    setBusyId(id);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/admin/store/hero-ads/upload", {
        method: "POST",
        headers: getAdminHeaders(),
        body: formData,
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.error ?? "Upload failed");
      const current = ads.find((ad) => ad.id === id);
      if (!current) throw new Error("Ad not found");
      const baseDraft = draftOverride ?? toDraft(current);
      await updateAd(id, { ...baseDraft, image_url: uploadJson.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload image");
    } finally {
      setBusyId(null);
    }
  }

  async function uploadDraftImage(file: File) {
    if (file.size > 8 * 1024 * 1024) { setError("Image must be under 8 MB"); return; }
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/admin/store/hero-ads/upload", {
        method: "POST",
        headers: getAdminHeaders(),
        body: formData,
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.error ?? "Upload failed");
      setDraft((prev) => ({ ...prev, image_url: uploadJson.url }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload image");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Store Hero Campaigns</h1>
          <p className="text-sm text-white/50 mt-1">Manage featured campaigns shown on the store page</p>
        </div>
        <span className="text-xs text-white/30">{ads.length} campaign{ads.length !== 1 ? "s" : ""}</span>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Create panel + live preview */}
      <section className="grid md:grid-cols-2 gap-4 items-start">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <p className="text-sm font-semibold">Create Campaign</p>
          <AdEditor ad={draft} onChange={setDraft} onUpload={uploadDraftImage} uploading={saving} />
          <button
            onClick={createAd}
            disabled={saving}
            className="w-full bg-white text-black py-3 rounded-xl text-sm font-medium disabled:opacity-50 transition hover:bg-white/90"
          >
            {saving ? "Creating…" : "Create Campaign"}
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0B1220] p-4 space-y-3 sticky top-6">
          <p className="text-xs text-white/40">Live Preview</p>
          <HeroPreview ad={draft} />
          <div className="text-[10px] text-white/30 space-y-0.5">
            <p>Motion: {draft.motion} · Overlay: {draft.overlay} · Lighting: {draft.lighting ?? "none"}</p>
            <p>
              Accent:{" "}
              <span style={{ color: draft.accent }} className="font-mono">
                {draft.accent}
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Campaign list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white/70">Existing Campaigns</p>
          {!loading && ads.length > 0 && (
            <p className="text-xs text-white/30">Click any card to edit</p>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((k) => (
              <div key={k} className="h-32 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : ads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-sm text-white/30 text-center">
            No campaigns yet — create one above.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ads.map((ad) => (
              <AdCard
                key={ad.id}
                cardId={`campaign-${ad.id}`}
                ad={ad}
                busy={busyId === ad.id}
                onSave={(next) => updateAd(ad.id, next)}
                onDelete={() => setDeleteTarget({ id: ad.id, title: ad.title })}
                onUpload={(file, nextDraft) => uploadImage(ad.id, file, nextDraft)}
              />
            ))}
          </div>
        )}
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1220] p-5 space-y-4">
            <h3 className="text-lg font-semibold">Delete Campaign?</h3>
            <p className="text-sm text-white/70">
              This will permanently delete <span className="font-semibold text-white">{deleteTarget.title || "this ad"}</span>.
            </p>
            <p className="text-xs text-white/40">This action cannot be undone.</p>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={busyId === deleteTarget.id}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/80 hover:bg-white/10 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => removeAd(deleteTarget.id)}
                disabled={busyId === deleteTarget.id}
                className="flex-1 rounded-xl bg-red-500/20 px-4 py-3 text-sm font-medium text-red-300 hover:bg-red-500/30 transition disabled:opacity-50"
              >
                {busyId === deleteTarget.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
