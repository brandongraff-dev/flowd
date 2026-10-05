import { Container } from "@/components/shell/container";
import { Skeleton, SkeletonGroup, SkeletonText } from "@/components/ui/skeleton";

/** Shown while a marketing page streams: the shape of a page header and a row of cards, so nothing jumps when the content lands. */
export default function MarketingLoading() {
  return (
    <SkeletonGroup label="Loading the page" className="py-12 md:py-20">
      <Container size="wide" className="grid gap-12">
        <div className="grid max-w-3xl gap-5">
          <Skeleton shape="pill" className="h-5 w-40" />
          <Skeleton className="h-16 w-full max-w-xl md:h-24" />
          <Skeleton className="h-16 w-2/3 max-w-md md:h-24" />
          <SkeletonText lines={2} className="max-w-xl" />
          <div className="flex gap-3">
            <Skeleton shape="pill" className="h-11 w-40" />
            <Skeleton shape="pill" className="h-11 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-56 rounded-[28px]" />
          ))}
        </div>
      </Container>
    </SkeletonGroup>
  );
}
