import type { Metadata } from "next";
import { LessonView } from "@/components/features/creator/social/academy/lesson-view";
import { noindexMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ lesson: string }> }): Promise<Metadata> {
  const { lesson } = await params;
  const title = lesson.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  return noindexMetadata(title, "A free Academy lesson of five minutes or less, with a three-question quiz and a badge.", `/creator/academy/${lesson}`);
}

export default async function LessonPage({ params }: { params: Promise<{ lesson: string }> }) {
  const { lesson } = await params;
  return <LessonView slug={lesson} />;
}
