"use client";

import { ui } from "@/lib/ui";

export type ConfirmVariant = "approve" | "reject" | "danger" | "default";

type Props = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

const variantStyles: Record<ConfirmVariant, string> = {
  approve:
    "bg-green-600 hover:bg-green-500 text-white",
  reject:
    "bg-red-600 hover:bg-red-500 text-white",
  danger:
    "bg-red-600 hover:bg-red-500 text-white",
  default:
    "bg-blue-600 hover:bg-blue-500 text-white",
};

export default function AdminConfirmModal({
  open,
  title,
  children,
  confirmLabel,
  variant = "default",
  loading = false,
  disabled = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`${ui.card} p-6 w-full max-w-[440px] space-y-4 shadow-[0_0_40px_rgba(0,0,0,0.5)]`}>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="space-y-3 text-sm">{children}</div>
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onCancel}
            className={`${ui.btnGhost} ${ui.btnSmall}`}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || disabled}
            className={`${ui.btnSmall} rounded-lg px-4 py-2 font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed ${variantStyles[variant]}`}
          >
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
