import type { ComponentPropsWithRef, ElementType } from "react";
import { cn } from "@/lib/utils";

const WIDTH = {
  /** 1200px: dashboards and most pages. */
  content: "max-w-(--fd-content-max)",
  /** 1360px: wide tables, the market view, marketing hero art. */
  wide: "max-w-(--fd-wide-max)",
  /** 680px: reading text. */
  prose: "max-w-(--fd-prose-max,680px)",
  full: "max-w-none",
} as const;

export interface ContainerProps extends ComponentPropsWithRef<"div"> {
  /** Max width: `content` (1200, default), `wide` (1360), `prose` (680) or `full`. */
  size?: keyof typeof WIDTH;
  /** Side gutters: 16px to 640, 24px to 1024, 32px above (BRAND.md 8). Turn off when the parent already pads. */
  gutter?: boolean;
  /** Element to render. */
  as?: ElementType;
}

/** The page width box: centred, capped at the brand content widths, with the responsive gutters. */
export function Container({ size = "content", gutter = true, as: Tag = "div", className, ...props }: ContainerProps) {
  return <Tag className={cn("mx-auto w-full", WIDTH[size], gutter && "px-4 sm:px-6 lg:px-8", className)} {...props} />;
}
