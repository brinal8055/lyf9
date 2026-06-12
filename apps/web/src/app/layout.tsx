import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Lyf9 AI",
  description: "Private beta foundation for lyf9.ai."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
