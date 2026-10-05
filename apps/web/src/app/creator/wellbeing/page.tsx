import { WellbeingView } from "@/components/features/creator/social/wellbeing/wellbeing-view";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Wellbeing Mode", "Quiet hours, numbers-off, a soft pace goal, rest weeks and a pause that keeps your tier and streak.", "/creator/wellbeing");

export default function Page() {
  return <WellbeingView />;
}
