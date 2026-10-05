import { TiersView } from "@/components/features/creator/social/tiers/tiers-view";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Tiers", "Bronze to Elite: what each tier asks for, how close you are, and what the next one unlocks.", "/creator/tiers");

export default function TiersPage() {
  return <TiersView />;
}
