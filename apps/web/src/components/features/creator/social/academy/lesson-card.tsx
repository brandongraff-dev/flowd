import Link from "next/link";
import { ArrowRight, Check, Clock } from "lucide-react";
import { Glass } from "@/components/glass";
import { Badge } from "@/components/ui";
import { LESSON_TOPIC_META } from "@/lib/contract/types";
import type { LessonView } from "@/lib/data/selectors";
import { formatPct } from "@/lib/format";
import { BadgeMedal } from "./badge-medal";

/** One lesson as a card that is a single link: number, topic, title, summary, read time and where you are in it. */
export function LessonCard({ lesson }: { lesson: LessonView }) {
  const done = lesson.status === "completed";
  const started = lesson.status === "in_progress";
  return (
    <li className="grid">
      <Glass layer={1} asChild className="group/lesson grid h-full content-start gap-4 rounded-2xl p-5 transition-transform duration-(--fd-dur-base) ease-out hover:-translate-y-0.5 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
        <Link href={`/creator/academy/${lesson.slug}`} aria-describedby={`lesson-${lesson.slug}-status`}>
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-2">
              <span className="fd-eyebrow text-fg-subtle">Lesson {lesson.order}</span>
              <Badge tone={LESSON_TOPIC_META[lesson.topic].tone} size="md" variant="soft" className="w-fit">
                {lesson.badge_label}
              </Badge>
            </div>
            <BadgeMedal art={lesson.badge_art} label={lesson.badge_label} earned={done && lesson.progress?.badge_awarded === true} size={48} />
          </div>
          <div className="grid gap-1.5">
            <h3 className="font-display text-title-sm text-fg text-balance">{lesson.title}</h3>
            <p className="text-body-sm text-pretty text-fg-muted">{lesson.summary}</p>
          </div>
          <div className="mt-auto flex items-center justify-between gap-3 pt-1 text-caption">
            <span id={`lesson-${lesson.slug}-status`} className="inline-flex items-center gap-1.5 font-semibold">
              {done ? (
                <span className="inline-flex items-center gap-1.5 text-mint">
                  <Check aria-hidden="true" className="size-4 stroke-[2.5]" />
                  Done{lesson.progress?.quiz_score !== undefined ? ` · quiz ${formatPct(lesson.progress.quiz_score, 0)}` : ""}
                </span>
              ) : started ? (
                <span className="inline-flex items-center gap-1.5 text-info">
                  <Clock aria-hidden="true" className="size-4" />
                  In progress
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-fg-subtle">
                  <Clock aria-hidden="true" className="size-4" />
                  {lesson.read_minutes} min
                </span>
              )}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-accent">
              {done ? "Review" : started ? "Continue" : "Start"}
              <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-(--fd-dur-base) ease-out group-hover/lesson:translate-x-0.5 motion-reduce:transition-none" />
            </span>
          </div>
        </Link>
      </Glass>
    </li>
  );
}
