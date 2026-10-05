import { GlassCard } from "@/components/glass/glass";
import { Skeleton, SkeletonGroup } from "@/components/ui";

/** Shown while an auth page loads: the heading and the form card in the shape of the real page, so nothing jumps. */
export default function AuthLoading() {
  return (
    <SkeletonGroup label="Loading" className="mx-auto grid w-full max-w-[1100px] gap-10">
      <div className="grid gap-4">
        <Skeleton shape="pill" className="h-3.5 w-28" />
        <Skeleton className="h-12 w-full max-w-md" />
        <Skeleton shape="text" className="w-full max-w-lg" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <GlassCard key={index} padding="md" className="grid gap-4">
            <Skeleton shape="circle" className="size-16" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton shape="text" className="w-full" />
            <Skeleton shape="text" className="w-4/5" />
            <Skeleton shape="pill" className="h-11 w-full" />
          </GlassCard>
        ))}
      </div>
    </SkeletonGroup>
  );
}
