import { Fragment, type ComponentPropsWithRef, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: ReactNode;
  /** Omit for the current page. */
  href?: string;
}

export interface BreadcrumbsProps extends Omit<ComponentPropsWithRef<"nav">, "children"> {
  items: readonly BreadcrumbItem[];
}

const LINK = "rounded-md px-1 py-0.5 text-fg-subtle transition-colors duration-(--fd-dur-fast) ease-standard hover:text-fg";

/**
 * Breadcrumb trail ("Bounties / Nap Nest hook test / Submissions"). The last item is the current page (`aria-current`).
 * Below 640px a long trail keeps its first and last two items and the middle collapses to one ellipsis, so it never wraps
 * or scrolls sideways; the full path stays in the DOM for assistive tech. Server-renderable.
 */
export function Breadcrumbs({ items, className, ...props }: BreadcrumbsProps) {
  const last = items.length - 1;
  const long = items.length > 3;
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)} {...props}>
      <ol className="flex min-w-0 items-center gap-0.5 text-caption font-medium">
        {items.map((item, index) => {
          const current = index === last;
          const collapsible = long && index > 0 && index < last - 1;
          return (
            <Fragment key={index}>
              <li className={cn("flex items-center gap-0.5", index === 0 ? "max-w-[9rem] shrink-0" : current ? "max-w-[16rem] shrink-0" : "min-w-0 shrink", collapsible && "max-sm:hidden")}>
                {index > 0 ? <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-fg-disabled" strokeWidth={1.75} /> : null}
                {item.href && !current ? (
                  <Link href={item.href} className={cn(LINK, "truncate")}>
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={current ? "page" : undefined} className={cn("truncate px-1 py-0.5", current ? "text-fg-muted" : "text-fg-subtle")}>
                    {item.label}
                  </span>
                )}
              </li>
              {long && index === 0 ? (
                <li aria-hidden="true" className="hidden items-center gap-0.5 text-fg-subtle max-sm:flex">
                  <ChevronRight className="size-3.5 shrink-0 text-fg-disabled" strokeWidth={1.75} />
                  <Ellipsis className="size-4" strokeWidth={1.75} />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
