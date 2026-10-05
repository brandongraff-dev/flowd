"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { BookOpenCheck, Calculator, FileSignature, Link2, Mail, ShieldAlert, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Badge, Button, CopyButton, EmptyState, Field, SearchInput, Select, Textarea, buttonVariants, notify } from "@/components/ui";
import { useZodForm } from "@/components/features/auth/use-zod-form";
import { PageHero, HeroAccent, PageSection } from "../kit";
import { HELP_ARTICLES, HELP_CATEGORIES, matchesArticle, topArticles, type HelpArticle, type HelpBlock, type HelpCategory } from "./help-articles";

const ICON: Record<HelpCategory, typeof Wallet> = { money: Wallet, reviews: BookOpenCheck, rights: FileSignature, taxes: Calculator, safety: ShieldAlert, attribution: Link2 };

type View = "top" | HelpCategory;

const AUDIENCE_LABEL: Record<HelpArticle["audience"], string> = { creators: "For creators", brands: "For brands", everyone: "For everyone" };

function Block({ block }: { block: HelpBlock }) {
  if ("p" in block) return <p>{block.p}</p>;
  if ("ul" in block) {
    return (
      <ul className="grid gap-2">
        {block.ul.map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-[9px] size-1 shrink-0 rounded-full bg-fg-subtle" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Link href={block.link.href} className="w-fit font-semibold text-accent underline underline-offset-4">
      {block.link.label}
    </Link>
  );
}

function ArticleItem({ article }: { article: HelpArticle }) {
  const category = HELP_CATEGORIES.find((item) => item.id === article.category);
  return (
    <AccordionItem value={article.id} id={article.id} className="scroll-mt-28">
      <AccordionTrigger description={`${category?.label ?? ""} · ${AUDIENCE_LABEL[article.audience]}`}>{article.title}</AccordionTrigger>
      <AccordionContent className="grid max-w-[68ch] gap-3">
        {article.blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </AccordionContent>
    </AccordionItem>
  );
}

const TOPICS = [...HELP_CATEGORIES.map((item) => ({ value: item.label, label: item.label })), { value: "Something else", label: "Something else" }];
const contactSchema = z.object({
  topic: z.string().min(1, "Pick the closest topic."),
  message: z.string().trim().min(10, "Tell us a little more, at least a sentence.").max(1500, "Keep it under 1,500 characters."),
});

function ContactCard() {
  const [busy, setBusy] = useState(false);
  const form = useZodForm(contactSchema, { topic: "", message: "" }, { idPrefix: "support", order: ["topic", "message"], labels: { topic: "Topic", message: "Message" } });
  const submit = form.handleSubmit((values) => {
    setBusy(true);
    const subject = encodeURIComponent(`[Help] ${values.topic}`);
    const body = encodeURIComponent(`${values.message.trim()}\n\n(Sent from the flowd help centre)`);
    window.location.href = `mailto:hello@joinflowd.io?subject=${subject}&body=${body}`;
    notify.info("Opening your email app", { description: "If nothing opens, copy hello@joinflowd.io and write to us there." });
    window.setTimeout(() => setBusy(false), 900);
  });
  return (
    <GlassCard padding="lg" className="grid content-start gap-5">
      <div className="grid gap-1">
        <h3 className="font-display text-title-md text-fg">Write to a person</h3>
        <p className="text-body-sm text-fg-muted">Pick a topic and say what is wrong. This opens your email app with the message ready to send.</p>
      </div>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Field id={form.fieldId("topic")} label="Topic" error={form.errors.topic}>
          <Select options={TOPICS} placeholder="Pick one" value={form.values.topic} onValueChange={(value) => form.set("topic", value)} />
        </Field>
        <Field id={form.fieldId("message")} label="What is going on?" error={form.errors.message}>
          <Textarea rows={4} maxLength={1500} showCount value={form.values.message} onChange={(event) => form.set("message", event.target.value)} onBlur={() => form.blur("message")} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="lg" loading={busy} leadingIcon={<Mail />}>
            Email support
          </Button>
          <CopyButton value="hello@joinflowd.io" label="Copy hello@joinflowd.io" size="md" variant="ghost" />
        </div>
      </form>
    </GlassCard>
  );
}

const SLA = [
  { who: "Scam and abuse reports", what: "Triaged within 24 hours" },
  { who: "Disputes about views or pay", what: "A human reply within 48 hours (a proposed target)" },
  { who: "Identity checks that need a person", what: "Decided within 24 hours" },
  { who: "Everything else", what: "A reply within one business day" },
] as const;

/**
 * The help centre: search across every article, six categories, the top questions by default, and each answer rendered inline in an accordion
 * (no click-through to a separate page). Deep links work: `/help#safety` opens the Safety category and `/help#money-pending` opens that answer.
 * Underneath, a way to reach a person with the named deadlines.
 */
export function HelpCenter() {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("top");
  const [open, setOpen] = useState<string>("");

  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!hash) return;
    const category = HELP_CATEGORIES.find((item) => item.id === hash);
    if (category) {
      setView(category.id);
      window.requestAnimationFrame(() => document.getElementById("browse")?.scrollIntoView({ behavior: "auto", block: "start" }));
      return;
    }
    const article = HELP_ARTICLES.find((item) => item.id === hash);
    if (article) {
      setView(article.category);
      setOpen(article.id);
      window.requestAnimationFrame(() => document.getElementById(article.id)?.scrollIntoView({ behavior: "auto", block: "center" }));
    }
  }, []);

  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    if (searching) return HELP_ARTICLES.filter((article) => matchesArticle(article, query));
    if (view === "top") return topArticles;
    return HELP_ARTICLES.filter((article) => article.category === view);
  }, [query, searching, view]);

  const counts = useMemo(() => Object.fromEntries(HELP_CATEGORIES.map((category) => [category.id, HELP_ARTICLES.filter((article) => article.category === category.id).length])), []);
  const heading = searching ? `${results.length} ${results.length === 1 ? "answer" : "answers"} for “${query.trim()}”` : view === "top" ? "Top questions" : (HELP_CATEGORIES.find((item) => item.id === view)?.label ?? "");

  return (
    <>
      <PageHero
        eyebrow="Help centre"
        title={
          <>
            How can we <HeroAccent>help?</HeroAccent>
          </>
        }
        lede="Answers to the questions people ask most about money, reviews, rights, taxes, safety and attribution, written in plain words with the real numbers. Still stuck? A person answers."
        actions={
          <div className="w-full max-w-xl">
            <SearchInput
              size="lg"
              aria-label="Search the help centre"
              placeholder="Search: payout, fees, rights card, 1099…"
              value={query}
              onValueChange={setQuery}
              onClear={() => setQuery("")}
            />
          </div>
        }
        meta={
          <p className="text-caption text-fg-subtle">
            Popular:{" "}
            {["payout", "fees", "rights card", "scam"].map((term, index) => (
              <span key={term}>
                {index > 0 ? ", " : ""}
                <button type="button" onClick={() => setQuery(term)} className="rounded-sm font-semibold text-accent underline underline-offset-4">
                  {term}
                </button>
              </span>
            ))}
          </p>
        }
        art={
          <GlassCard padding="lg" className="mx-auto grid w-full max-w-[34rem] gap-3 lg:ml-auto">
            <p className="fd-eyebrow text-fg-subtle">Fast lanes</p>
            {[
              { href: "/trust/report", label: "Report a scam or abuse", note: "No account needed", icon: <ShieldAlert /> },
              { href: "/status", label: "Check system status", note: "Is it us or you?", icon: <BookOpenCheck /> },
              { href: "#contact", label: "Talk to a person", note: "Named deadlines, below", icon: <Mail /> },
            ].map((item) => (
              <Link key={item.href} href={item.href} className="flex items-center gap-4 rounded-2xl bg-surface-field p-4 shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
                  {item.icon}
                </span>
                <span className="grid gap-0.5">
                  <span className="text-body font-semibold text-fg">{item.label}</span>
                  <span className="text-caption text-fg-subtle">{item.note}</span>
                </span>
              </Link>
            ))}
          </GlassCard>
        }
      />

      <PageSection id="browse" eyebrow="Browse" title="Pick a topic, or just read the top questions" description="Every answer opens right here. Nothing sends you to a page you then have to leave.">
        <div className="grid gap-8">
          <ul aria-label="Topics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {HELP_CATEGORIES.map((category) => {
              const Icon = ICON[category.id];
              const active = !searching && view === category.id;
              return (
                <li key={category.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setQuery("");
                      setView(active ? "top" : category.id);
                      setOpen("");
                    }}
                    className={cn(
                      "grid h-full w-full content-start gap-2 rounded-3xl p-4 text-left shadow-[inset_0_0_0_1px_var(--fd-rim)] transition-[background-color,box-shadow,transform] duration-(--fd-dur-fast) ease-standard active:scale-[0.97]",
                      active ? "bg-accent-soft shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--fd-accent-bright)_60%,transparent)]" : "bg-surface-glass-1 [@media(hover:hover)]:hover:bg-surface-hover",
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <Icon aria-hidden="true" className={cn("size-5", active ? "text-accent" : "text-fg-muted")} strokeWidth={1.75} />
                      <Badge size="sm">{counts[category.id]}</Badge>
                    </span>
                    <span className="text-body font-semibold text-fg">{category.label}</span>
                    <span className="text-caption text-fg-subtle">{category.blurb}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-title-md text-fg" role="status" aria-live="polite">
                {heading}
              </h3>
              {searching ? (
                <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              ) : view !== "top" ? (
                <Button variant="ghost" size="sm" onClick={() => setView("top")}>
                  Back to top questions
                </Button>
              ) : null}
            </div>
            {results.length > 0 ? (
              <GlassCard padding="md" className="px-4 sm:px-6">
                <Accordion variant="plain" type="single" collapsible value={open} onValueChange={setOpen}>
                  {results.map((article) => (
                    <ArticleItem key={article.id} article={article} />
                  ))}
                </Accordion>
              </GlassCard>
            ) : (
              <GlassCard padding="lg">
                <EmptyState
                  art="search"
                  title={`Nothing matches “${query.trim()}”`}
                  description="Try a shorter word, like payout or fees. If it is not here, a person will answer."
                  action={
                    <Button variant="primary" onClick={() => setQuery("")}>
                      Clear search
                    </Button>
                  }
                  secondaryAction={
                    <Link href="#contact" className={buttonVariants({ variant: "ghost" })}>
                      Talk to a person
                    </Link>
                  }
                />
              </GlassCard>
            )}
          </div>
        </div>
      </PageSection>

      <PageSection id="contact" eyebrow="Still stuck?" title="A person, with a named deadline" description="Support is people, not a bot. Each queue has a deadline we measure and publish on the Trust Center.">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <GlassCard padding="lg" className="grid content-start gap-5">
            <h3 className="font-display text-title-md text-fg">How fast we answer</h3>
            <ul className="grid gap-4">
              {SLA.map((row) => (
                <li key={row.who} className="grid gap-0.5 border-b border-divider pb-4 last:border-b-0 last:pb-0">
                  <p className="text-body font-semibold text-fg">{row.who}</p>
                  <p className="text-body-sm font-medium text-accent">{row.what}</p>
                </li>
              ))}
            </ul>
            <p className="text-body-sm text-fg-muted">
              Is something down?{" "}
              <Link href="/status" className="font-semibold text-accent underline underline-offset-4">
                Check system status
              </Link>
              . Someone is acting unsafe?{" "}
              <Link href="/trust/report" className="font-semibold text-accent underline underline-offset-4">
                Report it
              </Link>
              .
            </p>
          </GlassCard>
          <ContactCard />
        </div>
      </PageSection>
    </>
  );
}
