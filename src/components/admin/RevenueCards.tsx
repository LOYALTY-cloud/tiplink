"use client";

import { formatMoney } from "@/lib/walletFees";

type Props = {
  data: {
    todayRevenue: number;
    yesterdayRevenue: number;
    weekRevenue: number;
    lastWeekRevenue: number;
    monthRevenue: number;
    totalRevenue: number;
    todayVelocity?: number;
    sameDayLastWeekRevenue?: number;
  };
  glow?: boolean;
};

function pctChange(current: number, previous: number): string | null {
  if (previous === 0) return current > 0 ? "+∞%" : null;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

function changeColor(current: number, previous: number): string {
  if (current > previous) return "text-emerald-400";
  if (current < previous) return "text-red-400";
  return "text-white/40";
}

export default function RevenueCards({ data, glow }: Props) {
  const todayVsYesterday = pctChange(data.todayRevenue, data.yesterdayRevenue);
  const weekVsLast = pctChange(data.weekRevenue, data.lastWeekRevenue);
  const todayVsSameDay = data.sameDayLastWeekRevenue != null
    ? pctChange(data.todayRevenue, data.sameDayLastWeekRevenue)
    : null;

  const dayName = new Date().toLocaleDateString("en-US", { weekday: "short" });

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
      {/* Today */}
      <div className={`bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-3 md:p-4 transition-all duration-300 ${glow ? "revenue-glow" : ""}`}>
        <p className="text-[10px] md:text-xs text-white/50">Today</p>
        <p key={data.todayRevenue} className="text-base md:text-lg font-semibold text-emerald-400 transition-all duration-300">
          {formatMoney(data.todayRevenue)}
        </p>
        {data.todayVelocity != null && data.todayVelocity > 0 && (
          <p className="text-[10px] md:text-xs text-white/30 mt-0.5">
            ≈ {formatMoney(data.todayVelocity)}/hr
          </p>
        )}
        {todayVsYesterday && (
          <p className={`text-[10px] md:text-xs mt-1 ${changeColor(data.todayRevenue, data.yesterdayRevenue)}`}>
            {todayVsYesterday} vs yesterday
          </p>
        )}
        {todayVsSameDay && (
          <p className={`text-[10px] md:text-xs ${changeColor(data.todayRevenue, data.sameDayLastWeekRevenue ?? 0)}`}>
            {todayVsSameDay} vs last {dayName}
          </p>
        )}
      </div>

      {/* Week */}
      <div className="bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-3 md:p-4 transition-all duration-300">
        <p className="text-[10px] md:text-xs text-white/50">This Week</p>
        <p key={data.weekRevenue} className="text-base md:text-lg font-semibold text-white transition-all duration-300">
          {formatMoney(data.weekRevenue)}
        </p>
        {weekVsLast && (
          <p className={`text-[10px] md:text-xs mt-1 ${changeColor(data.weekRevenue, data.lastWeekRevenue)}`}>
            {weekVsLast} vs last week
          </p>
        )}
      </div>

      {/* Month */}
      <div className="bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-3 md:p-4 transition-all duration-300">
        <p className="text-[10px] md:text-xs text-white/50">This Month</p>
        <p key={data.monthRevenue} className="text-base md:text-lg font-semibold text-white transition-all duration-300">
          {formatMoney(data.monthRevenue)}
        </p>
      </div>

      {/* Total */}
      <div className="bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-3 md:p-4 transition-all duration-300">
        <p className="text-[10px] md:text-xs text-white/50">Total Revenue</p>
        <p key={data.totalRevenue} className="text-base md:text-lg font-semibold text-blue-400 transition-all duration-300">
          {formatMoney(data.totalRevenue)}
        </p>
      </div>
    </div>
  );
}
