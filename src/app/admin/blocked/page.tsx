"use client";

import { useRouter } from "next/navigation";
import { ui } from "@/lib/ui";

export default function AdminBlockedPage() {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem("admin_session");
    router.replace("/admin/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className={`${ui.card} p-8 max-w-md w-full text-center`}>
        <div className="text-5xl mb-4">🚫</div>
        <h1 className={`${ui.h2} mb-2`}>Access Denied</h1>
        <p className={`${ui.muted} mb-6`}>
          Your admin account has been suspended or terminated. You no longer
          have access to the admin panel.
        </p>
        <p className={`text-sm ${ui.muted2} mb-6`}>
          If you believe this is an error, contact the account owner.
        </p>
        <button onClick={handleLogout} className={`${ui.btnPrimary} w-full`}>
          Return to Login
        </button>
      </div>
    </div>
  );
}
