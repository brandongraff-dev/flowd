import type { ReactNode } from "react";
import { Container } from "@/components/shell/container";
import { GlassCard } from "@/components/glass/glass";

/**
 * The closing call to action for the audience pages: one heading, one sentence and one or two actions on a quiet L1 card (no lens: the landing page
 * spends the page's refraction budget, and a content page should stay calm at the bottom).
 */
export function PageCta({ title, body, children, note }: { title: ReactNode; body: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="py-16 md:py-24">
      <Container size="wide">
        <GlassCard padding="none" className="grid gap-8 rounded-[36px] p-8 sm:p-12 lg:grid-cols-[minmax(0,1.3fr)_auto] lg:items-center lg:gap-14">
          <div className="grid gap-3">
            <h2 className="text-display-sm text-fg">{title}</h2>
            <p className="text-body-lg max-w-[54ch] text-pretty text-fg-muted">{body}</p>
            {note ? <p className="text-caption max-w-[62ch] text-fg-subtle">{note}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">{children}</div>
        </GlassCard>
      </Container>
    </section>
  );
}
