"use client";

import { useEffect, useState } from "react";
import { getAdminHeaders } from "@/lib/auth/adminSession";
import { formatMoney } from "@/lib/walletFees";

type TopEarner = {
  user_id: string;
  name: string;
  avatar: string | null;
  total: number;
};

export default function TopEarnersWidget() {
  const [users, setUsers] = useState<TopEarner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers = getAdminHeaders();
    fetch("/api/admin/revenue/top-earners", { headers })
      .then((res) => res.json())
      .then((data) => {
        setUsers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <h2 className="text-sm text-white/60 mb-3">🏆 Top Earners Today</h2>

      {loading ? (
        <p className="text-xs text-white/30">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-xs text-white/40">No earnings yet today</p>
      ) : (
        <div className="space-y-3">
          {users.map((u, i) => (
            <div
              key={u.user_id}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/40 w-4">
                  {i === 0 ? "👑" : `#${i + 1}`}
                </span>

                <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center text-white/30 text-xs">
                  {u.avatar ? (
                    <img
                      src={u.avatar}
                      alt={u.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    "👤"
                  )}
                </div>

                <span className="text-sm text-white">@{u.name}</span>
              </div>

              <span className="text-emerald-400 font-semibold">
                {formatMoney(u.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
