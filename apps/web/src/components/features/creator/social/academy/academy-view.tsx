"use client";

import Link from "next/link";
import { ArrowRight, GraduationCap, Heart } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Badge, Button, EmptyState, ProgressRing } from "@/components/ui";
import { PageHeader, Section } from "@/components/shell";
import { CONSTANTS } from "@/lib/engine";
import { useAcademy, useStoreReady } from "@/lib/data";
import { SocialSkeleton } from "../shared/skeletons";
import { BadgeMedal } from "./badge-medal";
import { LessonCard } from "./lesson-card";

export function AcademyView() {
  const ready = useStoreReady();
  const academy = useAcademy();
  if (!ready) return <SocialSkeleton label="Loading the Academy" layout="grid" />;

  const { lessons, completed, total, next, graduate, reliability_bonus: bonus } = academy;
  const bonusCap = CONSTANTS.reliability.creator.academy_bonus_cap;
  const earned = new Set(academy.badges.map((badge) => badge.lesson_id));
  const resume = lessons.find((lesson) => lesson.status === "in_progress") ?? next;
  const inProgress = resume?.status === "in_progress";

  if (lessons.length === 0) {
    return <EmptyState art="inbox" title="No lessons yet" description="The Academy is free and takes five minutes a lesson. It will appear here." />;
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10">
      <PageHeader
        eyebrow="Learn"
        title="Academy"
        description="Ten short lessons on hooks, briefs, rights, taxes and scams. Five minutes or less each, with a three-question quiz and a badge."
        meta={
          <Badge tone="mint" size="lg" icon={<Heart />}>
            Free and never required
          </Badge>
        }
      />

      <GlassCard padding="lg" aria-labelledby="academy-progress" className="grid gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:items-center md:gap-10">
        <ProgressRing value={completed} max={total} size={132} thickness={12} tone={graduate ? "mint" : "flow"} aria-label="Lessons completed" valueText={`${completed} of ${total} lessons completed`}>
          <span className="grid justify-items-center leading-none">
            <span className="font-display text-figure-lg tabular-nums">
              {completed}
              <span className="text-title-sm text-fg-subtle">/{total}</span>
            </span>
            <span className="mt-1 text-caption font-medium text-fg-subtle">lessons</span>
          </span>
        </ProgressRing>
        <div className="grid min-w-0 gap-5">
          <div className="grid gap-1.5">
            <h2 id="academy-progress" className="font-display text-title-lg text-fg">
              {graduate ? "You finished the Academy" : completed === 0 ? "Start with your first video" : `${total - completed} to go`}
            </h2>
            <p className="max-w-[60ch] text-body text-fg-muted">
              {graduate
                ? "Academy graduate is on your profile. Brands see that you know the rules."
                : `Each lesson you pass adds ${CONSTANTS.reliability.creator.academy_bonus_per_lesson} reliability points, up to ${bonusCap}. Reliability counts toward Platinum and Elite. You have ${bonus} of ${bonusCap} so far.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {resume ? (
              <Button asChild variant="primary" trailingIcon={<ArrowRight />}>
                <Link href={`/creator/academy/${resume.slug}`}>{inProgress ? "Continue lesson" : "Start lesson"}</Link>
              </Button>
            ) : null}
            {resume ? (
              <span className="min-w-0 text-caption text-fg-subtle">
                Lesson {resume.order}: {resume.title} · {resume.read_minutes} minute read
              </span>
            ) : null}
          </div>
        </div>
      </GlassCard>

      <Section title="Your badges" description="Pass a quiz and the badge is yours. Finish all ten for Academy graduate.">
        <GlassCard padding="md">
          <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            {lessons.map((lesson) => (
              <li key={lesson.id} className="flex items-center gap-3">
                <BadgeMedal art={lesson.badge_art} label={lesson.badge_label} earned={earned.has(lesson.id)} size={44} />
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-body-sm font-semibold text-fg">{lesson.badge_label}</span>
                  <span className="text-caption text-fg-subtle">{earned.has(lesson.id) ? "Earned" : "Not yet"}</span>
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </Section>

      <Section title="The ten lessons" description="Take them in any order. Your progress is saved as you go.">
        <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))}
        </ol>
      </Section>

      <GlassCard className="flex flex-wrap items-center gap-4">
        <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <GraduationCap className="size-5" />
        </span>
        <p className="min-w-0 flex-1 basis-64 text-body-sm text-fg-muted">
          {academy.note} Skipping a lesson never costs you a bounty, a payout or a tier. The lessons just save you from mistakes other creators already made.
        </p>
      </GlassCard>
    </div>
  );
}
