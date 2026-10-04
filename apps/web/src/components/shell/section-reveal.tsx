"use client";

import { createContext, useContext, type ComponentPropsWithRef, type ElementType, type ReactNode } from "react";
import { motion, type HTMLMotionProps, type Variants } from "motion/react";
import { spring, stagger } from "@/lib/motion";

const RevealContext = createContext<{ distance: number } | null>(null);

const GROUP: Variants = { hidden: {}, show: {} };

export interface SectionRevealProps extends Omit<HTMLMotionProps<"div">, "variants" | "initial" | "whileInView" | "viewport"> {
  /** Element to render. */
  as?: "div" | "section" | "ul" | "ol" | "article" | "header";
  /** How far items rise in px (default 14: small enough to read as arrival, never as travel). */
  distance?: number;
  /** Fraction of the group that must be visible before it plays (default 0.15). */
  amount?: number;
  /** Play every time it scrolls into view, not just the first (default false: once). */
  repeat?: boolean;
  children: ReactNode;
}

/**
 * Scroll-in reveal for a section: its `RevealItem` children rise 14px and fade in, staggered 40 ms apiece and capped at eight, on
 * the `smooth` spring, the first time the group scrolls into view. Meant for infrequent, rare moments (marketing sections),
 * never for dashboards: a screen people use hundreds of times a day gets no entrance. Under reduced motion `MotionConfig`
 * drops the movement and keeps a short fade. Server components can be children.
 *
 * ```tsx
 * <SectionReveal as="section"><RevealItem index={0}><h2/></RevealItem><RevealItem index={1}><p/></RevealItem></SectionReveal>
 * ```
 */
export function SectionReveal({ as = "div", distance = 14, amount = 0.15, repeat = false, children, ...props }: SectionRevealProps) {
  const Tag = motion[as] as ElementType;
  return (
    <RevealContext value={{ distance }}>
      <Tag variants={GROUP} initial="hidden" whileInView="show" viewport={{ once: !repeat, amount }} {...props}>
        {children}
      </Tag>
    </RevealContext>
  );
}

export interface RevealItemProps extends Omit<HTMLMotionProps<"div">, "variants" | "custom"> {
  /** Position in the group: sets the stagger (40 ms each, capped at 8 items). */
  index?: number;
  as?: "div" | "li" | "p" | "h2" | "h3" | "article" | "figure";
}

/** One staggered child of a `SectionReveal`. Without a `SectionReveal` ancestor it is a plain element. */
export function RevealItem({ index = 0, as = "div", children, ...props }: RevealItemProps) {
  const context = useContext(RevealContext);
  const Tag = motion[as] as ElementType;
  if (!context) return <Tag {...(props as ComponentPropsWithRef<"div">)}>{children}</Tag>;
  const variants: Variants = {
    hidden: { opacity: 0, y: context.distance },
    show: (position: number) => ({ opacity: 1, y: 0, transition: { ...spring.smooth, delay: stagger(position) } }),
  };
  return (
    <Tag variants={variants} custom={index} {...props}>
      {children}
    </Tag>
  );
}
