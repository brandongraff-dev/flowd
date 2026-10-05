import { PostsList } from "@/components/features/creator/core/posts-list";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata("Posts", "Your live and settled posts with verified views, installs, trials, what each earned and when the money lands.", "/creator/posts");

export default function CreatorPostsPage() {
  return <PostsList />;
}
