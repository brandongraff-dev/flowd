import { CreatorHome } from "@/components/features/creator/core/creator-home";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Home", "Your Money Clock, today's Daily Drop, your streak and what to post today.", "/creator");

export default function CreatorHomePage() {
  return <CreatorHome />;
}
