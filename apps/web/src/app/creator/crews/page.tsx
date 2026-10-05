import { CrewsView } from "@/components/features/creator/social/crews/crews-view";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Crews", "Join a crew of 3 to 20 creators with a shared weekly board and a goal, or start one at Gold. Leave any time.", "/creator/crews");

export default function Page() {
  return <CrewsView />;
}
