"use client";

import type { ReactElement, ReactNode } from "react";
import { toast, type ExternalToast } from "sonner";
import { Check, CircleAlert, Info, TriangleAlert, X, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button-variants";
import { Money } from "./money";
import { Spinner } from "./spinner";

export type NotifyTone = "neutral" | "success" | "error" | "warning" | "info" | "money" | "flo";

const DISC: Record<NotifyTone, string> = {
  neutral: "bg-surface-active text-fg",
  success: "bg-mint-solid text-on-mint",
  money: "bg-mint-solid text-on-mint",
  error: "bg-rose-soft text-rose",
  warning: "bg-sun-soft text-sun",
  info: "bg-info-soft text-info",
  flo: "bg-violet-soft text-violet",
};

const GLYPH: Record<NotifyTone, ReactNode> = {
  neutral: <Info />,
  success: <Check strokeWidth={2.5} />,
  money: <Check strokeWidth={2.5} />,
  error: <CircleAlert />,
  warning: <TriangleAlert />,
  info: <Info />,
  flo: <Zap />,
};

export interface ToastCardProps {
  tone?: NotifyTone;
  title: ReactNode;
  description?: ReactNode;
  /** Replaces the tone's glyph (a node, or the Spinner for loading). */
  icon?: ReactNode;
  /** An amount shown big under the title (money toasts). */
  amount?: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Shows the close button. Persistent toasts (errors, actions) always get one. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * The body of a flowd toast. The L2 glass material is on the Sonner `<li>` (class `glass fd-toast`, see styles/glass.css),
 * so this renders only the row: a status disc, words and an optional action. Exported so /dev/design (and Storybook-like
 * previews) can show it statically inside any `.glass.fd-toast` element. Use `notify.*` in product code.
 */
export function ToastCard({ tone = "neutral", title, description, icon, amount, action, onDismiss, className }: ToastCardProps) {
  return (
    <div role={tone === "error" ? "alert" : undefined} className={cn("flex items-start gap-3 p-3 pr-3.5", className)}>
      <span aria-hidden="true" className={cn("mt-px grid size-8 shrink-0 place-items-center rounded-full [&_svg]:size-4 [&_svg]:stroke-[2]", DISC[tone])}>
        {icon ?? GLYPH[tone]}
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5 py-0.5">
        <p className="text-body-sm font-semibold text-fg">{title}</p>
        {amount ? <div>{amount}</div> : null}
        {description ? <p className="text-caption text-fg-muted">{description}</p> : null}
      </div>
      {action ? (
        <button type="button" onClick={action.onClick} className={cn(buttonVariants({ variant: "secondary", size: "xs" }), "self-center")}>
          {action.label}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="-mr-1 grid size-8 shrink-0 place-items-center self-start rounded-full text-fg-subtle transition-colors duration-(--fd-dur-fast) ease-standard hover:bg-surface-hover hover:text-fg pointer-coarse:size-11"
        >
          <X aria-hidden="true" className="size-4" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

export interface NotifyOptions {
  description?: ReactNode;
  action?: { label: string; onClick: () => void };
  /** ms before it closes. Errors, warnings with an action and loading toasts stay until dismissed unless you set this. */
  duration?: number;
  /** Reuse an id to update a toast in place (loading -> success). */
  id?: string | number;
  /** Fired when the person closes it (swipe or X), not when it times out. */
  onDismiss?: () => void;
}

const BASE_DURATION = 4000;

function show(tone: NotifyTone, title: ReactNode, options: NotifyOptions = {}, extra: Partial<ToastCardProps> = {}): string | number {
  const persistent = tone === "error" || Boolean(options.action && tone === "warning");
  const duration = options.duration ?? (persistent ? Infinity : tone === "money" ? 5500 : BASE_DURATION);
  const data: ExternalToast = {
    id: options.id,
    duration,
    onDismiss: options.onDismiss ? () => options.onDismiss?.() : undefined,
    classNames: { toast: "glass fd-toast" },
  };
  return toast.custom(
    (id): ReactElement => (
      <ToastCard
        tone={tone}
        title={title}
        description={options.description}
        action={options.action ? { label: options.action.label, onClick: () => { options.action?.onClick(); toast.dismiss(id); } } : undefined}
        onDismiss={persistent || duration === Infinity ? () => toast.dismiss(id) : undefined}
        {...extra}
      />
    ),
    data,
  );
}

type PromiseMessages<T> = {
  loading: ReactNode;
  success: ReactNode | ((value: T) => ReactNode);
  error: ReactNode | ((reason: unknown) => ReactNode);
};

/**
 * Design-system toasts. They render on Sonner (positioning, stacking, swipe, pause on hover and when the tab is hidden)
 * with the flowd L2 glass body. Mount nothing extra: `AppToaster` in the shell already hosts them.
 *
 * Voice: one line that says what happened, a second line only if it changes what the person does next. Celebrations are
 * for earned creator outcomes (`money`); a brand funding a bounty gets a calm `success`.
 *
 * ```ts
 * notify.success("Bounty is live", { description: "Funded with $5,000 in escrow." });
 * notify.money("Payout flowd", { cents: 6240, description: "cleared to your Wallet" });
 * notify.undo("Post removed", { onUndo: restore });
 * await notify.promise(save(), { loading: "Saving rate card", success: "Rate card saved", error: "Couldn't save. Try again." });
 * ```
 */
export const notify = {
  message: (title: ReactNode, options?: NotifyOptions) => show("neutral", title, options),
  success: (title: ReactNode, options?: NotifyOptions) => show("success", title, options),
  info: (title: ReactNode, options?: NotifyOptions) => show("info", title, options),
  warning: (title: ReactNode, options?: NotifyOptions) => show("warning", title, options),
  /** Errors stay until dismissed and say what to do. */
  error: (title: ReactNode, options?: NotifyOptions) => show("error", title, options),
  /** Flo, the copilot: violet. */
  flo: (title: ReactNode, options?: NotifyOptions) => show("flo", title, options),
  /** Earned money for creators: mint check and the amount as a hero figure. The one place confetti-adjacent colour is allowed. */
  money: (title: ReactNode, options: NotifyOptions & { cents: number }) =>
    show("money", title, options, {
      amount: <Money cents={options.cents} state="cleared" size="md" signDisplay="always" icon={false} />,
    }),
  /** A reversible action: 10 seconds to undo, instead of a confirm dialog (apple-design: forgiveness over confirmation). */
  undo: (title: ReactNode, options: Omit<NotifyOptions, "action"> & { onUndo: () => void; label?: string }) =>
    show("neutral", title, {
      ...options,
      duration: options.duration ?? 10_000,
      action: { label: options.label ?? "Undo", onClick: options.onUndo },
    }),
  /** Busy toast; returns its id so you can update it with `notify.success(..., { id })`. */
  loading: (title: ReactNode, options?: Omit<NotifyOptions, "duration">): string | number =>
    show("neutral", title, { ...options, duration: Infinity }, { icon: <Spinner size={16} /> }),
  /** loading -> success / error from one promise. Resolves with the promise's own value so you can keep chaining. */
  promise: async <T,>(promise: Promise<T>, messages: PromiseMessages<T>, options?: Omit<NotifyOptions, "duration" | "id">): Promise<T> => {
    const id = notify.loading(messages.loading, options);
    try {
      const value = await promise;
      show("success", typeof messages.success === "function" ? messages.success(value) : messages.success, { ...options, id });
      return value;
    } catch (reason) {
      show("error", typeof messages.error === "function" ? messages.error(reason) : messages.error, { ...options, id });
      throw reason;
    }
  },
  /** Close one toast by id, or all of them. */
  dismiss: (id?: string | number) => toast.dismiss(id),
};
