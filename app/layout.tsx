import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "PayProof — Merchant Desk", description: "A fictional storefront and simulated merchant incident console." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
