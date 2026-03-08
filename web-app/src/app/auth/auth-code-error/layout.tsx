import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Auth Error",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
