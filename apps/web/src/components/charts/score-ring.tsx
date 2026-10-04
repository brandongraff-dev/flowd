"use client";

import { useRef, type ComponentPropsWithRef, type ReactNode } from "react";
import { arc as d3Arc } from "d3-shape";
import { cn } from "@/lib/utils";
import { useCountUp } from "@/lib/hooks/use-count-up";
import { useReveal } from "./hooks";
import { scoreBand } from "./score-band";

export { scoreBand, type BandSpec, type ScoreBandLetter } from "./score-band";

const DETENTS = [40, 55, 70, 85] as const;

export interface ScoreRingProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  /** 0-100. */
  score: number;
  /** "Hook Score", "Flow Score". Read aloud with the value. */
  name: string;
  /** Diameter in px (default 148). */
  size?: number;
  /** Show "Checklist score" under the ring. The day-one scores are checklist scores and say so; turn it off only once the learned scorer has earned the name. */
  checklist?: boolean;
  /** Replace the default caption (for example "Strong open. Move the app reveal to 0:03."). */
  caption?: ReactNode;
}

/**
 * Hook Score / Flow Score ring: one arc that sweeps to the score once (a spring-feel ease; instant under reduced motion),
 * detent ticks at the band edges, and the band as a LETTER and a WORD in the middle, so the band is never carried by colour
 * alone. Day-one scores are checklist scores and the component says so by default.
 *
 * ```tsx
 * <ScoreRing name="Hook Score" score={78} />   // B, Good
 * ```
 */
export function ScoreRing({ score, name, size = 148, checklist = true, caption, className, ...props }: ScoreRingProps) {
  const { ref, revealed, animated } = useReveal<HTMLDivElement>();
  const numberRef = useRef<HTMLSpanElement>(null);
  const clamped = Math.min(Math.max(Math.round(score), 0), 100);
  const band = scoreBand(clamped);
  const shown = useCountUp(numberRef, clamped, { animateOnMount: true, restDelta: 0.5 });
  const thickness = Math.max(8, Math.round(size * 0.075));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = revealed ? clamped / 100 : 0;
  const center = size / 2;

  return (
    <div
      ref={ref}
      role="meter"
      aria-label={name}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={`${band.letter}, ${band.word}, ${clamped} out of 100${checklist ? ". Checklist score" : ""}`}
      className={cn("inline-grid justify-items-center gap-2", className)}
      {...props}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="block -rotate-90 overflow-visible">
          <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--fd-surface-active)" strokeWidth={thickness} />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={band.color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            style={{ transition: animated ? "stroke-dashoffset 900ms var(--fd-ease-emphasized), stroke 240ms var(--fd-ease-standard)" : "stroke 240ms var(--fd-ease-standard)" }}
          />
          {/* detents at the band edges: a short radial tick outside the track, so the bands are legible without colour */}
          {DETENTS.map((detent) => {
            const angle = (detent / 100) * Math.PI * 2;
            const outer = radius + thickness / 2 + 5;
            const innerR = radius + thickness / 2 + 1;
            return (
              <line
                key={detent}
                x1={center + Math.cos(angle) * innerR}
                y1={center + Math.sin(angle) * innerR}
                x2={center + Math.cos(angle) * outer}
                y2={center + Math.sin(angle) * outer}
                stroke="var(--fd-chart-axis)"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <p className="font-display leading-none font-extrabold text-fg" style={{ fontSize: Math.round(size * 0.36), letterSpacing: "-0.04em" }}>
            {band.letter}
          </p>
          <p className="mt-1 text-caption font-semibold text-fg-muted tabular-nums">
            <span ref={numberRef}>{Math.round(shown)}</span>
            <span className="text-fg-subtle"> / 100</span>
          </p>
        </div>
      </div>
      <div className="grid justify-items-center gap-0.5 text-center">
        <p className="text-body-sm font-semibold text-fg">{band.word}</p>
        {caption ? <p className="max-w-[24ch] text-caption text-fg-subtle">{caption}</p> : null}
        {checklist ? <p className="text-micro text-fg-subtle">Checklist score. Gets smarter as bounties settle.</p> : null}
      </div>
    </div>
  );
}

export interface GaugeZone {
  /** Upper bound of the zone (value units). Zones are listed low to high. */
  to: number;
  /** CSS colour (a status token) and the word that accompanies it. */
  color: string;
  label: string;
}

export interface GaugeProps extends Omit<ComponentPropsWithRef<"div">, "children"> {
  value: number;
  min?: number;
  max?: number;
  /** A target tick on the arc ("Target 80%"). */
  target?: number;
  targetLabel?: string;
  format?: (value: number) => string;
  /** "Approval rate". Read aloud with the value. */
  name: string;
  /** Zones for status gauges (reliability: weak, fair, strong). The active zone's label prints under the value, so colour is never the only cue. */
  zones?: readonly GaugeZone[];
  /** Width in px (default 220); the height is half of it plus the label. */
  width?: number;
  caption?: ReactNode;
}

/**
 * Half-circle gauge for one ratio against a range (approval rate, brand reliability, fill probability). A quiet track, one
 * arc in the Flow azure (or the active status zone), an optional target tick, and the value in Bricolage tabular figures.
 */
export function Gauge({ value, min = 0, max = 100, target, targetLabel, format = (v) => `${Math.round(v)}`, name, zones, width = 220, caption, className, ...props }: GaugeProps) {
  const { ref, revealed, animated } = useReveal<HTMLDivElement>();
  const thickness = Math.max(10, Math.round(width * 0.075));
  const radius = width / 2 - thickness / 2 - 2;
  const span = max - min || 1;
  const ratio = Math.min(Math.max((value - min) / span, 0), 1);
  const zone = zones?.find((entry) => value <= entry.to) ?? zones?.[zones.length - 1];
  const color = zone?.color ?? "var(--fd-accent-bright)";
  const angleFor = (fraction: number): number => -Math.PI / 2 + fraction * Math.PI;
  const arcGen = d3Arc().cornerRadius(thickness / 2);
  const track = arcGen({ innerRadius: radius - thickness / 2, outerRadius: radius + thickness / 2, startAngle: -Math.PI / 2, endAngle: Math.PI / 2 }) ?? "";
  const fill = arcGen({ innerRadius: radius - thickness / 2, outerRadius: radius + thickness / 2, startAngle: -Math.PI / 2, endAngle: angleFor(ratio) }) ?? "";
  const targetFraction = target === undefined ? null : Math.min(Math.max((target - min) / span, 0), 1);
  const height = width / 2 + thickness / 2 + 4;

  return (
    <div
      ref={ref}
      role="meter"
      aria-label={name}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${format(value)}${zone ? `, ${zone.label}` : ""}${target !== undefined ? `. Target ${format(target)}` : ""}`}
      className={cn("inline-grid justify-items-center gap-1", className)}
      {...props}
    >
      <div className="relative" style={{ width, height }}>
        <svg width={width} height={height} viewBox={`${-width / 2} ${-width / 2 - 2} ${width} ${height}`} aria-hidden="true" className="block overflow-visible">
          <path d={track} fill="var(--fd-surface-active)" />
          <g style={{ opacity: revealed ? 1 : 0, transformOrigin: "0px 0px", transform: revealed ? "none" : "rotate(-18deg)", transition: animated ? "opacity 320ms var(--fd-ease-standard), transform 700ms var(--fd-ease-emphasized)" : "none" }}>
            <path d={fill} fill={color} />
          </g>
          {targetFraction !== null ? (
            <line
              x1={Math.sin(angleFor(targetFraction)) * (radius - thickness / 2 - 5)}
              y1={-Math.cos(angleFor(targetFraction)) * (radius - thickness / 2 - 5)}
              x2={Math.sin(angleFor(targetFraction)) * (radius + thickness / 2 + 5)}
              y2={-Math.cos(angleFor(targetFraction)) * (radius + thickness / 2 + 5)}
              stroke="var(--fd-fg)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ) : null}
        </svg>
        <div className="absolute inset-x-0 bottom-0 grid justify-items-center">
          <p className="font-display text-figure-lg text-fg tabular-nums">{format(value)}</p>
        </div>
      </div>
      <div className="grid justify-items-center gap-0.5 text-center">
        {zone ? <p className="text-body-sm font-semibold text-fg">{zone.label}</p> : null}
        {targetFraction !== null && target !== undefined ? <p className="text-caption text-fg-subtle">{targetLabel ?? `Target ${format(target)}`}</p> : null}
        {caption ? <p className="text-caption text-fg-subtle">{caption}</p> : null}
      </div>
    </div>
  );
}
