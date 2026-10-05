import "@/components/features/marketing/home/marketing.css";
import { Aurora } from "@/components/glass/aurora";
import { MarketingFooter } from "@/components/features/marketing/home/marketing-footer";
import { MarketingNav } from "@/components/features/marketing/home/marketing-nav";

/**
 * The marketing shell: the aurora (L0, once), the floating glass nav (L2), the page, the footer. `main` carries the top padding the fixed nav
 * needs, so every page inside the group starts below it and content scrolls under the glass. Pages own their metadata and their `h1`.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Aurora />
      <MarketingNav />
      <main id="main" className="relative pt-20">
        {children}
      </main>
      <MarketingFooter />
    </>
  );
}
