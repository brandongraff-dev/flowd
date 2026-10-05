import { noindexMetadata } from "@/lib/seo";
import { VerifyView } from "@/components/features/auth/verify-view";

export const metadata = noindexMetadata("Verify your identity", "A one-time identity and age check before your first payout, or a business check for brands.", "/verify");

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `/verify` is the creator's ID and 18+ check; `/verify?kind=brand` is the brand's business verification. */
export default async function VerifyPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const kind = (Array.isArray(params.kind) ? params.kind[0] : params.kind) === "brand" ? "brand" : "creator";
  return <VerifyView kind={kind} />;
}
