import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0B0F19] text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="text-6xl font-bold text-white/10 mb-4">404</div>
        <h1 className="text-xl font-semibold mb-2">Page not found</h1>
        <p className="text-sm text-white/50 mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition"
        >
          ← Go home
        </Link>
      </div>
    </div>
  );
}
