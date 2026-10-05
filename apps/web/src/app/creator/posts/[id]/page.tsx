import { PostDetail } from "@/components/features/creator/core/post-detail";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Post", "The View Ledger, the money path and the dispute option for one of your posts.", "/creator/posts");

export default async function CreatorPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostDetail postId={id} />;
}
