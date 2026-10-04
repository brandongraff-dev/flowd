/**
 * flowd charts. Import from "@/components/charts". Custom SVG on d3-scale / d3-shape, built to the dataviz skill.
 *
 *   TIME      <AreaChart/>  <LineChart/>  <RangeBand/>  <RetentionCurve/>     (one engine: CartesianChart)
 *   COMPARE   <BarChart/>  (grouped | stacked | horizontal)   <FunnelChart/>   <Heatmap/>   <Scatter/>
 *   FIGURES   <Sparkline/>  <Donut/>  <ScoreRing/>  <Gauge/>  <RangeBar/>
 *   PIECES    <ChartFrame/>  <ChartLegend/>  <ScaleLegend/>  <ChartTooltip/>  <TooltipBody/>  <ChartTable/>
 *
 * Rules every chart follows (so features never re-decide them):
 *  - Colours come from palette.ts (`--fd-chart-*` tokens): categorical hues in FIXED order by entity (never by rank, never
 *    cycled; the 9th folds into grey), one-hue sequential for magnitude, an ordinal ramp for ordered stages, status colours
 *    only for state (with an icon and a label). Text never wears a series colour.
 *  - Marks: 2px lines, 4px rounded data ends on bars (square at the baseline), at most 24px thick, 2px surface gaps and
 *    rings, hairline recessive grids, labels only where they fit.
 *  - Every chart has a legend for 2+ series, a hover tooltip that lists every series, the same details on keyboard focus
 *    (arrow keys), a text summary (`summary` is required), and a Chart / Table switch.
 *  - Draw-in plays once when the chart scrolls into view and never under reduced motion.
 *  - Money is integer cents formatted with `formatCents` (axis: compact, tooltip: full precision).
 */

export { AreaChart, type AreaChartProps } from "./area-chart";
export { LineChart, type LineChartProps } from "./line-chart";
export { BarChart, type BarChartProps, type BarDatum, type BarSeries } from "./bar-chart";
export { FunnelChart, type FunnelChartProps, type FunnelStage, type FunnelKind } from "./funnel-chart";
export { Sparkline, type SparklineProps, type SparklineTone } from "./sparkline";
export { Donut, type DonutProps, type DonutSegment } from "./donut";
export { ScoreRing, Gauge, type ScoreRingProps, type GaugeProps, type GaugeZone } from "./score-ring";
export { scoreBand, type BandSpec, type ScoreBandLetter } from "./score-band";
export { Heatmap, type HeatmapProps } from "./heatmap";
export { Scatter, type ScatterProps, type ScatterPoint, type ScatterGroup } from "./scatter";
export { RangeBand, RangeBar, type RangeBandProps, type RangeBarProps, type RangePoint } from "./range-band";
export { RetentionCurve, type RetentionCurveProps, type Cohort } from "./retention-curve";
export { paybackDay, type CohortPoint } from "./retention-math";
export {
  CartesianChart,
  type CartesianChartProps,
  type ChartShellProps,
  type CurveName,
  type XYBand,
  type XYMarker,
  type XYPoint,
  type XYReference,
  type XYSeries,
} from "./cartesian";
export { ChartFrame, ChartTable, type ChartFrameProps, type ChartTableData, type ChartTableColumn } from "./chart-frame";
export { ChartLegend, ScaleLegend, type ChartLegendProps, type LegendItem, type ScaleLegendProps } from "./chart-legend";
export { ChartTooltip, TooltipBody, type ChartTooltipProps, type TooltipBodyProps, type TooltipRow } from "./chart-tooltip";
export { ChartKey, markerPath, type ChartKeyProps, type ChartKeyShape } from "./chart-key";
export { useChartCursor, useMeasure, useReveal, useSeriesVisibility, type ChartCursor, type CursorState } from "./hooks";
export {
  ALL_PAIRS_SERIES,
  DIVERGING_COLORS,
  FURNITURE,
  MARKER_SHAPES,
  MAX_SERIES,
  ORDINAL_COLORS,
  OTHER_COLOR,
  SEQUENTIAL_COLORS,
  SERIES_COLORS,
  STATUS_COLORS,
  markerShape,
  sequentialBin,
  sequentialColor,
  sequentialLabelClass,
  sequentialStep,
  seriesColor,
  type MarkerShape,
} from "./palette";
export {
  formatCents,
  formatCompact,
  formatCpm,
  formatDecimal,
  formatLongDate,
  formatMonth,
  formatRatio,
  formatShortDate,
  formatWhole,
  formatX,
  formatXLong,
  quantile,
  type XValue,
} from "./format";
