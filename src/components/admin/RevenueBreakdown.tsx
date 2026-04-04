"use client";

import { formatMoney } from "@/lib/walletFees";

type Props = {
  data: {
    totalVolume: number;
    totalStripeFees: number;
    totalRevenue: number;
    totalRefunds: number;
  };
};

export default function RevenueBreakdown({ data }: Props) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 mt-5">
      <h2 className="text-sm font-semibold text-white/80 mb-4">
        Money Flow
      </h2>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-white/60">Total Volume</span>
          <span className="text-white">
            {formatMoney(data.totalVolume)}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-white/60">Stripe Fees</span>
          <span className="text-red-400">
            -{formatMoney(data.totalStripeFees)}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-white/60">Platform Revenue</span>
          <span className="text-emerald-400">
            {formatMoney(data.totalRevenue)}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-white/60">Refunds</span>
          <span className="text-yellow-400">
            -{formatMoney(data.totalRefunds)}
          </span>
        </div>

        <div className="flex justify-between border-t border-white/10 pt-3 mt-3">
          <span className="text-white/80 font-semibold">Net Profit</span>
          <span className="text-emerald-400 font-semibold">
            {formatMoney(data.totalRevenue - data.totalRefunds)}
          </span>
        </div>
      </div>
    </div>
  );
}
