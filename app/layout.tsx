import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PayProof — Merchant Desk",
  description: "A fictional storefront and private merchant workspace for reviewing simulated payment incidents, customer complaints, and case evidence.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
