"use client";

import { cn } from "@/lib/utils";
import { useReduceGlass } from "@/lib/hooks/use-reduce-glass";
import { Switch } from "@/components/ui/switch";

export interface ReduceGlassSwitchProps {
  className?: string;
  /** Hide the helper text (compact settings rows). */
  compact?: boolean;
}

/**
 * The in-app "Reduce glass" switch (CONVENTIONS section 2 rule 4). Turning it on sets `html[data-transparency="reduce"]`:
 * every glass surface becomes a solid, opaque tinted fill with a firmer edge, blur and sheen go away, and the WebGL
 * aurora and the refraction lens stop. It is remembered on this device and applied before first paint.
 *
 * Safari and Firefox ignore `prefers-reduced-transparency`, which is why this exists. When the device itself asks for
 * reduced transparency the switch shows on and locked, and says why: an app setting never overrides the OS.
 */
export function ReduceGlassSwitch({ className, compact = false }: ReduceGlassSwitchProps) {
  const { app, system, setReduced } = useReduceGlass();
  return (
    <Switch
      label="Reduce glass"
      description={
        compact
          ? undefined
          : system
            ? "On because your device asks for reduced transparency."
            : "Solid, high-contrast surfaces instead of translucent glass. Remembered on this device."
      }
      checked={app || system}
      disabled={system}
      onCheckedChange={setReduced}
      containerClassName={cn(className)}
    />
  );
}
