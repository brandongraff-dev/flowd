import { buildMetadata } from "@/lib/seo";
import { getAuthSnapshot } from "@/components/features/auth/auth-data";
import { CreatorSignup } from "@/components/features/auth/creator-signup";

export const metadata = buildMetadata({
  title: "Create a creator account",
  description: "Make your first video for a flowd-funded starter bounty. Decision within 24 hours, cleared within 48 hours of approval. Creators never pay to join.",
  path: "/signup/creator",
});

export default async function CreatorSignupPage() {
  return <CreatorSignup snapshot={await getAuthSnapshot()} />;
}
