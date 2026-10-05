import { ReferralsView } from "@/components/features/creator/social/referrals/referrals-view";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Referrals", "Invite a creator and earn 5% of their cleared earnings for 90 days, capped at 00 per person, paid by flowd.", "/creator/referrals");

export default function Page() {
  return <ReferralsView />;
}
