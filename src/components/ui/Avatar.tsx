"use client"

export default function Avatar({
  name,
  size = 40,
}: {
  name?: string | null
  size?: number
}) {
  const letter = name?.[0]?.toUpperCase() || "A"

  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold shrink-0"
    >
      {letter}
    </div>
  )
}
