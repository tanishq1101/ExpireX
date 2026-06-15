import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "sonner";
import { Background } from "@/components/background";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Expire X — never miss an expiry",
  description: "Track expiry dates for food, medicine, cosmetics, documents and more.",
};

export const viewport: Viewport = {
  themeColor: "#0B0B0B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: { colorPrimary: "#2D7DFF", colorBackground: "#0B0B0B" },
      }}
    >
      <html lang="en" className="dark">
        <body className={inter.className}>
          <Background />
          {children}
          <Toaster theme="dark" position="top-center" richColors />
        </body>
      </html>
    </ClerkProvider>
  );
}
