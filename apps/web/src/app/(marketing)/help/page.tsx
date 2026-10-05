import { buildMetadata, faqJsonLd, graph } from "@/lib/seo";
import { JsonLd } from "@/lib/seo/json-ld-script";
import { HELP_ARTICLES } from "@/components/features/marketing/pages/help/help-articles";
import { HelpCenter } from "@/components/features/marketing/pages/help/help-center";

export const metadata = buildMetadata({
  title: "Help centre",
  description: "Search answers on money, reviews, rights, taxes, safety and attribution, written in plain words with the real numbers, and reach a person with a named response time.",
  path: "/help",
});

export default function HelpPage() {
  const faq = HELP_ARTICLES.filter((article) => article.top).map((article) => ({
    question: article.title,
    answer: article.blocks.flatMap((block) => ("p" in block ? [block.p] : "ul" in block ? [...block.ul] : [])).join(" "),
  }));
  return (
    <>
      <JsonLd data={graph(faqJsonLd(faq))} />
      <HelpCenter />
    </>
  );
}
