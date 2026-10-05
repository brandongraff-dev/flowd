"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CircleHelp, RotateCcw, X } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Button, Callout, RadioGroup, RadioGroupItem, notify } from "@/components/ui";
import type { LessonView } from "@/lib/data/selectors";
import { actions } from "@/lib/store";
import type { LessonResult } from "@/lib/store/core/creator";
import { cn } from "@/lib/utils";
import { useRun } from "../shared/run-action";
import { BadgeMedal } from "./badge-medal";


const PASS_LABEL = "2 of 3 passes";

/**
 * The three-question check at the end of a lesson. Two of three passes and awards the badge. A miss is not a failure: every answer
 * comes back with its explanation, and you can try again right away. Nothing here costs you money or a tier.
 */
export function LessonQuiz({ lesson }: { lesson: LessonView }) {
  const baseId = useId();
  const [answers, setAnswers] = useState<(number | undefined)[]>(() => lesson.quiz.map(() => undefined));
  const [result, setResult] = useState<LessonResult | null>(null);
  const [missing, setMissing] = useState(false);
  const { busy, run } = useRun();
  const groups = useRef<(HTMLFieldSetElement | null)[]>([]);
  const resultRef = useRef<HTMLDivElement>(null);

  const submit = async (): Promise<void> => {
    const firstOpen = answers.findIndex((answer) => answer === undefined);
    if (firstOpen !== -1) {
      setMissing(true);
      groups.current[firstOpen]?.querySelector<HTMLElement>("[role=radio]")?.focus();
      return;
    }
    setMissing(false);
    const data = await run("quiz", () => actions.completeLesson({ lesson_id: lesson.id, answers: answers.map((answer) => answer ?? 0) }));
    if (!data) return;
    setResult(data);
    if (data.badge_awarded) notify.success(`Badge earned: ${lesson.badge_label}`, { description: `+${lesson.reliability_bonus_points} reliability points, up to 5 across the Academy.` });
    requestAnimationFrame(() => resultRef.current?.focus());
  };

  const retry = (): void => {
    setResult(null);
    setAnswers(lesson.quiz.map(() => undefined));
    setMissing(false);
  };

  const locked = result !== null;
  const passed = result?.passed === true;

  return (
    <GlassCard id="quiz" padding="lg" aria-labelledby={`${baseId}-title`} className="grid scroll-mt-28 gap-7">
      <div className="grid gap-1.5">
        <h2 id={`${baseId}-title`} className="flex items-center gap-2.5 font-display text-title-lg text-fg">
          <CircleHelp aria-hidden="true" className="size-6 text-accent" />
          Check yourself
        </h2>
        <p className="text-body-sm text-fg-muted">
          Three questions, {PASS_LABEL}. Your answers are private and a miss costs nothing. {lesson.status === "completed" ? "You already earned this badge; retaking keeps your best score." : null}
        </p>
      </div>

      <ol className="grid gap-8">
        {lesson.quiz.map((question, index) => {
          const review = result?.review[index];
          const name = `${baseId}-q${index}`;
          return (
            <li key={question.prompt} className="grid gap-3">
              <fieldset ref={(node) => { groups.current[index] = node; }} className="grid min-w-0 gap-3" disabled={locked}>
                <legend className="mb-1 flex gap-3 text-body font-semibold text-fg">
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-active text-caption tabular-nums">
                    {index + 1}
                  </span>
                  <span className="text-pretty">{question.prompt}</span>
                </legend>
                <RadioGroup
                  aria-label={question.prompt}
                  name={name}
                  value={answers[index] === undefined ? "" : String(answers[index])}
                  onValueChange={(value) => {
                    setAnswers((current) => current.map((answer, i) => (i === index ? Number(value) : answer)));
                    setMissing(false);
                  }}
                  className="gap-2 pl-10"
                >
                  {question.options.map((option, optionIndex) => {
                    const isAnswer = review && optionIndex === question.answer_index;
                    const wrongPick = review && !review.correct && answers[index] === optionIndex;
                    return (
                      <RadioGroupItem
                        key={option}
                        id={`${name}-${optionIndex}`}
                        value={String(optionIndex)}
                        variant="card"
                        label={option}
                        meta={isAnswer ? <Check aria-label="Correct answer" className="size-4 text-mint" /> : wrongPick ? <X aria-label="Your answer" className="size-4 text-rose" /> : undefined}
                        className={cn(isAnswer && "shadow-[inset_0_0_0_1.5px_var(--fd-mint)]", wrongPick && "shadow-[inset_0_0_0_1.5px_var(--fd-rose)]")}
                      />
                    );
                  })}
                </RadioGroup>
              </fieldset>
              {review ? (
                <p className={cn("ml-10 text-body-sm", review.correct ? "text-mint" : "text-fg-muted")}>
                  <span className="font-semibold">{review.correct ? "Right. " : "Not quite. "}</span>
                  {review.explanation}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div ref={resultRef} tabIndex={-1} role="status" aria-live="polite" className="outline-none">
        {missing ? (
          <Callout tone="sun" title="Answer all three questions">
            Pick one option for each. You can change it before you check.
          </Callout>
        ) : null}
        {result ? (
          <Callout
            tone={passed ? "mint" : "info"}
            title={passed ? `Passed: ${result.correct} of ${result.total}` : `${result.correct} of ${result.total}. You need 2.`}
            action={
              passed ? undefined : (
                <Button size="sm" variant="secondary" leadingIcon={<RotateCcw />} onClick={retry}>
                  Try again
                </Button>
              )
            }
          >
            {passed ? (
              <span className="grid gap-3">
                <span>{result.badge_awarded ? `Badge earned: ${lesson.badge_label}.` : "Your best score is kept."}</span>
                <BadgeMedal art={lesson.badge_art} label={lesson.badge_label} earned size={56} />
              </span>
            ) : (
              "Read the explanations above, then try again. You can retake it as often as you like."
            )}
          </Callout>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!locked ? (
          <Button variant="primary" loading={busy === "quiz"} onClick={() => void submit()}>
            Check my answers
          </Button>
        ) : null}
        {passed && lesson.next_slug ? (
          <Button asChild variant="primary" trailingIcon={<ArrowRight />}>
            <Link href={`/creator/academy/${lesson.next_slug}`}>Next lesson</Link>
          </Button>
        ) : null}
        {locked ? (
          <Button asChild variant="ghost">
            <Link href="/creator/academy">Back to the Academy</Link>
          </Button>
        ) : (
          <p className="text-caption text-fg-subtle">Free, private, and you can retake it.</p>
        )}
      </div>
    </GlassCard>
  );
}
