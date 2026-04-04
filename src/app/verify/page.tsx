"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type StatusInfo = {
  icon: string;
  iconColor: string;
  title: string;
  body: string;
  cta: string;
  href: string;
  autoRedirect?: boolean;
};

const statusMap: Record<string, StatusInfo> = {
  success: {
    icon: "✔",
    iconColor: "text-emerald-400",
    title: "Email Verified",
    body: "Your email has been successfully verified. You can now access all features including withdrawals and payouts.",
    cta: "Go to Dashboard",
    href: "/dashboard",
    autoRedirect: true,
  },
  missing: {
    icon: "⚠",
    iconColor: "text-amber-400",
    title: "Missing Verification Token",
    body: "The verification link is missing data. Please request a new verification email from your dashboard.",
    cta: "Go to Dashboard",
    href: "/dashboard",
  },
  invalid: {
    icon: "✖",
    iconColor: "text-red-400",
    title: "Invalid Verification Link",
    body: "That link is not valid. It may have already been used. Please request a new verification email.",
    cta: "Go to Dashboard",
    href: "/dashboard",
  },
  expired: {
    icon: "⏱",
    iconColor: "text-amber-400",
    title: "Link Expired",
    body: "That verification link has expired. Please request a new one from the banner on your dashboard.",
    cta: "Go to Dashboard",
    href: "/dashboard",
  },
  error: {
    icon: "✖",
    iconColor: "text-red-400",
    title: "Verification Failed",
    body: "We hit an error while verifying your email. Please try again or contact support.",
    cta: "Go Back",
    href: "/dashboard",
  },
};

const defaultStatus: StatusInfo = {
  icon: "⏳",
  iconColor: "text-white/60",
  title: "Verifying your email",
  body: "If this takes too long, refresh the page or request a new link.",
  cta: "Go to Dashboard",
  href: "/dashboard",
};

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const info = statusMap[status] ?? defaultStatus;
  const isSuccess = status === "success";

  useEffect(() => {
    if (info.autoRedirect) {
      const t = setTimeout(() => router.push(info.href), 3000);
      return () => clearTimeout(t);
    }
  }, [info.autoRedirect, info.href, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#060B18]">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center space-y-4">
        <div className={`text-4xl ${info.iconColor}`}>{info.icon}</div>

        <h1 className="text-xl font-semibold text-white">{info.title}</h1>

        <p className="text-sm text-white/60 leading-relaxed">{info.body}</p>

        {isSuccess && (
          <p className="text-xs text-white/40 animate-pulse">
            Redirecting to dashboard in 3 seconds…
          </p>
        )}

        <div className="pt-2">
          <Link
            href={info.href}
            className={`inline-block w-full py-3 rounded-xl font-semibold text-sm transition ${
              isSuccess
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-white/10 hover:bg-white/15 text-white"
            }`}
          >
            {info.cta}
          </Link>
        </div>

        {!isSuccess && status && (
          <p className="text-xs text-white/30 pt-2">
            Need help?{" "}
            <Link href="/dashboard" className="underline text-white/50 hover:text-white/70">
              Open support
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <VerifyContent />
    </Suspense>
  );
}
