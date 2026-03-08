import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Upgrade Your Plan",
  description: "Unlock more credits and features with Draft AI Pro.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
