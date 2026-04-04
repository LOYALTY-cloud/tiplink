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
    "A creator platform to receive tips and withdraw instantly.",
  metadataBase: new URL("https://1nelink.com"),
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "1neLink",
    description: "Send & receive tips instantly.",
    url: "https://1nelink.com",
    siteName: "1neLink",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "1neLink",
    description: "Send & receive tips instantly.",
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
      </body>
    </html>
  );
}
