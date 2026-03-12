"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { uploadImage } from "@/lib/uploadImage";
import ProfileImageCropper from "@/components/ProfileImageCropper";
import { ui } from "@/lib/ui";

type SocialType = "instagram" | "tiktok" | "x" | "youtube" | "website";

export default function ProfilePage() {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [handle, setHandle] = useState("");
  const [savedHandle, setSavedHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [cropTarget, setCropTarget] = useState<"avatars" | "banners" | null>(null);
  const [imageSrcLocal, setImageSrcLocal] = useState<string | null>(null);
  const [handleChangeCount, setHandleChangeCount] = useState(0);
  const [handleWindowStart, setHandleWindowStart] = useState<string | null>(null);
  const [links, setLinks] = useState<
    { type: SocialType; url: string; sort_order: number }[]
  >([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const baseHandle = useMemo(() => handle.trim().replace(/\s+/g, ""), [handle]);

  useEffect(() => {
    (async () => {
      setMsg(null);
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes.user;
      if (!user) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select(
          "id, handle, display_name, bio, location, avatar_url, banner_url, handle_change_count, handle_change_window_start"
        )
        .eq("user_id", user.id)
        .maybeSingle();

      if (prof) {
        setProfileId(prof.id);
        setHandle(prof.handle || "");
        setSavedHandle(prof.handle || "");
        setDisplayName(prof.display_name || "");
        setBio(prof.bio || "");
        setLocation(prof.location || "");
        setAvatarUrl(prof.avatar_url || "");
        setBannerUrl(prof.banner_url || "");
        setHandleChangeCount(prof.handle_change_count || 0);
        setHandleWindowStart(prof.handle_change_window_start || null);

        const { data: sl } = await supabase
          .from("social_links")
          .select("type, url, sort_order")
          .eq("profile_id", prof.id)
          .order("sort_order", { ascending: true });

        setLinks((sl || []).map((x: any) => ({ ...x })));
      } else {
        const suggested = (user.email || "").split("@")[0] || "mytiplink";
        setHandle(suggested);
        setSavedHandle("");
      }
    })();
  }, []);

  const addLink = () => {
    if (links.length >= 5) return;
    setLinks([...links, { type: "website", url: "", sort_order: links.length }]);
  };

  const updateLink = (idx: number, key: "type" | "url", value: string) => {
    const next = [...links];
    // @ts-ignore
    next[idx][key] = value;
    setLinks(next.map((l, i) => ({ ...l, sort_order: i })));
  };

  const removeLink = (idx: number) => {
    const next = [...links];
    next.splice(idx, 1);
    setLinks(next.map((l, i) => ({ ...l, sort_order: i })));
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes.user;
    if (!user) {
      setSaving(false);
      setMsg("You are not logged in.");
      return;
    }

    const cleanHandle = baseHandle;
    if (!cleanHandle || cleanHandle.length < 3) {
      setSaving(false);
      setMsg("Handle must be at least 3 characters (no spaces).");
      return;
    }

    const now = new Date();
    const hasExistingHandle = Boolean(savedHandle);
    const isHandleChange = Boolean(savedHandle) && cleanHandle !== savedHandle;

    let nextChangeCount = handleChangeCount;
    let nextWindowStart = handleWindowStart;

    if (isHandleChange && hasExistingHandle) {
      if (handleWindowStart) {
        const lastChangeDate = new Date(handleWindowStart);
        const msIn30Days = 30 * 24 * 60 * 60 * 1000;
        const msSinceLastChange = now.getTime() - lastChangeDate.getTime();

        if (msSinceLastChange < msIn30Days) {
          const daysRemaining = Math.ceil((msIn30Days - msSinceLastChange) / (24 * 60 * 60 * 1000));
          setSaving(false);
          setMsg(`You can change your handle again in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}.`);
          return;
        }
      }

      nextChangeCount = handleChangeCount + 1;
      nextWindowStart = now.toISOString();
    }

    const { data: profUpsert, error: profErr } = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          handle: cleanHandle,
          display_name: displayName,
          bio,
          location,
          avatar_url: avatarUrl || null,
          banner_url: bannerUrl || null,
          handle_change_count: nextChangeCount,
          handle_change_window_start: nextWindowStart,
        },
        { onConflict: "user_id" }
      )
      .select("id")
      .single();

    if (profErr) {
      setSaving(false);
      setMsg(profErr.message);
      return;
    }

    const profId = profUpsert.id as string;
    setProfileId(profId);
    setSavedHandle(cleanHandle);

    await supabase.from("social_links").delete().eq("profile_id", profId);

    const filtered = links
      .map((l, i) => ({ ...l, sort_order: i }))
      .filter((l) => l.url.trim().length > 0)
      .slice(0, 5);

    if (filtered.length) {
      const { error: linkErr } = await supabase.from("social_links").insert(
        filtered.map((l) => ({
          profile_id: profId,
          type: l.type,
          url: l.url.trim(),
          sort_order: l.sort_order,
        }))
      );

      if (linkErr) {
        setSaving(false);
        setMsg(linkErr.message);
        return;
      }
    }

    setSaving(false);
    setMsg("Saved OK");
  };

  return (
    <div className="max-w-2xl space-y-4">
      {/* ProfileImageCropper handles both avatar and banner uploads */}
      <div className={`${ui.card} overflow-hidden`}>
        <div className="relative">
          <div className="relative h-32 w-full">
            {bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bannerUrl} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="h-32 w-full bg-gradient-to-r from-purple-300/35 via-pink-200/25 to-amber-200/25" />
            )}

            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const src = URL.createObjectURL(file);
                setImageSrcLocal(src);
                setCropTarget("banners");
              }}
            />
          </div>
          <div className="absolute inset-x-0 top-16 flex justify-center">
            <div className="relative h-24 w-24 rounded-2xl bg-white/10 border border-white/15 overflow-hidden shadow-sm">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={displayName || handle || "Profile"} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-white/70 font-semibold text-2xl">
                  {(displayName || handle || "?").slice(0, 1).toUpperCase()}
                </div>
              )}

              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const src = URL.createObjectURL(file);
                  setImageSrcLocal(src);
                  setCropTarget("avatars");
                }}
              />
            </div>
          </div>
        </div>

        <div className="pt-16 pb-6 px-6 text-center">
          <div className="text-2xl font-semibold text-white">{displayName || handle || "Your Name"}</div>
          <div className="mt-1 text-white/70">@{baseHandle || "yourhandle"}</div>

          {location && <div className="mt-2 text-sm text-white/60">📍 {location}</div>}

          {bio && <div className="mt-2 text-sm text-white/70">{bio}</div>}

          <div className="mt-3 text-xs text-white/50">Public page preview • This is how visitors see your profile</div>
        </div>
      </div>
      {imageSrcLocal && (
        <ProfileImageCropper
          image={imageSrcLocal}
          onComplete={async (blob: Blob) => {
            const { data: userRes } = await supabase.auth.getUser();
            const user = userRes.user;
            if (!user) return alert("Not logged in");

            const fileName = (cropTarget === "avatars" ? "avatar" : "banner") + ".jpg";
            const file = new File([blob], fileName, { type: "image/jpeg" });

            try {
              const bucket = cropTarget === "avatars" ? "avatars" : "banners";
              const oldUrl = cropTarget === "avatars" ? avatarUrl || undefined : bannerUrl || undefined;
              const url = await uploadImage(file, bucket as any, user.id, oldUrl);

              await supabase.from("profiles").upsert(
                cropTarget === "avatars" ? { user_id: user.id, avatar_url: url } : { user_id: user.id, banner_url: url },
                { onConflict: "user_id" }
              );

              if (cropTarget === "avatars") setAvatarUrl(url);
              else setBannerUrl(url);
            } catch (err: any) {
              console.error("Cropped upload error", err);
              alert(err?.message || String(err) || "Upload failed");
            } finally {
              if (imageSrcLocal) URL.revokeObjectURL(imageSrcLocal);
              setImageSrcLocal(null);
              setCropTarget(null);
            }
          }}
          onCancel={() => {
            if (imageSrcLocal) URL.revokeObjectURL(imageSrcLocal);
            setImageSrcLocal(null);
            setCropTarget(null);
          }}
        />
      )}

      <div className={`${ui.card} p-6`}>
        <h1 className={ui.h2}>Edit Profile</h1>
        <p className={ui.muted}>Update your public TIPLINK page information</p>
      </div>

      <div className={`${ui.card} p-6 space-y-4`}>
        <div className="space-y-2">
          <label className={`text-sm font-medium ${ui.muted}`}>Handle</label>
          <input className={ui.input} placeholder="DJLuna" value={handle} onChange={(e) => setHandle(e.target.value)} />
          <p className={ui.muted2}>Public link: <span className="font-medium">/{baseHandle || "yourhandle"}</span></p>
          {handleWindowStart && savedHandle && (
            <p className={ui.muted2}>
              {(() => {
                const lastChangeDate = new Date(handleWindowStart);
                const now = new Date();
                const msIn30Days = 30 * 24 * 60 * 60 * 1000;
                const msSinceLastChange = now.getTime() - lastChangeDate.getTime();
                const daysRemaining = Math.ceil((msIn30Days - msSinceLastChange) / (24 * 60 * 60 * 1000));

                if (daysRemaining <= 0) {
                  return "✓ You can change your handle now";
                }
                return `Handle can be changed again in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`;
              })()}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className={`text-sm font-medium ${ui.muted}`}>Display Name</label>
          <input className={ui.input} placeholder="DJ Luna" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>

        <div className="space-y-2">
          <label className={`text-sm font-medium ${ui.muted}`}>Avatar URL (optional)</label>
          <input className={ui.input} placeholder="https://example.com/avatar.jpg" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
          <p className={ui.muted2}>Link to your profile picture (updates preview above)</p>
        </div>

        <div className="space-y-2">
          <label className={`text-sm font-medium ${ui.muted}`}>Location (optional)</label>
          <input className={ui.input} placeholder="San Francisco" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>

        <div className="space-y-2">
          <label className={`text-sm font-medium ${ui.muted}`}>Bio</label>
          <textarea className={`${ui.input} min-h-[96px]`} placeholder="Short bio (1-2 lines)." value={bio} onChange={(e) => setBio(e.target.value)} maxLength={120} />
          <div className={ui.muted2}>{bio.length}/120</div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={`text-sm font-medium ${ui.muted}`}>Social Links (max 5)</label>
            <button onClick={addLink} className={`text-sm font-medium underline ${ui.muted}`} disabled={links.length >= 5}>Add link</button>
          </div>

          <div className="space-y-3">
            {links.map((l, idx) => (
              <div key={idx} className="flex gap-2">
                <select className="rounded-xl px-3 py-3 w-36 bg-white/5 border border-white/10 text-white" value={l.type} onChange={(e) => updateLink(idx, "type", e.target.value)}>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="x">X</option>
                  <option value="youtube">YouTube</option>
                  <option value="website">Website</option>
                </select>

                <input className={`${ui.input} flex-1`} placeholder="https://..." value={l.url} onChange={(e) => updateLink(idx, "url", e.target.value)} />

                <button onClick={() => removeLink(idx)} className={`text-sm font-medium underline ${ui.muted}`}>Remove</button>
              </div>
            ))}
          </div>
        </div>

        <button onClick={save} className={`${ui.btnPrimary}`} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>

        {msg && <div className={ui.muted}>{msg}</div>}
      </div>
    </div>
  );
}
