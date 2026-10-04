import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShellDemo } from "./shell-demo";

export const metadata: Metadata = {
  title: "AppShell demo",
  description: "A live AppShell with the brand navigation, top bar, command palette and a full page of content.",
  robots: { index: false, follow: false },
};

/** The real AppShell, full page. Development only (404 in production unless NEXT_PUBLIC_DEV_ROUTES=1). */
export default function ShellDemoPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEV_ROUTES !== "1") notFound();
  return <ShellDemo />;
}
