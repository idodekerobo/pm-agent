import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/AuthContext";
import { BillingProvider } from "@/lib/BillingContext";
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
  title: {
    default: "Draft AI, Product Manager Agent",
    template: "%s | Draft AI, Product Manager Agent",
  },
  description: "Draft AI is your AI-powered Product Manager Agent. Spec features, research markets, and ship better products faster.",
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
        <AuthProvider>
          <BillingProvider>
            {children}
          </BillingProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
