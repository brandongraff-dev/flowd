import { SubmissionsList } from "@/components/features/creator/core/submissions-list";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Submissions", "Every video you sent, grouped by where it stands, with the brand's decide-by time and what is reserved for it.", "/creator/submissions");

export default function CreatorSubmissionsPage() {
  return <SubmissionsList />;
}
