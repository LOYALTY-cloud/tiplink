"use client";

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-white/[0.06] rounded-xl animate-pulse ${className}`} />
  );
}

/** Dashboard-style skeleton: balance + action buttons + earnings card */
export function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-[fadeIn_0.3s_ease]">
      {/* Hero balance */}
      <div className="rounded-2xl bg-white/5 border border-white/[0.12] p-6">
        <Skeleton className="h-4 w-28 mb-3" />
        <Skeleton className="h-10 w-44 mb-5" />
        <div className="flex gap-3">
          <Skeleton className="h-11 w-32 rounded-xl" />
          <Skeleton className="h-11 w-28 rounded-xl" />
        </div>
      </div>
      {/* Earnings card */}
      <div className="rounded-2xl bg-white/5 border border-white/[0.12] p-6 space-y-4">
        <Skeleton className="h-4 w-36" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
      {/* Link row */}
      <div className="rounded-2xl bg-white/5 border border-white/[0.12] p-5 flex items-center gap-4">
        <Skeleton className="h-5 flex-1" />
        <Skeleton className="h-9 w-20 rounded-xl" />
      </div>
    </div>
  );
}

/** Earnings page skeleton: stat cards + chart + tip feed */
export function EarningsSkeleton() {
  return (
    <div className="space-y-5 animate-[fadeIn_0.3s_ease]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white/5 border border-white/[0.12] p-4 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-white/5 border border-white/[0.12] p-5">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <div className="rounded-2xl bg-white/5 border border-white/[0.12] p-5 space-y-3">
        <Skeleton className="h-4 w-28 mb-2" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Transactions page skeleton: list rows */
export function TransactionsSkeleton() {
  return (
    <div className="space-y-2 animate-[fadeIn_0.3s_ease]">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-xl bg-white/5 border border-white/[0.12] px-4 py-3 flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
