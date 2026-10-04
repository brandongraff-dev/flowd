import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignGallery } from "./_gallery/gallery";

export const metadata: Metadata = {
  title: "Design system",
  description: "Every flowd primitive in dark and light: Liquid Glass layers, controls, forms, numbers, feedback, overlays and type.",
  robots: { index: false, follow: false },
};

/**
 * Developer gallery for the design system. Available in development; in production it 404s unless
 * NEXT_PUBLIC_DEV_ROUTES=1 is set (so a staging build can still expose it).
 */
export default function DesignPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEV_ROUTES !== "1") notFound();
  return <DesignGallery />;
}
