import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandPageSkeleton } from "@/components/features/brand/core/page-states";
import { OnboardingWizard } from "@/components/features/brand/core/onboarding/onboarding-wizard";

export const metadata: Metadata = {
  title: "Connect your app",
  description: "Paste your App Store link, connect RevenueCat, add the SDK snippet and fund your first bounty.",
};

export default function BrandOnboardingPage() {
  return (
    <Suspense fallback={<BrandPageSkeleton label="Loading setup" kpis={false} />}>
      <OnboardingWizard />
    </Suspense>
  );
}
