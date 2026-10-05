"use client";

import { useRef, type ReactNode, type Ref } from "react";
import { Lock, RotateCcw, ShieldCheck, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/glass/glass";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/money";
import { AnimatedBeam } from "@/components/shell/animated-beam";

function Node({ ref, icon, title, children, className }: { ref?: Ref<HTMLDivElement>; icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <div ref={ref} className={cn("relative z-[1] grid w-full max-w-[16rem] justify-items-center gap-3 rounded-[24px] bg-surface p-5 text-center shadow-rest ring-1 ring-rim", className)}>
      <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-surface-active text-fg [&_svg]:size-5 [&_svg]:stroke-[1.75]">
        {icon}
      </span>
      <p className="text-body-sm font-semibold text-fg">{title}</p>
      {children}
    </div>
  );
}

const POINTS = [
  {
    icon: <ShieldCheck />,
    title: "Funded or not live",
    body: "The Funded badge appears only when escrow covers the pool plus the fee reserve. Until then Go live stays off and says exactly how much is missing: \"Needs $1,860 more in escrow.\"",
  },
  {
    icon: <Lock />,
    title: "A reserved slot for every submission",
    body: "When a creator submits, up to the per-video cap is set aside for them. An approved post is paid even if later submissions would have emptied the pool.",
  },
  {
    icon: <RotateCcw />,
    title: "What is unspent comes back",
    body: "At the end, the unspent pool and the unspent fee reserve return to the brand's wallet. The fee is only ever taken on money that was actually paid out.",
  },
] as const;

/**
 * Escrow and the Funded badge, drawn: money goes from the brand's wallet into escrow and out to creators only when a post clears, while results
 * flow back the other way. The three commitments under it are the product's rules, not marketing: the badge, the reserved slot and the refund.
 */
export function EscrowExplainer() {
  const stage = useRef<HTMLDivElement>(null);
  const wallet = useRef<HTMLDivElement>(null);
  const escrow = useRef<HTMLDivElement>(null);
  const creators = useRef<HTMLDivElement>(null);

  return (
    <div className="grid gap-4">
      <GlassCard padding="lg" className="rounded-[32px]">
        <div ref={stage} className="relative grid items-center justify-items-center gap-10 py-2 md:grid-cols-3 md:gap-6">
          <Node ref={wallet} icon={<Wallet />} title="Brand wallet">
            <Money cents={560000} state="neutral" size="md" icon={false} />
            <p className="text-caption text-fg-subtle">Top up by card or bank</p>
          </Node>
          <Node ref={escrow} icon={<Lock />} title="Escrow" className="md:scale-105">
            <Badge tone="mint" icon={<ShieldCheck />}>
              Funded
            </Badge>
            <p className="text-caption text-fg-subtle tabular-nums">$5,000 pool + $600 fee reserve</p>
          </Node>
          <Node ref={creators} icon={<Users />} title="Creators">
            <p className="text-body-sm font-semibold text-mint tabular-nums">Paid as each post clears</p>
            <p className="text-caption text-fg-subtle">Never charged a fee</p>
          </Node>

          <AnimatedBeam containerRef={stage} fromRef={wallet} toRef={escrow} tone="mint" duration={3.4} curvature={36} />
          <AnimatedBeam containerRef={stage} fromRef={escrow} toRef={creators} tone="mint" duration={3.4} delay={1.1} curvature={36} />
          <AnimatedBeam containerRef={stage} fromRef={creators} toRef={escrow} tone="flow" duration={3.8} delay={0.5} curvature={-36} reverse />
        </div>
        <p className="mt-8 text-center text-caption text-fg-subtle">
          Money flows right as posts clear. Views, installs and trials flow back as the evidence it was earned. Example amounts on the Free plan.
        </p>
      </GlassCard>

      <ul className="grid gap-4 md:grid-cols-3">
        {POINTS.map((point) => (
          <li key={point.title}>
            <GlassCard padding="lg" className="grid h-full content-start gap-3 rounded-[28px]">
              <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent [&_svg]:size-5 [&_svg]:stroke-[1.75]">
                {point.icon}
              </span>
              <h3 className="text-title-sm text-fg">{point.title}</h3>
              <p className="text-body-sm text-pretty text-fg-muted">{point.body}</p>
            </GlassCard>
          </li>
        ))}
      </ul>

      <p className="mx-auto max-w-[70ch] text-center font-mono text-code text-fg-subtle">
        funded = reserved + spent + remaining + refunded <span className="text-fg-muted">&middot; checked on every bounty</span>
      </p>
    </div>
  );
}
