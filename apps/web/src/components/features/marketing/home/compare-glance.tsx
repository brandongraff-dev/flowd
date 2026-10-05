import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { COMPETITORS, GLANCE_IDS, LAST_VERIFIED } from "./compare-data";
import { CompareGrid, ConfidenceLegend } from "./compare-grid";

/**
 * The comparison at a glance: flowd beside Trybe and Whop Content Rewards on four topics, every cell tagged verified, reported or not documented and
 * dated. It does not claim to be like-for-like where it is not, and the full table (more topics, SideShift and agencies, where each is better) is on /compare.
 */
export function CompareGlance() {
  const chosen = COMPETITORS.filter((competitor) => GLANCE_IDS.includes(competitor.id));
  return (
    <div className="grid gap-6">
      <CompareGrid competitors={chosen} topicIds={["fees", "pays", "escrow", "attribution"]} caption="flowd compared with Trybe and Whop Content Rewards on fees, what creators are paid for, pay guarantee and app attribution" />
      <div className="grid gap-5 rounded-2xl bg-surface-field p-5 shadow-[inset_0_0_0_1px_var(--fd-rim)]">
        <ConfidenceLegend />
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className="text-caption max-w-[64ch] text-fg-subtle">
            Last verified {LAST_VERIFIED}. These products change, and we may have it wrong: tell us at hello@joinflowd.io and we will fix it.
          </p>
          <Link href="/compare" className={buttonVariants({ variant: "secondary" })}>
            The full comparison
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
