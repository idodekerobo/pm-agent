import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your Draft AI account, integrations, agent files, and billing.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
