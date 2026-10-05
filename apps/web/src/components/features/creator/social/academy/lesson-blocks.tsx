import { Lightbulb } from "lucide-react";
import { Callout } from "@/components/ui";
import type { LessonBlock } from "@/lib/contract/types";
import { cn } from "@/lib/utils";

const lines = (body: string): string[] =>
  body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** Anchor id of a block, shared with the table of contents. */
export const blockId = (index: number): string => `lesson-block-${index}`;

function Paragraphs({ body, className }: { body: string; className?: string }) {
  return (
    <>
      {body
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index} className={cn("text-body-lg text-pretty text-fg-muted", className)}>
            {paragraph}
          </p>
        ))}
    </>
  );
}

function BlockList({ items, ordered }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className="grid gap-2.5">
      {items.map((item, index) => (
        <li key={item} className="flex items-start gap-3 text-body text-fg">
          {ordered ? (
            <span aria-hidden="true" className="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-caption font-semibold text-accent tabular-nums">
              {index + 1}
            </span>
          ) : (
            <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-current opacity-60" />
          )}
          <span className="text-pretty">{item}</span>
        </li>
      ))}
    </Tag>
  );
}

/** "Before: ... After: ..." examples read as two labelled lines, so the change is the thing you see. */
function Example({ block }: { block: LessonBlock }) {
  const match = /^Before:\s*(.+?)\s*After:\s*(.+)$/s.exec(block.body);
  return (
    <figure className="grid gap-3 rounded-2xl bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
      <figcaption className="flex items-baseline gap-2">
        <span className="fd-eyebrow text-info">Example</span>
        {block.title ? <span className="text-body-sm font-semibold text-fg">{block.title}</span> : null}
      </figcaption>
      {match ? (
        <dl className="grid gap-2.5">
          <div className="grid gap-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-3">
            <dt className="text-caption font-semibold text-rose">Before</dt>
            <dd className="text-body text-fg-muted">{match[1]}</dd>
          </div>
          <div className="grid gap-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-3">
            <dt className="text-caption font-semibold text-mint">After</dt>
            <dd className="text-body font-medium text-fg">{match[2]}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-body text-pretty text-fg-muted">{block.body}</p>
      )}
    </figure>
  );
}

function Block({ block, index }: { block: LessonBlock; index: number }) {
  const id = blockId(index);
  if (block.kind === "tip" || block.kind === "warning") {
    const items = lines(block.body);
    return (
      <Callout
        id={id}
        tone={block.kind === "tip" ? "accent" : "sun"}
        icon={block.kind === "tip" ? <Lightbulb /> : undefined}
        title={block.title ?? (block.kind === "tip" ? "Tip" : "Watch out")}
        className="scroll-mt-28"
      >
        {items.length > 1 ? <BlockList items={items} /> : <span className="text-pretty">{block.body}</span>}
      </Callout>
    );
  }
  if (block.kind === "example") {
    return (
      <div id={id} className="scroll-mt-28">
        <Example block={block} />
      </div>
    );
  }
  return (
    <section id={id} aria-labelledby={block.title ? `${id}-title` : undefined} className="grid scroll-mt-28 gap-3">
      {block.title ? (
        <h2 id={`${id}-title`} className="font-display text-title-md text-fg">
          {block.title}
        </h2>
      ) : null}
      {block.kind === "steps" ? <BlockList items={lines(block.body)} ordered /> : <Paragraphs body={block.body} />}
    </section>
  );
}

/** A lesson's blocks in order: prose, numbered steps, tips and warnings as callouts, and examples as labelled before/after. Max 62ch for comfortable reading. */
export function LessonBlocks({ blocks }: { blocks: readonly LessonBlock[] }) {
  return (
    <div className="grid max-w-[68ch] gap-7">
      {blocks.map((block, index) => (
        <Block key={index} block={block} index={index} />
      ))}
    </div>
  );
}
