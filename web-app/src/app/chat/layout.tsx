import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chat",
  description: "Talk to your AI Product Manager Agent. Spec features, prioritize your backlog, and get instant product strategy help.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
