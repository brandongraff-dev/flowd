"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Clock } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, Button, EmptyState } from "@/components/ui";
import { LESSON_TOPIC_META } from "@/lib/contract/types";
import { useLesson, useStoreReady } from "@/lib/data";
import { formatDate, formatPct } from "@/lib/format";
import { actions } from "@/lib/store";
import { SocialSkeleton } from "../shared/skeletons";
import { BadgeMedal } from "./badge-medal";
import { blockId, LessonBlocks } from "./lesson-blocks";
import { LessonQuiz } from "./lesson-quiz";

export function LessonView({ slug }: { slug: string }) {
  const ready = useStoreReady();
  const lesson = useLesson(slug);
  const lessonId = lesson?.id;
  const status = lesson?.status;

  // Opening a lesson marks it started, once: the Academy then shows "Continue" instead of "Start".
  useEffect(() => {
    if (ready && lessonId && status === "not_started") void actions.startLesson({ lesson_id: lessonId });
  }, [ready, lessonId, status]);

  if (!ready) return <SocialSkeleton label="Loading lesson" layout="split" />;
  if (!lesson) {
    return (
      <div className="py-10">
        <EmptyState
          art="search"
          title="That lesson doesn't exist"
          description="It may have moved. The Academy lists all ten lessons."
          action={
            <Button asChild variant="primary">
              <Link href="/creator/academy">Back to the Academy</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const done = lesson.status === "completed";
  const outline = lesson.blocks.map((block, index) => ({ block, index })).filter((entry) => entry.block.title);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
      <header className="grid gap-5">
        <Link href="/creator/academy" className="inline-flex w-fit items-center gap-1.5 rounded-md py-1 text-body-sm font-medium text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Academy · Lesson {lesson.order} of 10
        </Link>
        <div className="grid max-w-3xl gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={LESSON_TOPIC_META[lesson.topic].tone} size="lg">
              {lesson.badge_label}
            </Badge>
            <Badge tone="neutral" size="lg" icon={<Clock />}>
              {lesson.read_minutes} min read
            </Badge>
            {done ? (
              <Badge tone="mint" size="lg" icon={<Check />}>
                Completed
              </Badge>
            ) : null}
          </div>
          <h1 className="font-display text-display-md text-balance text-fg">{lesson.title}</h1>
          <p className="max-w-[62ch] text-body-lg text-pretty text-fg-muted">{lesson.summary}</p>
        </div>
      </header>

      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,46rem)_17rem] lg:justify-between">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10">
          <LessonBlocks blocks={lesson.blocks} />
          <LessonQuiz key={lesson.id} lesson={lesson} />
          <nav aria-label="Lesson navigation" className="flex flex-wrap items-center justify-between gap-3">
            {lesson.prev_slug ? (
              <Button asChild variant="ghost" leadingIcon={<ArrowLeft />}>
                <Link href={`/creator/academy/${lesson.prev_slug}`}>Previous lesson</Link>
              </Button>
            ) : (
              <span />
            )}
            {lesson.next_slug ? (
              <Button asChild variant="secondary" trailingIcon={<ArrowRight />}>
                <Link href={`/creator/academy/${lesson.next_slug}`}>Next lesson</Link>
              </Button>
            ) : null}
          </nav>
        </div>

        <aside aria-label="About this lesson" className="grid content-start gap-4 lg:sticky lg:top-24">
          <GlassCard className="grid gap-4">
            <div className="flex items-center gap-3">
              <BadgeMedal art={lesson.badge_art} label={lesson.badge_label} earned={done} size={52} />
              <div className="grid gap-0.5">
                <p className="text-body-sm font-semibold text-fg">{lesson.badge_label}</p>
                <p className="text-caption text-fg-subtle">
                  {done && lesson.progress?.completed_at ? `Earned ${formatDate(lesson.progress.completed_at, "medium")}` : "Pass the quiz to earn it"}
                </p>
              </div>
            </div>
            {done && lesson.progress?.quiz_score !== undefined ? <p className="text-caption text-fg-muted">Best quiz score: {formatPct(lesson.progress.quiz_score, 0)}</p> : null}
            <p className="text-caption text-fg-subtle">+{lesson.reliability_bonus_points} reliability points when you pass, up to 5 across the Academy.</p>
          </GlassCard>
          {outline.length > 0 ? (
            <GlassCard className="grid gap-3">
              <p className="fd-eyebrow text-fg-subtle">In this lesson</p>
              <ol className="grid gap-1.5">
                {outline.map(({ block, index }) => (
                  <li key={index}>
                    <a href={`#${blockId(index)}`} className="block rounded-md py-1 text-body-sm text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg">
                      {block.title}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="#quiz" className="block rounded-md py-1 text-body-sm text-fg-muted transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg">
                    Check yourself
                  </a>
                </li>
              </ol>
            </GlassCard>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
