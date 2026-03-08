import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confirm Email",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
