"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ui } from "@/lib/ui";
import CreatorLegalModal from "@/components/marketplace/CreatorLegalModal";

const CATEGORIES = ["Social", "Gaming", "Minimal", "Luxury", "Abstract", "Urban", "Nature", "Dark", "Neon"];

export default function UploadThemePage() {
  const router = useRouter();
  const [hasLegal, setHasLegal] = useState<boolean | null>(null);
  const [showLegal, setShowLegal] = useState(false);
  const [legalLoading, setLegalLoading] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Social");
  const [tags, setTags] = useState("");
  const [price, setPrice] = useState("");
  const [previewFiles, setPreviewFiles] = useState<FileList | null>(null);
  const [themeFile, setThemeFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const previewRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Check if creator has accepted legal agreement
  useEffect(() => {
    fetch("/api/marketplace/legal-check")
      .then((r) => r.json())
      .then((d) => {
        if (d.accepted) {
          setHasLegal(true);
        } else {
          setHasLegal(false);
          setShowLegal(true);
        }
      })
      .catch(() => {
        setHasLegal(false);
        setShowLegal(true);
      });
  }, []);

  async function acceptLegal(policyVersion: string) {
    setLegalLoading(true);
    try {
      const res = await fetch("/api/marketplace/legal-accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyVersion }),
      });
      if (res.ok) {
        setHasLegal(true);
        setShowLegal(false);
      }
    } finally {
      setLegalLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasLegal) { setShowLegal(true); return; }
    if (!name.trim()) { setError("Theme name is required."); return; }
    if (!previewFiles || previewFiles.length === 0) { setError("At least one preview image is required."); return; }

    setLoading(true);
    setError("");

    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("description", description.trim());
      form.append("category", category);
      form.append("tags", tags);
      form.append("price", price);
      Array.from(previewFiles).forEach((f) => form.append("previews", f));
      if (themeFile) form.append("themeFile", themeFile);

      const res = await fetch("/api/marketplace/upload", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Upload failed.");
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className={`${ui.page} flex items-center justify-center p-6`}>
        <div className={`${ui.card} max-w-md w-full p-8 text-center`}>
          <div className="text-4xl mb-4">🎉</div>
          <h1 className={ui.h1}>Theme submitted!</h1>
          <p className={`${ui.muted2} mt-3 text-sm`}>
            Your theme is now in review. We&apos;ll notify you once it&apos;s approved.
          </p>
          <button
            className={`${ui.btnPrimary} mt-6 w-full`}
            onClick={() => router.push("/dashboard")}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${ui.page} p-4 sm:p-6`}>
      {showLegal && (
        <CreatorLegalModal
          onAccept={acceptLegal}
          onDecline={() => router.push("/dashboard")}
          loading={legalLoading}
        />
      )}

      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className={ui.h1}>Upload a Theme</h1>
          <p className={`${ui.muted2} mt-1 text-sm`}>
            Submit your original theme to the 1neLink marketplace.
          </p>
        </div>

        <form onSubmit={handleSubmit} className={`${ui.card} p-6 space-y-5`}>
          {/* Name */}
          <div>
            <label className={`${ui.label} block mb-2`}>Theme Name *</label>
            <input
              className={ui.input}
              placeholder="e.g. Midnight Glow"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>

          {/* Description */}
          <div>
            <label className={`${ui.label} block mb-2`}>Description</label>
            <textarea
              className={`${ui.input} min-h-[100px] resize-none`}
              placeholder="Describe your theme, inspiration, and style…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>

          {/* Category + Price row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`${ui.label} block mb-2`}>Category</label>
              <select
                className={ui.select}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={`${ui.label} block mb-2`}>Price (USD)</label>
              <input
                className={ui.input}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00 = free"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className={`${ui.label} block mb-2`}>Tags</label>
            <input
              className={ui.input}
              placeholder="dark, minimal, aesthetic (comma-separated)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>

          {/* Preview images */}
          <div>
            <label className={`${ui.label} block mb-2`}>Preview Images * (up to 5)</label>
            <div
              className="rounded-xl border border-dashed border-white/20 p-6 text-center cursor-pointer hover:border-white/40 transition"
              onClick={() => previewRef.current?.click()}
            >
              {previewFiles && previewFiles.length > 0 ? (
                <p className="text-white/70 text-sm">{previewFiles.length} file(s) selected</p>
              ) : (
                <p className="text-white/40 text-sm">Click to select images (PNG, JPG, WEBP)</p>
              )}
              <input
                ref={previewRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => setPreviewFiles(e.target.files)}
              />
            </div>
          </div>

          {/* Theme file */}
          <div>
            <label className={`${ui.label} block mb-2`}>Theme File (.zip or .json)</label>
            <div
              className="rounded-xl border border-dashed border-white/20 p-5 text-center cursor-pointer hover:border-white/40 transition"
              onClick={() => fileRef.current?.click()}
            >
              {themeFile ? (
                <p className="text-white/70 text-sm">{themeFile.name}</p>
              ) : (
                <p className="text-white/40 text-sm">Click to select theme file</p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".zip,application/zip,.json,application/json"
                className="hidden"
                onChange={(e) => setThemeFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            className={`${ui.btnPrimary} w-full`}
            disabled={loading || hasLegal === null}
          >
            {loading ? "Uploading…" : "Submit for Review"}
          </button>
        </form>
      </div>
    </div>
  );
}
