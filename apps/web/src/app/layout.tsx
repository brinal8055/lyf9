import type { Metadata } from "next";
import { Inter, Hanken_Grotesk, Newsreader } from "next/font/google";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  preload: true,
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hanken",
  weight: ["400", "500", "600", "700", "800"],
});

const newsreader = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-newsreader",
  weight: ["400", "500"],
  style: ["italic"],
});

export const metadata: Metadata = {
  title: {
    default: "Lyf9 AI — Understand your blood reports",
    template: "%s | Lyf9 AI"
  },
  description:
    "Upload your lab report. Lyf9 AI explains biomarkers in plain language, tracks changes over time, and helps you prepare better questions for your doctor.",
  openGraph: {
    title: "Lyf9 AI — Understand your blood reports",
    description:
      "AI-assisted lab report explanation for India. Source-linked biomarkers, doctor review, and retest reminders.",
    url: "https://lyf9.ai",
    siteName: "Lyf9 AI",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Lyf9 AI — Understand your blood reports",
    description:
      "AI-assisted lab report explanation for India. Source-linked biomarkers, doctor review, and retest reminders."
  },
  robots: { index: true, follow: true }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${hanken.variable} ${newsreader.variable}`}>
      <body>{children}</body>
    </html>
  );
}
