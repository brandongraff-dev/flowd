"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { SegmentedControl } from "@/components/ui/segmented-control";

export type Audience = "creators" | "brands";

interface AudienceContextValue {
  audience: Audience;
  setAudience: (audience: Audience) => void;
}

const AudienceContext = createContext<AudienceContextValue | null>(null);

/**
 * The landing page's audience switch lives in one place so the hero copy, the phone mock-up and the how-it-works steps all follow it.
 * It is a view preference, not saved anywhere: a visitor who lands on `/` sees creators first because that is who the headline
 * "Get paid" speaks to, and brands one tap away.
 */
export function AudienceProvider({ children, initial = "creators" }: { children: ReactNode; initial?: Audience }) {
  const [audience, setAudience] = useState<Audience>(initial);
  const value = useMemo(() => ({ audience, setAudience }), [audience]);
  return <AudienceContext value={value}>{children}</AudienceContext>;
}

export function useAudience(): AudienceContextValue {
  const context = useContext(AudienceContext);
  if (!context) throw new Error("useAudience must be used inside <AudienceProvider>.");
  return context;
}

/** "I'm a creator / I'm an app team": the audience switch. */
export function AudienceToggle({ className }: { className?: string }) {
  const { audience, setAudience } = useAudience();
  return (
    <SegmentedControl<Audience>
      aria-label="Show flowd for"
      size="lg"
      value={audience}
      onValueChange={setAudience}
      className={className}
      options={[
        { value: "creators", label: "I make videos" },
        { value: "brands", label: "I run an app" },
      ]}
    />
  );
}

/** Renders one child per audience: only the active one is in the tree, so assistive tech reads a single version. */
export function ByAudience({ creators, brands }: { creators: ReactNode; brands: ReactNode }) {
  const { audience } = useAudience();
  return <>{audience === "creators" ? creators : brands}</>;
}
