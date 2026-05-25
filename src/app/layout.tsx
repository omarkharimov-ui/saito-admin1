import type { Metadata } from "next";
import { Geist, Playfair_Display } from "next/font/google";
import "./globals.css";
import { UIProvider } from "@/context/UIContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { CartProvider } from "@/context/CartContext";
import ClientLayout from "@/components/layout/ClientLayout";
import { CustomNotificationProvider } from "@/components/CustomNotification";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

export const metadata: Metadata = {
  title: "SAITO Admin",
  description: "Restaurant Management System",
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${geistSans.variable} ${playfairDisplay.variable} h-full antialiased`}
    >
      <head>
        <meta name="theme-color" content="#d4af37" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Saito Admin" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-TileColor" content="#d4af37" />
        <meta name="msapplication-tap-highlight" content="no" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" media="(prefers-color-scheme: light)" />
        <link rel="icon" type="image/svg+xml" href="/favicon-dark.svg" media="(prefers-color-scheme: dark)" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon-precomposed" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,500&subset=cyrillic,latin&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-[100dvh] flex flex-col bg-background text-foreground">
        <LanguageProvider>
          <UIProvider>
            <CartProvider>
                <CustomNotificationProvider />
                <ClientLayout>
                  <main className="flex-1 overflow-y-auto scrollbar-none">
                    {children}
                  </main>
                </ClientLayout>
            </CartProvider>
          </UIProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
