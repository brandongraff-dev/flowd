import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GlassCard } from "@/components/glass/glass";
import { JsonLd } from "@/lib/seo/json-ld-script";
import { faqJsonLd } from "@/lib/seo/json-ld";

export interface FaqEntry {
  question: string;
  /** Plain text answer: also used for the structured data, so keep it free of markup. */
  answer: string;
}

/**
 * A FAQ in an accordion (keyboard: arrows, Home, End, Space) with matching FAQPage structured data. Every question on the page is in the markup, and
 * only those: structured data must describe what is visible.
 */
export function Faq({ items, defaultOpen }: { items: readonly FaqEntry[]; defaultOpen?: string }) {
  return (
    <>
      <GlassCard padding="none" className="rounded-[28px] px-5 py-2 sm:px-8">
        <Accordion defaultValue={defaultOpen}>
          {items.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger className="text-body">{item.question}</AccordionTrigger>
              <AccordionContent>
                <p className="max-w-[68ch] pb-4 text-body-sm text-pretty text-fg-muted">{item.answer}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </GlassCard>
      <JsonLd data={faqJsonLd(items)} />
    </>
  );
}

export const HOME_FAQ: readonly FaqEntry[] = [
  {
    question: "Is it free for creators?",
    answer: "Yes. Creators never pay a platform fee, to join or to be paid. The weekly payout on Fridays is free. Instant cash-out is optional and costs 1.5% (minimum $0.50, maximum $15), shown before you confirm.",
  },
  {
    question: "How much will I earn?",
    answer: "It varies a lot, so we show the typical creator beside the top 10%, for the last 30 days, with the method one click away. A bounty pays a rate per 1,000 verified views, plus bonuses on tracked installs and trials, up to a per-video cap. Approval isn't guaranteed: your video has to meet the brief, and a video that is not approved earns nothing.",
  },
  {
    question: "When do I get paid?",
    answer: "Views count for 72 hours after you post. After a view and disclosure check, the money clears at the next daily run (14:00 UTC), and the weekly payout runs on Fridays at 18:00 UTC. Every earning shows its state, a dated ETA and a named reason for any delay.",
  },
  {
    question: "What does flowd cost for an app team?",
    answer: "A platform fee on creator spend: 12% on the Free plan, 10% on Pro ($299 a month) and 8% on Scale ($999 a month). Install-only and trial-only bounties are a flat 6%, charged only on cleared conversions. Card processing is passed through at cost. Your first bounty has the fee waived, and flowd matches up to $500. We show the all-in CPM everywhere a price appears.",
  },
  {
    question: "What is escrow, and what is the Funded badge?",
    answer: "A bounty cannot go live until its pool and fee reserve are in escrow. The Funded badge shows only on fully escrowed bounties. When a creator submits, up to the per-video cap is reserved, so an approved post is paid even if the pool later empties. Unspent money returns to the brand.",
  },
  {
    question: "What if a brand rejects my video, or never answers?",
    answer: "Brands decide within 72 hours. A rejection needs a reason code and evidence, feedback is timecoded, two revisions are included and you get one appeal. At 72 hours a clean video is approved or the decision escalates to Ops, and the brand's reliability score takes a hit either way.",
  },
  {
    question: "How are installs and trials counted?",
    answer: "Through a tracking link and a promo-code pool tied to each video, plus a RevenueCat webhook. Every conversion is labelled Tracked (link or code) or Estimated (an attribution partner, a survey or a model). Only tracked conversions are paid. Estimated ones are shown, never paid.",
  },
  {
    question: "Is the Hook Score a prediction?",
    answer: "No. Today it is a checklist score: it checks the first three seconds for a face, on-screen hook text, motion and the app being visible, and explains each point with a fix. It says so wherever it appears, and it will earn a learned score only as bounties settle.",
  },
  {
    question: "Are the numbers on this site real?",
    answer: "They come from a fictional demo world and are tagged \"Demo data\" where they appear. The rules behind them are the real ones: fees, the 72-hour window, the cap, tiers and the Money Clock are computed by the same engine the product uses.",
  },
  {
    question: "Which platforms and countries are supported?",
    answer: "Creators post to their own TikTok, Instagram and YouTube accounts. The iOS app needs iOS 17 or later, and there is a creator web portal. Android is next. Currency is US dollars for now.",
  },
];
