import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "InsightPilot · Customer intelligence",
  description:
    "Free public product research with source citations and on-device AI summaries.",
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
