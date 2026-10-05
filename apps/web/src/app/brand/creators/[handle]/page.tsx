import type { Metadata } from "next";
import { CreatorProfileViewPage } from "@/components/features/brand/market/creator-profile-view";

type Props = { params: Promise<{ handle: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params;
  return {
    title: `@${decodeURIComponent(handle)}`,
    description: "A creator profile: reliability with reasons, results on your apps, rate card and your history together.",
  };
}

export default async function CreatorProfilePage({ params }: Props) {
  const { handle } = await params;
  return <CreatorProfileViewPage handle={decodeURIComponent(handle)} />;
}
