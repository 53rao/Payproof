import type { Metadata } from "next";
import "./globals.css";
import "./storefront.css";
export const metadata: Metadata = {
  title: "Little Things Supply Co. — The Everyday Archive",
  description: "Useful, beautiful objects for home, work, travel, and slower days.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
