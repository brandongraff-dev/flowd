"use client";

import { useMemo } from "react";
import { CartesianChart, type ChartShellProps, type XYMarker, type XYReference, type XYSeries } from "./cartesian";
import { formatRatio } from "./format";
import { seriesColor } from "./palette";
import { paybackDay, type CohortPoint } from "./retention-math";


export interface Cohort {
  id: string;
  /** "Sep 8 installs", "Hook A creators". */
  label: string;
  points: readonly CohortPoint[];
}

export interface RetentionCurveProps extends ChartShellProps {
  cohorts: readonly Cohort[];
  /** `retention`: share still active by day. `payback`: ROAS by day against a break-even rule, with the payback day marked. */
  mode?: "retention" | "payback";
  /** Day ticks. Default D0, D7, D14, D30, D60, D90. */
  days?: readonly number[];
  height?: number;
}

const DEFAULT_DAYS = [0, 7, 14, 30, 60, 90] as const;
const formatDay = (value: number | Date | string): string => `D${value}`;

/**
 * Retention and payback curves by cohort. `retention` plots the share of installs still active by day; `payback` plots
 * cumulative ROAS (D7 to D90) against a break-even rule and marks the day each cohort pays back. Observed values are solid,
 * modelled tails are dotted and labelled Estimated, so a projection is never styled as a measurement.
 */
export function RetentionCurve({ cohorts, mode = "retention", days = DEFAULT_DAYS, height = 280, ...shell }: RetentionCurveProps) {
  const series = useMemo<XYSeries[]>(
    () => cohorts.map((cohort) => ({ id: cohort.id, label: cohort.label, points: cohort.points.map((point) => ({ x: point.day, y: point.value, estimated: point.estimated })) })),
    [cohorts],
  );

  const payback = mode === "payback";
  const markers = useMemo<XYMarker[]>(() => {
    if (!payback) return [];
    return cohorts
      .map((cohort) => ({ cohort, day: paybackDay(cohort.points) }))
      .filter((entry): entry is { cohort: Cohort; day: number } => entry.day !== null)
      .slice(0, 2)
      .map(({ cohort, day }) => ({ id: `payback-${cohort.id}`, x: day, y: 1, label: `${cohort.label.replace(" installs", "")}: day ${day}`, color: seriesColor(cohorts.indexOf(cohort)) }));
  }, [cohorts, payback]);

  const references: XYReference[] = payback ? [{ id: "break-even", y: 1, label: "Break-even (1.0x)", tone: "good" }] : [];

  return (
    <CartesianChart
      {...shell}
      variant="line"
      series={series}
      markers={markers}
      references={references}
      xTicks={days}
      xScale="sqrt"
      xFormat={formatDay}
      xTooltipFormat={(value) => `Day ${value} after install`}
      xAxisTitle="Days since install"
      xLabel="Day"
      yDomain={payback ? undefined : [0, 1]}
      zero
      yFormat={payback ? (value) => `${value.toFixed(1)}x` : (value) => formatRatio(value, 0)}
      yTooltipFormat={payback ? (value) => `${value.toFixed(2)}x` : (value) => formatRatio(value, 1)}
      curve="monotone"
      height={height}
    />
  );
}
