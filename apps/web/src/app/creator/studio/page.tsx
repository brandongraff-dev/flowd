import { StudioPage } from "@/components/features/creator/core/studio/studio-page";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Studio", "Pick a bounty, write the script, upload a take and see its Hook Score and Flow Score with timecoded reasons before you submit.", "/creator/studio");

export default function CreatorStudioPage() {
  return <StudioPage />;
}
