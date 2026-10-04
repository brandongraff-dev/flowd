import { FURNITURE } from "./palette";

export interface AxisTick {
  /** Position along the axis in px (already scaled). */
  pos: number;
  label: string;
}

const TICK_TEXT = "fill-fg-subtle text-micro tabular-nums";

export interface GridProps {
  ticks: readonly AxisTick[];
  /** `horizontal` lines run along x at each tick's y; `vertical` lines run along y at each tick's x. */
  orientation: "horizontal" | "vertical";
  /** Line length (the plot width for horizontal, the plot height for vertical). */
  length: number;
}

/** Recessive hairline grid: one step off the surface, solid (never dashed), 1px. */
export function Grid({ ticks, orientation, length }: GridProps) {
  return (
    <g aria-hidden="true" stroke={FURNITURE.grid} strokeWidth={1} shapeRendering="crispEdges">
      {ticks.map((tick) =>
        orientation === "horizontal" ? (
          <line key={tick.pos} x1={0} x2={length} y1={tick.pos} y2={tick.pos} />
        ) : (
          <line key={tick.pos} y1={0} y2={length} x1={tick.pos} x2={tick.pos} />
        ),
      )}
    </g>
  );
}

export interface AxisXProps {
  ticks: readonly AxisTick[];
  /** y of the baseline (the plot height). */
  y: number;
  /** Plot width, used to keep the first and last labels inside the chart. */
  width: number;
  /** Draw the baseline rule. */
  rule?: boolean;
  /** Short ticks under the baseline. */
  tickMarks?: boolean;
}

/** Bottom axis: baseline rule plus labels. The outermost labels hug the plot edge instead of clipping. */
export function AxisX({ ticks, y, width, rule = true, tickMarks = false }: AxisXProps) {
  return (
    <g aria-hidden="true">
      {rule ? <line x1={0} x2={width} y1={y} y2={y} stroke={FURNITURE.axis} strokeWidth={1} shapeRendering="crispEdges" /> : null}
      {ticks.map((tick, index) => {
        const approxHalf = (tick.label.length * 7.2) / 2;
        const anchor = tick.pos - approxHalf < 0 ? "start" : tick.pos + approxHalf > width ? "end" : "middle";
        return (
          <g key={`${tick.pos}-${index}`}>
            {tickMarks ? <line x1={tick.pos} x2={tick.pos} y1={y} y2={y + 4} stroke={FURNITURE.axis} shapeRendering="crispEdges" /> : null}
            <text x={tick.pos} y={y + 20} textAnchor={anchor} className={TICK_TEXT}>
              {tick.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export interface AxisYProps {
  ticks: readonly AxisTick[];
  /** x of the axis (0 = the plot's left edge); labels sit to its left. */
  x?: number;
  /** Put labels inside the plot, above their grid line, instead of in a left gutter (sparse mobile layouts). */
  inside?: boolean;
}

/** Left axis labels, right-aligned in the gutter, vertically centred on their grid line. */
export function AxisY({ ticks, x = 0, inside = false }: AxisYProps) {
  return (
    <g aria-hidden="true">
      {ticks.map((tick) => (
        <text
          key={tick.pos}
          x={inside ? x + 4 : x - 10}
          y={inside ? tick.pos - 6 : tick.pos}
          dy={inside ? 0 : "0.35em"}
          textAnchor={inside ? "start" : "end"}
          className={TICK_TEXT}
        >
          {tick.label}
        </text>
      ))}
    </g>
  );
}

export interface AxisTitleProps {
  children: string;
  x: number;
  y: number;
  /** `-90` for a vertical y-axis title. */
  rotate?: number;
  anchor?: "start" | "middle" | "end";
}

/** Axis title. Labelled axes are a CONVENTIONS requirement ("labelled axes; tooltips"); keep it to two or three words. */
export function AxisTitle({ children, x, y, rotate = 0, anchor = "middle" }: AxisTitleProps) {
  return (
    <text x={x} y={y} textAnchor={anchor} transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined} aria-hidden="true" className="fill-fg-muted text-micro font-medium">
      {children}
    </text>
  );
}
