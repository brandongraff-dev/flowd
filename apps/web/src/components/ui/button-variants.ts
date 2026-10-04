import { cva } from "class-variance-authority";

/**
 * Button recipes. Material (gradients, highlights, glows) lives in styles/glass.css (`.fd-btn-*`); size, layout and
 * typography live here. Reuse for links: `<Link className={buttonVariants({ variant: "secondary" })}>`.
 *
 * Variants (one primary per view; the rest stay quiet):
 *  - primary      deep Flow gradient, white label. THE action.
 *  - secondary    L2 glass look (flat: no live backdrop, so ten of them cost nothing). Default for peers.
 *  - glass        real L2 glass with pointer sheen. Hero and floating contexts only (counts toward the glass budget).
 *  - ghost        transparent with a strong rim.
 *  - plain        text-only, hover wash. Toolbars, table actions.
 *  - mint         money-in (cash out, claim). Ink label.
 *  - ember        the single most urgent action (Daily Drop). Ink label.
 *  - danger       soft rose. Reversible destructive.
 *  - destructive  solid rose. Irreversible, confirm dialogs.
 *  - link         inline accent text.
 */
export const buttonVariants = cva(
  [
    "fd-btn relative inline-flex h-(--btn-h) shrink-0 items-center justify-center gap-2 rounded-pill whitespace-nowrap select-none",
    "text-button [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:stroke-[1.75]",
  ],
  {
    variants: {
      variant: {
        primary: "fd-btn-primary",
        secondary: "fd-btn-secondary",
        glass: "fd-btn-glass",
        ghost: "fd-btn-ghost",
        plain: "fd-btn-plain",
        mint: "fd-btn-mint",
        ember: "fd-btn-ember",
        danger: "fd-btn-danger",
        destructive: "fd-btn-destructive",
        link: "fd-btn-link h-auto min-h-0 rounded-sm px-0.5",
      },
      size: {
        xs: "[--btn-h:1.75rem] px-3 text-[13px] gap-1.5 [&_svg]:size-4 pointer-coarse:min-h-11",
        sm: "[--btn-h:2.25rem] px-4 text-[14px] pointer-coarse:min-h-11",
        md: "[--btn-h:2.75rem] px-5",
        lg: "[--btn-h:3.25rem] px-7 text-[16px]",
      },
      iconOnly: {
        true: "w-(--btn-h) px-0 pointer-coarse:min-w-11",
        false: "",
      },
    },
    defaultVariants: { variant: "secondary", size: "md", iconOnly: false },
  },
);
