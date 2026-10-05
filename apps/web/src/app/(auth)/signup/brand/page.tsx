import { buildMetadata } from "@/lib/seo";
import { getAuthSnapshot } from "@/components/features/auth/auth-data";
import { BrandSignup } from "@/components/features/auth/brand-signup";

export const metadata = buildMetadata({
  title: "Create a brand workspace",
  description: "Start on the Free plan with no monthly fee. Your first bounty has the platform fee waived and flowd matches up to $500 of the pool.",
  path: "/signup/brand",
});

export default async function BrandSignupPage() {
  return <BrandSignup snapshot={await getAuthSnapshot()} />;
}
