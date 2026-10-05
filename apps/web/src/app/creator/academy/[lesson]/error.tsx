"use client";

import { SocialRouteError } from "@/components/features/creator/social/shared/route-error";

export default function LessonError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <SocialRouteError error={error} retry={retry} area="This lesson" />;
}
