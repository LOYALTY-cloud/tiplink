import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ui } from "@/lib/ui";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "1neLink — Send & Receive Tips Instantly",
  description:
    "The creator platform for instant tips, fast withdrawals, and a built-in marketplace. Get paid by your fans in seconds.",
  metadataBase: new URL("https://1nelink.com"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "1neLink — Send & Receive Tips Instantly",
    description:
      "The creator platform for instant tips, fast withdrawals, and a built-in marketplace. Get paid by your fans in seconds.",
    url: "https://1nelink.com",
    siteName: "1neLink",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "1neLink — Send & Receive Tips Instantly",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "1neLink — Send & Receive Tips Instantly",
    description:
      "The creator platform for instant tips, fast withdrawals, and a built-in marketplace.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className={ui.page}>
          <div className={ui.glowWrap}>
            <div className={ui.glow1} />
            <div className={ui.glow2} />
            <div className={ui.glow3} />
            <div className={ui.topLine} />
          </div>

          <div className="relative z-10">
            {children}
          </div>
        </div>

        {/* Global overlay root — portals render here, outside all stacking contexts */}
        <div id="overlay-root" />
      </body>
    </html>
  );
}
