import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Background } from "@/components/background";
import { ThemeProvider, themeInitScript, compactInitScript } from "@/components/theme-provider";
import { ThemedToaster } from "@/components/themed-toaster";
import { SplashScreen } from "@/components/splash-screen";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Expire X — never miss an expiry",
  description:
    "Track expiry dates for food, medicine, cosmetics, documents and more. Scan a label, confirm the details, and get reminded before it's too late.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Expire X", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F8FD" },
    { media: "(prefers-color-scheme: dark)", color: "#070B16" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={{ variables: { colorPrimary: "#2563EB" } }}>
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
          <script dangerouslySetInnerHTML={{ __html: compactInitScript }} />
        </head>
        <body className={inter.className}>
          <ThemeProvider>
            <Background />
            {children}
            <ThemedToaster />
            <SplashScreen />
            <PwaRegister />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
