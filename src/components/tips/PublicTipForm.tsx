"use client"

import { useState } from "react"

export default function PublicTipForm() {
  const [amount, setAmount] = useState("")
  const [name, setName] = useState("")
  const [message, setMessage] = useState("")
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!amount) return alert("Enter an amount")

    setLoading(true)

    const res = await fetch("/api/tips/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(amount),
        supporter_name: isAnonymous ? null : name,
        message,
        is_anonymous: isAnonymous,
      }),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      alert(json.error || "Failed to send tip")
      return
    }

    alert("Tip sent 💸")

    // Reset
    setAmount("")
    setName("")
    setMessage("")
    setIsAnonymous(true)
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-5">

      {/* Amount */}
      <div>
        <label className="text-sm text-white/70">Amount</label>
        <input
          type="number"
          placeholder="10.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-white"
        />
      </div>

      {/* Message */}
      <div>
        <label className="text-sm text-white/70">Message (optional)</label>
        <textarea
          placeholder="Keep going 🔥"
          value={message}
          maxLength={200}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-white"
        />
      </div>

      {/* Name */}
      {!isAnonymous && (
        <div>
          <label className="text-sm text-white/70">Your name</label>
          <input
            placeholder="Toni"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-white"
          />
        </div>
      )}

      {/* Toggle */}
      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-3">
        <span className="text-sm text-white/80">Send anonymously</span>

        <button
          type="button"
          onClick={() => setIsAnonymous(!isAnonymous)}
          className={`w-12 h-6 rounded-full transition ${
            isAnonymous ? "bg-blue-500" : "bg-white/20"
          }`}
        >
          <div
            className={`w-5 h-5 bg-white rounded-full transform transition ${
              isAnonymous ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3 bg-blue-600 rounded-xl text-white font-semibold"
      >
        {loading ? "Processing…" : "Send Tip 💸"}
      </button>
    </div>
  )
}
