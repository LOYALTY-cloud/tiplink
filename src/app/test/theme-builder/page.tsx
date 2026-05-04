"use client";

import { useState, useEffect } from "react";
import ThemePreview from "@/components/ThemePreview";
import { supabase } from "@/lib/supabase/client";

type ThemeState = {
  background: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  animation: "none" | "glow" | "pulse" | "neon";
};

type SavedTheme = {
  id: string;
  name: string;
  config: ThemeState;
  is_active: boolean;
  created_at: string;
};

function ColorRow({
  label,
  field,
  theme,
  onChange,
}: {
  label: string;
  field: keyof ThemeState;
  theme: ThemeState;
  onChange: (field: keyof ThemeState, value: string) => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs opacity-60">{label}</label>
        <span className="text-xs font-mono opacity-50">{theme[field]}</span>
      </div>
      <input
        type="color"
        value={theme[field]}
        onChange={(e) => onChange(field, e.target.value)}
        className="w-full h-10 rounded cursor-pointer"
      />
    </div>
  );
}

export default function ThemeBuilderPage() {
  const [theme, setTheme] = useState<ThemeState>({
    background: "",
    primaryColor: "#00ff99",
    accentColor: "#111111",
    textColor: "#ffffff",
    animation: "none",
  });

  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [themeName, setThemeName] = useState("My Theme");

  // Load saved themes on mount
  useEffect(() => {
    loadSavedThemes();
  }, []);

  async function getToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function loadSavedThemes() {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch("/api/themes/saved", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setSavedThemes(json.themes ?? []);
      }
    } catch {
      // Not logged in or no themes yet — silent
    }
  }

  function update(field: keyof ThemeState, value: string) {
    setTheme((prev) => ({ ...prev, [field]: value }));
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Max image size is 2 MB");
      e.target.value = "";
      return;
    }

    setUploadStatus("uploading");

    // Show a local blob preview immediately while upload happens
    const blobUrl = URL.createObjectURL(file);
    setTheme((prev) => ({ ...prev, background: blobUrl }));

    try {
      const token = await getToken();
      if (!token) throw new Error("Not logged in");

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error("No user id");

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const fileName = `${userId}/theme-bg-${Date.now()}.${ext}`;

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bucket: "theme-backgrounds",
          fileName,
          fileBase64: base64,
        }),
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        throw new Error(err.error ?? "Upload failed");
      }

      const { publicUrl } = await uploadRes.json();
      // Replace blob URL with the permanent storage URL
      URL.revokeObjectURL(blobUrl);
      setTheme((prev) => ({ ...prev, background: publicUrl }));
      setUploadStatus("idle");
    } catch (err) {
      console.error("handleImageUpload:", err);
      // Keep blob preview so user can still see their choice, but flag the error
      setUploadStatus("error");
    }
  }

  function removeBackground() {
    setTheme((prev) => ({ ...prev, background: "" }));
    setUploadStatus("idle");
  }

  async function saveTheme() {
    // Block save if image is still uploading
    if (uploadStatus === "uploading") return;

    setSaveStatus("saving");
    try {
      const token = await getToken();
      if (!token) {
        setSaveStatus("error");
        return;
      }

      // background is always a permanent URL here (upload happened on select)
      // If it's still a blob (upload errored), block with a clear message
      if (theme.background.startsWith("blob:")) {
        throw new Error("Image upload failed — please re-select your image");
      }

      const finalConfig: ThemeState = { ...theme };

      const res = await fetch("/api/themes/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: themeName, config: finalConfig }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Save failed");
      }

      const { theme: saved } = await res.json();
      setSavedThemes((prev) => [saved, ...prev]);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err) {
      console.error("saveTheme:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }

  function applyTheme(saved: SavedTheme) {
    setUploadStatus("idle");
    setTheme(saved.config);
    setThemeName(saved.name);
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Live preview */}
      <div className="pb-96">
        <ThemePreview theme={theme} />
      </div>

      {/* Fixed control panel */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#111] border-t border-white/10 p-4 rounded-t-2xl shadow-2xl max-h-[75vh] overflow-y-auto">
        <h2 className="text-sm font-semibold mb-3 opacity-70">Theme Controls</h2>

        {/* Background Image */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs opacity-60">Background Image</label>
            {uploadStatus === "uploading" && (
              <span className="text-xs text-blue-400 animate-pulse">Uploading…</span>
            )}
            {uploadStatus === "error" && (
              <span className="text-xs text-red-400">Upload failed — re-select</span>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            disabled={uploadStatus === "uploading"}
            onChange={handleImageUpload}
            className="w-full mt-1 text-xs text-white/60 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:bg-white/10 file:text-white hover:file:bg-white/20 disabled:opacity-40"
          />
          <p className="text-[10px] text-white/30 mt-1">Max 2 MB · uploaded immediately to storage</p>
          {theme.background && (
            <div className="flex items-center gap-3 mt-2">
              <img
                src={theme.background}
                alt="Background preview"
                className={`w-12 h-12 rounded object-cover border ${
                  uploadStatus === "uploading"
                    ? "border-blue-500/50 opacity-60"
                    : uploadStatus === "error"
                    ? "border-red-500/50"
                    : "border-white/10"
                }`}
              />
              <div>
                {uploadStatus === "idle" && (
                  <p className="text-[10px] text-green-400 mb-1">✓ Stored permanently</p>
                )}
                <button
                  onClick={removeBackground}
                  className="text-xs text-red-400 hover:text-red-300 transition"
                >
                  Remove Background
                </button>
              </div>
            </div>
          )}
        </div>

        <ColorRow label="Primary Color (buttons)" field="primaryColor" theme={theme} onChange={update} />
        <ColorRow label="Card Color" field="accentColor" theme={theme} onChange={update} />
        <ColorRow label="Text Color" field="textColor" theme={theme} onChange={update} />

        {/* Animation Preset */}
        <div className="mb-3">
          <label className="text-xs opacity-60">Animation</label>
          <select
            value={theme.animation}
            onChange={(e) =>
              setTheme((prev) => ({
                ...prev,
                animation: e.target.value as ThemeState["animation"],
              }))
            }
            className="w-full mt-1 p-2 rounded-lg bg-black border border-white/10 text-white text-sm"
          >
            <option value="none">None</option>
            <option value="glow">✨ Glow</option>
            <option value="pulse">💓 Pulse</option>
            <option value="neon">⚡ Neon</option>
          </select>
          <p className="text-[10px] text-white/30 mt-1">
            {theme.animation === "glow"  && "Card glows with your primary color"}
            {theme.animation === "pulse" && "Card and buttons breathe subtly"}
            {theme.animation === "neon"  && "Name and handle flicker like neon"}
            {theme.animation === "none"  && "No animation"}
          </p>
        </div>

        {/* Save */}
        <div className="mt-4 border-t border-white/10 pt-4">
          <input
            type="text"
            value={themeName}
            onChange={(e) => setThemeName(e.target.value)}
            placeholder="Theme name"
            maxLength={100}
            className="w-full p-2 rounded-lg bg-black border border-white/10 text-white text-sm mb-2 outline-none focus:border-white/30"
          />
          <button
            onClick={saveTheme}
            disabled={saveStatus === "saving" || uploadStatus === "uploading"}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition ${
              saveStatus === "saved"
                ? "bg-green-500 text-black"
                : saveStatus === "error"
                ? "bg-red-500 text-white"
                : saveStatus === "saving" || uploadStatus === "uploading"
                ? "bg-white/20 text-white/50 cursor-not-allowed"
                : "bg-white text-black hover:bg-white/90"
            }`}
          >
            {uploadStatus === "uploading" ? "Waiting for image…"
              : saveStatus === "saving" ? "Saving…"
              : saveStatus === "saved" ? "✓ Saved"
              : saveStatus === "error" ? "Save failed — try again"
              : "Save Theme"}
          </button>
        </div>

        {/* Saved themes list */}
        {savedThemes.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="text-xs opacity-50 mb-2">Saved Themes</p>
            <div className="flex flex-col gap-2">
              {savedThemes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTheme(t)}
                  className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-left"
                >
                  {/* Color swatch */}
                  <div
                    className="w-8 h-8 rounded-lg flex-shrink-0 border border-white/10"
                    style={{
                      background: t.config.background
                        ? `url(${t.config.background}) center/cover`
                        : t.config.accentColor,
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{t.name}</p>
                    <p className="text-[10px] text-white/30">
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div
                    className="w-4 h-4 rounded-full ml-auto flex-shrink-0"
                    style={{ background: t.config.primaryColor }}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
