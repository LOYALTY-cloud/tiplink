"use client"

interface Props {
  open: boolean
  onStay: () => void
}

export default function SessionWarningModal({ open, onStay }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-black border border-white/10 p-6 rounded-2xl text-white w-[320px]">
        <h2 className="text-sm font-semibold mb-2">Session expiring</h2>
        <p className="text-xs text-white/60 mb-4">
          You'll be logged out soon due to inactivity.
        </p>
        <button
          onClick={onStay}
          className="w-full bg-emerald-500 text-black py-2 rounded-xl font-medium"
        >
          Stay Logged In
        </button>
      </div>
    </div>
  )
}
