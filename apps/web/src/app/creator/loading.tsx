import { Skeleton, SkeletonGroup } from "@/components/ui";

/** Shown while a creator page streams in: the shape of a page (title, a hero figure, two cards), not a spinner. */
export default function CreatorLoading() {
  return (
    <SkeletonGroup label="Loading your page" className="grid gap-8">
      <div className="grid gap-3">
        <Skeleton shape="text" className="h-3 w-24" />
        <Skeleton className="h-11 w-2/3 max-w-md" />
        <Skeleton shape="text" className="w-full max-w-lg" />
      </div>
      <Skeleton className="h-52 w-full rounded-[28px]" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-44 w-full rounded-[28px]" />
        <Skeleton className="h-44 w-full rounded-[28px]" />
      </div>
    </SkeletonGroup>
  );
}
