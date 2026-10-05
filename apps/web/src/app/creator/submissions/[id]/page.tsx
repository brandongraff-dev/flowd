import { SubmissionDetail } from "@/components/features/creator/core/submission-detail";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Submission", "The decision, the timecoded notes, your versions and what to do next, for one video.", "/creator/submissions");

export default async function CreatorSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubmissionDetail submissionId={id} />;
}
