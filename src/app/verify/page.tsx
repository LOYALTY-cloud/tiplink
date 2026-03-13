import Link from "next/link";

type VerifyPageProps = {
  searchParams?: { status?: string };
};

const statusCopy: Record<string, { title: string; body: string }> = {
  success: {
    title: "Email verified",
    body: "Your email is confirmed. You can log in now.",
  },
  missing: {
    title: "Missing verification token",
    body: "The verification link is missing data. Please request a new one.",
  },
  invalid: {
    title: "Invalid verification link",
    body: "That link is not valid. Please request a new one.",
  },
  expired: {
    title: "Link expired",
    body: "That verification link expired. Please request a new one.",
  },
  error: {
    title: "Verification failed",
    body: "We hit an error while verifying your email. Please try again.",
  },
};

export default function VerifyPage({ searchParams }: VerifyPageProps) {
  const status = searchParams?.status ?? "";
  const copy = statusCopy[status] ?? {
    title: "Verifying your email",
    body: "If this takes too long, refresh or request a new link.",
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md space-y-4 bg-white border rounded-2xl shadow-sm p-6 text-center">
        <h1 className="text-2xl font-semibold">{copy.title}</h1>
        <p className="text-sm text-gray-600">{copy.body}</p>
        <div className="pt-2">
          <Link
            className="inline-flex items-center justify-center rounded bg-black text-white px-4 py-2"
            href="/login"
          >
            Go to login
          </Link>
        </div>
      </div>
    </div>
  );
}
