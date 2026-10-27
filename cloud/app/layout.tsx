import type { Metadata } from "next";
import "./globals.css";
import "./monitor.css";
export const metadata: Metadata = {
  title: "InsightPilot · Business reputation monitoring",
  description:
    "Track business reviews, weekly changes, recurring issues, competitors, and complaint alerts with linked evidence.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
