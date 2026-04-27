import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workshop Diagnostic Terminal",
  description: "Manual-grounded diagnostic assistant for any motorcycle",
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
