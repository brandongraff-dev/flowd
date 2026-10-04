import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChartsGallery } from "./_gallery/gallery";

export const metadata: Metadata = {
  title: "Charts",
  description: "Every flowd chart in dark and light: area, line, range band, retention, bars, funnel, heatmap, scatter, sparklines, donut and score rings.",
  robots: { index: false, follow: false },
};

/** Developer gallery for the chart kit. Development only (404 in production unless NEXT_PUBLIC_DEV_ROUTES=1), like /dev/design. */
export default function ChartsDesignPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEV_ROUTES !== "1") notFound();
  return <ChartsGallery />;
}
