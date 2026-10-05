import { AcademyView } from "@/components/features/creator/social/academy/academy-view";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Academy", "Ten free lessons of five minutes or less on hooks, rights, taxes and scams, each with a quiz and a badge.", "/creator/academy");

export default function AcademyPage() {
  return <AcademyView />;
}
