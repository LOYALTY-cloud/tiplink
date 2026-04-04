"use client";

import { useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatMoney } from "@/lib/walletFees";

type DailyPoint = {
  date: string;
  fees: number;
  volume: number;
  count: number;
};

type RangeLabel = "7D" | "30D" | "90D";

export default function RevenueChart({
  data,
  range,
  onRangeChange,
  bestRange,
  onHoverDate,
}: {
  data: DailyPoint[];
  range: RangeLabel;
  onRangeChange: (r: RangeLabel) => void;
  bestRange?: string;
  onHoverDate?: (date: string | null) => void;
}) {
  if (data.length === 0) return null;

  const [cumulative, setCumulative] = useState(false);

  // Format date labels as "Mar 1"
  const chartData = data.map((d) => {
    const dt = new Date(d.date + "T00:00:00");
    const label = dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { ...d, label, revenue: d.fees };
  });

  // Build cumulative variant
  const displayData = cumulative
    ? chartData.reduce<(typeof chartData[number] & { cumulativeRevenue: number })[]>((acc, d) => {
        const prev = acc.length > 0 ? acc[acc.length - 1].cumulativeRevenue : 0;
        acc.push({ ...d, cumulativeRevenue: Math.round((prev + d.revenue) * 100) / 100 });
        return acc;
      }, [])
    : chartData;

  // Trend: compare first half vs second half of period
  const mid = Math.floor(chartData.length / 2);
  const firstHalf = chartData.slice(0, mid);
  const secondHalf = chartData.slice(mid);
  const firstSum = firstHalf.reduce((s, d) => s + d.revenue, 0);
  const secondSum = secondHalf.reduce((s, d) => s + d.revenue, 0);
  const trendPct = firstSum > 0
    ? ((secondSum - firstSum) / firstSum) * 100
    : secondSum > 0 ? 100 : 0;
  const trendSign = trendPct >= 0 ? "+" : "";
  const trendColor = trendPct >= 0 ? "text-emerald-400" : "text-red-400";

  // Peak day
  const peak = chartData.reduce((best, d) => d.revenue > best.revenue ? d : best, chartData[0]);

  const ranges: RangeLabel[] = ["7D", "30D", "90D"];

  const rangeLabel = range === "7D" ? "7 Days" : range === "90D" ? "90 Days" : "30 Days";

  // Map labels back to dates for hover sync
  const labelToDate = new Map(chartData.map(d => [d.label, d.date]));

  const handleMouseMove = useCallback((state: { activeLabel?: string | number }) => {
    if (state.activeLabel && onHoverDate) {
      onHoverDate(labelToDate.get(String(state.activeLabel)) ?? null);
    }
  }, [onHoverDate, labelToDate]);

  const handleMouseLeave = useCallback(() => {
    onHoverDate?.(null);
  }, [onHoverDate]);

  const RANGE_TO_DAYS: Record<RangeLabel, string> = { "7D": "7", "30D": "30", "90D": "90" };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl md:rounded-2xl p-3 md:p-5 mt-4 md:mt-6">
      {/* Header row: title + trend + filter tabs (sticky within chart card) */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 md:mb-4 sticky top-10 z-10 bg-white/5 backdrop-blur-sm -mx-3 md:-mx-5 px-3 md:px-5 py-2 rounded-t-xl md:rounded-t-2xl">
        <div className="flex items-center gap-2 md:gap-3">
          <h2 className="text-xs md:text-sm font-semibold text-white/80">
            Revenue (Last {rangeLabel})
          </h2>
          {chartData.length >= 4 && (
            <span className={`text-xs font-medium ${trendColor}`}>
              {trendSign}{trendPct.toFixed(1)}%
            </span>
          )}
        </div>

        {/* Filter tabs + cumulative toggle */}
        <div className="flex gap-1 items-center">
          {ranges.map((r) => {
            const isBest = bestRange === RANGE_TO_DAYS[r];
            return (
              <button
                key={r}
                onClick={() => { navigator.vibrate?.(10); onRangeChange(r); }}
                className={`relative px-3 md:px-3 py-2 md:py-1 text-xs rounded-full md:rounded-lg font-medium transition active:scale-95 ${
                  range === r
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {r}
                {isBest && range !== r && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            );
          })}
          <span className="mx-1 text-white/10">|</span>
          <button
            onClick={() => { navigator.vibrate?.(10); setCumulative((v) => !v); }}
            className={`px-3 py-2 md:py-1 text-xs rounded-full md:rounded-lg font-medium transition active:scale-95 ${
              cumulative ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"
            }`}
          >
            {cumulative ? "Cumulative" : "Daily"}
          </button>
        </div>
      </div>

      {/* Peak day */}
      {peak && peak.revenue > 0 && (
        <p className="text-xs text-white/40 mb-3">
          Best day: {peak.label} — {formatMoney(peak.revenue)}
        </p>
      )}

      <div className="h-48 md:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={displayData} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
            <XAxis
              dataKey="label"
              stroke="#666"
              tick={{ fontSize: 11, fill: "#888" }}
              tickLine={false}
              axisLine={{ stroke: "#333" }}
            />
            <YAxis
              stroke="#666"
              tick={{ fontSize: 11, fill: "#888" }}
              tickLine={false}
              axisLine={{ stroke: "#333" }}
              tickFormatter={(v: number) => `$${v}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#111",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "12px",
                fontSize: "13px",
              }}
              labelStyle={{ color: "#aaa" }}
              formatter={(value) => [
                `$${Number(value ?? 0).toFixed(2)}`,
                cumulative ? "Cumulative Revenue" : "Platform Revenue",
              ]}
            />
            <Line
              type="monotone"
              dataKey={cumulative ? "cumulativeRevenue" : "revenue"}
              stroke={cumulative ? "#3b82f6" : "#10b981"}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: cumulative ? "#3b82f6" : "#10b981" }}
              isAnimationActive={true}
              animationDuration={800}
              animationEasing="ease-in-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
