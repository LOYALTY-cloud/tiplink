"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ui } from "@/lib/ui";

type Verification = {
  id: string;
  status: string;
  document_type: string;
  submitted_at: string;
  rejection_reason: string | null;
};

const DOC_TYPES = [
  { value: "id_card", label: "Government ID Card" },
  { value: "passport", label: "Passport" },
  { value: "driver_license", label: "Driver's License" },
] as const;

export default function VerifyPage() {
  const router = useRouter();
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<Verification | null>(null);
  const [docType, setDocType] = useState("id_card");
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes.user) {
        router.replace("/login");
        return;
      }

      // Check for most recent verification
      const { data: verifications } = await supabase
        .from("identity_verifications")
        .select("id, status, document_type, submitted_at, rejection_reason")
        .eq("user_id", userRes.user.id)
        .order("submitted_at", { ascending: false })
        .limit(1);

      if (verifications && verifications.length > 0) {
        setExisting(verifications[0] as Verification);
      }
      setLoading(false);
    })();
  }, [router]);

  async function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // strip data:...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleSubmit() {
    if (!frontFile) {
      setError("Please select the front of your document.");
      return;
    }
    if (frontFile.size > 8 * 1024 * 1024) {
      setError("File too large. Maximum 8MB.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const frontB64 = await toBase64(frontFile);
      const backB64 = backFile ? await toBase64(backFile) : undefined;

      const res = await fetch("/api/verify/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          document_type: docType,
          file_base64: frontB64,
          file_back_base64: backB64,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        setSubmitting(false);
        return;
      }

      setSuccess(true);
      setExisting({ id: "", status: "pending", document_type: docType, submitted_at: new Date().toISOString(), rejection_reason: null });
    } catch {
      setError("Something went wrong. Please try again.");
    }

    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Show status if already submitted
  if (existing) {
    const isPending = existing.status === "pending";
    const isApproved = existing.status === "approved";
    const isRejected = existing.status === "rejected";

    return (
      <div className="max-w-md mx-auto space-y-6">
        <Link href="/dashboard/account" className={`text-sm ${ui.muted} hover:text-white transition`}>
          ← Back to Account
        </Link>

        <h1 className={ui.h2}>Identity Verification</h1>

        <div className={`${ui.card} p-5 space-y-3`}>
          {isPending && (
            <>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-yellow-400 font-semibold">Pending Review</span>
              </div>
              <p className={`text-sm ${ui.muted}`}>
                Your ID has been submitted and is under review. We&apos;ll notify you once it&apos;s processed.
              </p>
              <p className={`text-xs ${ui.muted2}`}>
                Submitted {new Date(existing.submitted_at).toLocaleDateString()}
              </p>
            </>
          )}

          {isApproved && (
            <>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="text-emerald-400 font-semibold">Verified</span>
              </div>
              <p className={`text-sm ${ui.muted}`}>
                Your identity has been verified. Your account is in good standing.
              </p>
            </>
          )}

          {isRejected && (
            <>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="text-red-400 font-semibold">Rejected</span>
              </div>
              <p className={`text-sm ${ui.muted}`}>
                {existing.rejection_reason || "Your verification was not approved. Please try again with a clearer photo."}
              </p>
              <button
                onClick={() => { setExisting(null); setSuccess(false); setFrontFile(null); setBackFile(null); }}
                className={`${ui.btnGhost} ${ui.btnSmall} mt-2`}
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <Link href="/dashboard/account" className={`text-sm ${ui.muted} hover:text-white transition`}>
        ← Back to Account
      </Link>

      <h1 className={ui.h2}>Verify Your Identity</h1>

      <p className={`text-sm ${ui.muted}`}>
        Upload a government-issued photo ID. This helps us verify your identity and restore full access to your account.
      </p>

      {success ? (
        <div className={`${ui.card} p-5`}>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-yellow-400 font-semibold">Submitted</span>
          </div>
          <p className={`text-sm ${ui.muted} mt-2`}>
            Your ID has been submitted for review. We&apos;ll notify you once it&apos;s processed.
          </p>
        </div>
      ) : (
        <div className={`${ui.card} p-5 space-y-5`}>
          {/* Document type */}
          <div>
            <label className={`text-xs font-medium uppercase tracking-wider ${ui.muted} block mb-2`}>
              Document Type
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className={`${ui.input} !py-2.5 !text-sm`}
            >
              {DOC_TYPES.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          {/* Front */}
          <div>
            <label className={`text-xs font-medium uppercase tracking-wider ${ui.muted} block mb-2`}>
              Front of Document *
            </label>
            <input
              ref={frontRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setFrontFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              onClick={() => frontRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition ${
                frontFile
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-white/10 hover:border-white/20"
              }`}
            >
              {frontFile ? (
                <span className="text-sm text-emerald-400">{frontFile.name}</span>
              ) : (
                <span className={`text-sm ${ui.muted}`}>Click to upload front of ID</span>
              )}
            </button>
          </div>

          {/* Back (optional) */}
          <div>
            <label className={`text-xs font-medium uppercase tracking-wider ${ui.muted} block mb-2`}>
              Back of Document <span className={ui.muted2}>(optional)</span>
            </label>
            <input
              ref={backRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => setBackFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              onClick={() => backRef.current?.click()}
              className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition ${
                backFile
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-white/10 hover:border-white/20"
              }`}
            >
              {backFile ? (
                <span className="text-sm text-emerald-400">{backFile.name}</span>
              ) : (
                <span className={`text-sm ${ui.muted}`}>Click to upload back of ID</span>
              )}
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !frontFile}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-xl transition"
          >
            {submitting ? "Uploading..." : "Submit for Review"}
          </button>

          <p className={`text-xs ${ui.muted2} text-center`}>
            Your documents are encrypted and stored securely. Only authorized admins can view them.
          </p>
        </div>
      )}
    </div>
  );
}
