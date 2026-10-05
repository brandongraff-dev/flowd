import { BadgeCheck, Minus, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, type Tone } from "@/components/ui/badge";
import { CONFIDENCE_LABEL, CONFIDENCE_MEANING, FLOWD_CELLS, LAST_VERIFIED, TOPICS, type Competitor, type Confidence, type Fact, type TopicId } from "./compare-data";

const TONE: Record<Confidence, Tone> = { verified: "accent", reported: "info", not_documented: "neutral" };
const ICON: Record<Confidence, typeof BadgeCheck> = { verified: BadgeCheck, reported: Quote, not_documented: Minus };

/** A small tag saying how well we know a fact. The meaning is in the legend and in the tooltip; the word is always printed, never colour alone. */
export function ConfidenceTag({ tag }: { tag: Confidence }) {
  const Icon = ICON[tag];
  return (
    <Badge tone={TONE[tag]} variant="outline" size="sm" title={CONFIDENCE_MEANING[tag]} icon={<Icon aria-hidden="true" strokeWidth={2.25} />}>
      {CONFIDENCE_LABEL[tag]}
    </Badge>
  );
}

function Facts({ facts }: { facts: readonly Fact[] }) {
  return (
    <ul className="grid gap-3">
      {facts.map((fact) => (
        <li key={fact.text} className="grid justify-items-start gap-1.5">
          <p className="text-caption text-pretty text-fg">{fact.text}</p>
          <ConfidenceTag tag={fact.tag} />
        </li>
      ))}
    </ul>
  );
}

/** The key to the three tags. */
export function ConfidenceLegend({ className }: { className?: string }) {
  return (
    <dl className={cn("grid gap-3 sm:grid-cols-3", className)}>
      {(Object.keys(CONFIDENCE_LABEL) as Confidence[]).map((tag) => (
        <div key={tag} className="grid content-start gap-1.5">
          <dt>
            <ConfidenceTag tag={tag} />
          </dt>
          <dd className="text-caption text-fg-subtle">{CONFIDENCE_MEANING[tag]}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * flowd beside up to three others, row by row. On a wide screen it is a real table (row headers, column headers); on a phone each topic becomes a card with
 * the products stacked under it. Every cell is tagged verified, reported or not documented, every column carries its last-verified date, and a closing row
 * says where the other product is better.
 */
export function CompareGrid({ competitors, caption, topicIds }: { competitors: readonly Competitor[]; caption: string; topicIds?: readonly TopicId[] }) {
  const columns = competitors.length + 1;
  const topics = topicIds ? TOPICS.filter((topic) => topicIds.includes(topic.id)) : TOPICS;
  return (
    <div>
      {/* wide screens: a table */}
      <div className="hidden overflow-hidden rounded-[28px] bg-surface shadow-rest ring-1 ring-rim lg:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            <col style={{ width: "11rem" }} />
            {Array.from({ length: columns }, (_, index) => (
              <col key={index} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-divider align-bottom">
              <td className="p-5" />
              <th scope="col" className="p-5">
                <span className="grid gap-1">
                  <span className="font-display text-title-md text-fg">flowd</span>
                  <span className="text-caption font-normal text-fg-subtle">Our own published terms</span>
                </span>
              </th>
              {competitors.map((competitor) => (
                <th key={competitor.id} scope="col" className="p-5">
                  <span className="grid gap-1">
                    <span className="font-display text-title-md text-fg">{competitor.name}</span>
                    <span className="text-caption font-normal text-fg-subtle">Last verified {LAST_VERIFIED}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <tr key={topic.id} className="border-b border-divider align-top last:border-b-0">
                <th scope="row" className="p-5 text-left">
                  <span className="grid gap-1.5">
                    <span className="text-body-sm font-semibold text-fg">{topic.label}</span>
                    {topic.caution ? <span className="text-micro font-normal text-fg-subtle">{topic.caution}</span> : null}
                  </span>
                </th>
                <td className="bg-accent-soft/60 p-5">
                  <Facts facts={FLOWD_CELLS[topic.id]} />
                </td>
                {competitors.map((competitor) => (
                  <td key={competitor.id} className="p-5">
                    <Facts facts={competitor.cells[topic.id]} />
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-rim-strong bg-surface-field align-top">
              <th scope="row" className="p-5 text-left text-body-sm font-semibold text-fg">
                Where they are better
              </th>
              <td className="p-5 text-caption text-fg-subtle">We say so for each of them.</td>
              {competitors.map((competitor) => (
                <td key={competitor.id} className="p-5">
                  <ul className="grid gap-2">
                    {competitor.better.map((point) => (
                      <li key={point} className="text-caption text-pretty text-fg">
                        {point}
                      </li>
                    ))}
                  </ul>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* small screens: a card per topic */}
      <div className="grid gap-4 lg:hidden">
        {topics.map((topic) => (
          <section key={topic.id} aria-labelledby={`cmp-${topic.id}`} className="grid gap-4 rounded-[24px] bg-surface p-5 shadow-rest ring-1 ring-rim">
            <div className="grid gap-1">
              <h3 id={`cmp-${topic.id}`} className="text-title-sm text-fg">
                {topic.label}
              </h3>
              {topic.caution ? <p className="text-micro text-fg-subtle">{topic.caution}</p> : null}
            </div>
            <div className="grid gap-4">
              <div className="grid gap-2 rounded-2xl bg-accent-soft p-4">
                <p className="text-body-sm font-semibold text-fg">flowd</p>
                <Facts facts={FLOWD_CELLS[topic.id]} />
              </div>
              {competitors.map((competitor) => (
                <div key={competitor.id} className="grid gap-2 px-1">
                  <p className="text-body-sm font-semibold text-fg">{competitor.name}</p>
                  <Facts facts={competitor.cells[topic.id]} />
                </div>
              ))}
            </div>
          </section>
        ))}
        <section className="grid gap-4 rounded-[24px] bg-surface-field p-5 ring-1 ring-rim" aria-labelledby="cmp-better">
          <h3 id="cmp-better" className="text-title-sm text-fg">
            Where they are better
          </h3>
          {competitors.map((competitor) => (
            <div key={competitor.id} className="grid gap-2">
              <p className="text-body-sm font-semibold text-fg">
                {competitor.name} <span className="text-caption font-normal text-fg-subtle">Last verified {LAST_VERIFIED}</span>
              </p>
              <ul className="grid gap-1.5">
                {competitor.better.map((point) => (
                  <li key={point} className="text-caption text-pretty text-fg">
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
