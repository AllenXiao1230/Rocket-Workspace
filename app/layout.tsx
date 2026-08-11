import type { Metadata } from "next";
import "./globals.css";
import "./table-editor.css";
import "./theme.css";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Rocket Workspace",
  description: "Self-hosted collaborative project workspace",
  metadataBase: new URL(process.env.NEXTAUTH_URL || "http://localhost:3000"),
  openGraph: {
    title: "Rocket Workspace · Mission Control",
    description: "Self-hosted collaborative project workspace",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "Rocket Workspace Mission Control",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rocket Workspace · Mission Control",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
