"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAdminSession } from "@/lib/auth/adminSession";
import AdminPayrollPage from "@/components/admin/AdminPayrollPage";

export default function PayrollPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const session = getAdminSession();
    if (!session) { router.replace("/admin/login"); return; }
    const roles = ["owner", "super_admin"];
    if (!roles.includes(session.role)) { router.replace("/admin"); return; }
    setAllowed(true);
  }, [router]);

  if (!allowed) return null;
  return <AdminPayrollPage />;
}
