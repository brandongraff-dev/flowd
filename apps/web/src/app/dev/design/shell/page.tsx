import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShellGallery } from "./_gallery/gallery";

export const metadata: Metadata = {
  title: "Shell and brand kit",
  description: "The flowd app shell, page primitives, stat tiles, data table, timelines, phone mock-ups, payout moments and brand pieces in dark and light.",
  robots: { index: false, follow: false },
};

/** Developer gallery for the shell, composites and brand kit. Development only (404 in production unless NEXT_PUBLIC_DEV_ROUTES=1), like /dev/design. */
export default function ShellDesignPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEV_ROUTES !== "1") notFound();
  return <ShellGallery />;
}
