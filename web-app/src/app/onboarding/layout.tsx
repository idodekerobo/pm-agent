import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get Started",
  description: "Set up your Draft AI workspace and connect your tools.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
