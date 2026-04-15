import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/AuthContext";
import { BillingProvider } from "@/lib/BillingContext";
import { BridgeProvider } from "@/lib/BridgeContext";
import { IntegrationsProvider } from "@/lib/IntegrationsContext";
import { PostHogProvider, PostHogUserSync } from "@/lib/PostHogProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://app.draftai.us"),
  title: {
    default: "Draft AI, Product Manager Agent",
    template: "%s | Draft AI, Product Manager Agent",
  },
  description: "Draft AI is your AI-powered Product Manager Agent. Spec features, research markets, and ship better products faster.",
  openGraph: {
    siteName: "Draft AI",
    url: "https://app.draftai.us",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PostHogProvider>
          <AuthProvider>
            <PostHogUserSync />
            <BillingProvider>
              <IntegrationsProvider>
                <BridgeProvider>
                  {children}
                </BridgeProvider>
              </IntegrationsProvider>
            </BillingProvider>
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
