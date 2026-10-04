"use client";

import { useState, type ComponentPropsWithRef, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassPanel } from "@/components/glass/glass";
import { Button } from "./button";
import { IconButton } from "./icon-button";

/**
 * Modal dialog on L3 glass over a scrim. Focus is trapped and restored, Escape and the scrim close it, the page behind
 * is inert and does not scroll. Opens with a 240ms scale from 0.96 (modals stay centred: they have no trigger origin).
 *
 * ```tsx
 * <Dialog>
 *   <DialogTrigger asChild><Button>Fund $5,000</Button></DialogTrigger>
 *   <DialogContent>
 *     <DialogHeader><DialogTitle>Fund this bounty</DialogTitle><DialogDescription>Held in escrow until views clear.</DialogDescription></DialogHeader>
 *     <DialogBody>…</DialogBody>
 *     <DialogFooter><DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose><Button variant="primary">Fund $5,000</Button></DialogFooter>
 *   </DialogContent>
 * </Dialog>
 * ```
 */
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const SIZE = {
  sm: "max-w-[25rem]",
  md: "max-w-[30rem]",
  lg: "max-w-[40rem]",
  xl: "max-w-[50rem]",
} as const;

export interface DialogContentProps extends ComponentPropsWithRef<typeof DialogPrimitive.Content> {
  size?: keyof typeof SIZE;
  /** Show the close button (top right). Keep it unless the dialog is a forced choice. */
  showClose?: boolean;
  /** Skip the open/close animation (for dialogs opened from the keyboard many times a day). */
  instant?: boolean;
}

export function DialogContent({ size = "md", showClose = true, instant = false, className, children, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={cn("fixed inset-0 z-(--fd-z-scrim) bg-scrim", !instant && "fd-overlay")} />
      <DialogPrimitive.Content asChild {...props}>
        <GlassPanel
          portal
          padding="none"
          className={cn(
            "fixed inset-0 z-(--fd-z-modal) m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col rounded-[28px] outline-none sm:rounded-3xl",
            !instant && "fd-dialog",
            SIZE[size],
            className,
          )}
        >
          {children}
          {showClose ? (
            <DialogPrimitive.Close asChild>
              <IconButton label="Close" icon={<X />} variant="plain" size="sm" tooltip={false} className="absolute top-3 right-3" />
            </DialogPrimitive.Close>
          ) : null}
        </GlassPanel>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("grid gap-1.5 px-6 pt-6 pr-14 pb-2 sm:px-7 sm:pt-7", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("font-display text-title-lg text-fg", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: ComponentPropsWithRef<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-body-sm text-fg-muted", className)} {...props} />;
}

/** Scrolling content area. Use fills (`bg-surface-field`) inside, never more glass. */
export function DialogBody({ className, ...props }: ComponentPropsWithRef<"div">) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-4 sm:px-7", className)} {...props} />;
}

/** Actions row: right-aligned on desktop, stacked full-width (primary first) on a phone. */
export function DialogFooter({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse gap-2 px-6 pt-3 pb-6 sm:flex-row sm:items-center sm:justify-end sm:px-7 sm:pb-7 [&>button]:w-full sm:[&>button]:w-auto", className)}
      {...props}
    />
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Name the outcome ("Remove post", "Fund $5,000"), never just "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` = solid rose confirm for irreversible actions. */
  tone?: "default" | "danger";
  /** Runs on confirm; the dialog shows a busy state until it resolves, then closes. A rejection keeps it open. */
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
}

/**
 * Confirmation as an alert dialog (`role="alertdialog"`): a forced, two-button choice for genuinely irreversible
 * actions. Prefer undo toasts for reversible ones (apple-design: forgiveness over confirmation).
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, cancelLabel = "Cancel", tone = "default", onConfirm, children }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  const confirm = async (): Promise<void> => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller reports the failure (toast); keep the dialog open so the choice is not lost.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent size="sm" role="alertdialog" showClose={false}>
        <DialogHeader className="pr-7">
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children ? <DialogBody>{children}</DialogBody> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "destructive" : "primary"} loading={busy} onClick={confirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
