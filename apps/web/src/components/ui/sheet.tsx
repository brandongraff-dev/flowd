"use client";

import {
  createContext,
  useContext,
  useRef,
  type ComponentPropsWithRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ease, project, spring } from "@/lib/motion";
import { useControllableState } from "@/lib/hooks/use-controllable-state";
import { useIsDesktop } from "@/lib/hooks/use-media-query";
import { Glass } from "@/components/glass/glass";
import { IconButton } from "./icon-button";

export type SheetSide = "right" | "left" | "bottom" | "top";

interface SheetContextValue {
  open: boolean;
  side: SheetSide;
  setOpen: (open: boolean) => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

function useSheet(): SheetContextValue {
  const context = useContext(SheetContext);
  if (!context) throw new Error("Sheet parts must be used inside <Sheet>.");
  return context;
}

export interface SheetProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Edge the sheet comes from. `auto` (default): a bottom sheet below 768px, a right-hand drawer above. The sheet
   * leaves the way it came (same path in, same path out).
   */
  side?: SheetSide | "auto";
  children: ReactNode;
}

/**
 * Sheet / drawer on L3 glass over a scrim, with drag-to-dismiss: the sheet tracks the finger 1:1, resists the wrong
 * direction, and on release projects where the flick will land (Apple's momentum projection) to decide whether to
 * dismiss; otherwise it springs back carrying the release velocity. Escape, the scrim and the close button also close it.
 *
 * ```tsx
 * <Sheet>
 *   <SheetTrigger asChild><Button>Filters</Button></SheetTrigger>
 *   <SheetContent><SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader><SheetBody>…</SheetBody></SheetContent>
 * </Sheet>
 * ```
 */
export function Sheet({ open, defaultOpen = false, onOpenChange, side = "auto", children }: SheetProps) {
  const [isOpen, setOpen] = useControllableState<boolean>({ value: open, defaultValue: defaultOpen, onChange: onOpenChange });
  const desktop = useIsDesktop(true);
  const resolved: SheetSide = side === "auto" ? (desktop ? "right" : "bottom") : side;
  return (
    <SheetContext value={{ open: isOpen, side: resolved, setOpen }}>
      <DialogPrimitive.Root open={isOpen} onOpenChange={setOpen}>
        {children}
      </DialogPrimitive.Root>
    </SheetContext>
  );
}

/** Drawer is a Sheet that defaults to the responsive edge. Same API. */
export const Drawer = Sheet;

export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const MotionGlass = motion.create(Glass);

const OFFSCREEN: Record<SheetSide, { x?: string; y?: string }> = {
  right: { x: "115%" },
  left: { x: "-115%" },
  bottom: { y: "115%" },
  top: { y: "-115%" },
};

const PLACEMENT: Record<SheetSide, string> = {
  right: "top-3 right-3 bottom-3 w-[min(calc(100%-1.5rem),30rem)] rounded-[28px]",
  left: "top-3 bottom-3 left-3 w-[min(calc(100%-1.5rem),30rem)] rounded-[28px]",
  bottom:
    "inset-x-0 bottom-0 mx-auto max-h-[92dvh] w-full rounded-t-3xl md:bottom-3 md:max-h-[85dvh] md:w-[min(calc(100%-1.5rem),36rem)] md:rounded-3xl",
  top: "inset-x-3 top-3 mx-auto max-h-[85dvh] w-[min(calc(100%-1.5rem),36rem)] rounded-3xl",
};

/** Distance along the dismiss axis (positive = toward dismissal) from a drag. */
function towardDismiss(side: SheetSide, x: number, y: number): number {
  if (side === "bottom") return y;
  if (side === "top") return -y;
  if (side === "right") return x;
  return -x;
}

export interface SheetContentProps extends Omit<ComponentPropsWithRef<typeof DialogPrimitive.Content>, "asChild"> {
  /** Show the close button (top right). */
  showClose?: boolean;
  /** Hide the drag handle on bottom sheets. */
  hideHandle?: boolean;
}

export function SheetContent({ showClose = true, hideHandle = false, className, children, ...props }: SheetContentProps) {
  const { open, side, setOpen } = useSheet();
  const reduceMotion = useReducedMotion();
  const controls = useDragControls();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const axis = side === "bottom" || side === "top" ? "y" : "x";

  // Drag starts on the handle and header always, and from the body only on bottom/top sheets whose content does not scroll.
  const startDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [role='slider'], [contenteditable='true'], [data-sheet-nodrag], [data-radix-scroll-area-viewport]")) return;
    const onHandle = Boolean(target.closest("[data-sheet-handle]"));
    if (!onHandle) {
      if (axis === "x") return;
      if (target.closest("button, a")) return;
      const scroller = target.closest<HTMLElement>("[data-sheet-scroll]");
      if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) return;
    }
    controls.start(event);
  };

  const onDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo): void => {
    const size = axis === "y" ? (panelRef.current?.offsetHeight ?? 400) : (panelRef.current?.offsetWidth ?? 400);
    const offset = towardDismiss(side, info.offset.x, info.offset.y);
    const velocity = towardDismiss(side, info.velocity.x, info.velocity.y);
    // Where would this flick come to rest? Dismiss when that is past 45% of the sheet.
    const projected = offset + project(velocity);
    if (offset > 0 && projected > size * 0.45) setOpen(false);
  };

  const hidden = reduceMotion ? { opacity: 0 } : OFFSCREEN[side];
  const shown = reduceMotion ? { opacity: 1 } : { x: 0, y: 0 };

  return (
    <AnimatePresence>
      {open ? (
        <DialogPrimitive.Portal forceMount key="sheet">
          <DialogPrimitive.Overlay asChild forceMount>
            <motion.div
              className="fixed inset-0 z-(--fd-z-scrim) bg-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: ease.standard }}
            />
          </DialogPrimitive.Overlay>
          <DialogPrimitive.Content asChild forceMount {...props}>
            <MotionGlass
              ref={panelRef}
              layer={3}
              portal
              data-side={side}
              className={cn("fixed z-(--fd-z-modal) flex touch-pan-y flex-col outline-none", PLACEMENT[side], className)}
              initial={hidden}
              animate={shown}
              exit={{ ...hidden, transition: { ...spring.sheet } }}
              transition={spring.sheet}
              drag={axis}
              dragControls={controls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
              dragElastic={
                side === "bottom"
                  ? { top: 0.05, bottom: 1 }
                  : side === "top"
                    ? { top: 1, bottom: 0.05 }
                    : side === "right"
                      ? { left: 0.05, right: 1 }
                      : { left: 1, right: 0.05 }
              }
              dragTransition={{ bounceStiffness: 520, bounceDamping: 40 }}
              onPointerDown={startDrag}
              onDragEnd={onDragEnd}
            >
              {side === "bottom" && !hideHandle ? (
                <div data-sheet-handle className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center pt-2 select-none active:cursor-grabbing md:hidden">
                  <span aria-hidden="true" className="h-1 w-9 rounded-pill bg-rim-strong" />
                </div>
              ) : null}
              {children}
              {showClose ? (
                <DialogPrimitive.Close asChild>
                  <IconButton label="Close" icon={<X />} variant="plain" size="sm" tooltip={false} className="absolute top-3 right-3" />
                </DialogPrimitive.Close>
              ) : null}
            </MotionGlass>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      ) : null}
    </AnimatePresence>
  );
}

/** Title block; it is the drag handle (touch-none) so a thumb can grab the sheet from the top. */
export function SheetHeader({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div data-sheet-handle className={cn("grid shrink-0 touch-none gap-1.5 px-6 pt-5 pr-14 pb-2 select-none", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-display text-title-lg text-fg", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-body-sm text-fg-muted", className)} {...props} />;
}

/** Scrolling content. Use fills (`bg-surface-field`) inside, never more glass. Contained overscroll keeps the page still. */
export function SheetBody({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div data-sheet-scroll className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("pb-safe flex shrink-0 flex-col-reverse gap-2 px-6 pt-3 pb-6 sm:flex-row sm:justify-end", className)} {...props} />;
}
