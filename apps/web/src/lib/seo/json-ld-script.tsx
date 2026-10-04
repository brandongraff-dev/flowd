import { jsonLdString, type JsonLdNode } from "./json-ld";

export interface JsonLdProps {
  /** One node, a `graph(...)`, or several separate documents. */
  data: JsonLdNode | readonly JsonLdNode[];
}

/**
 * Renders structured data. A server component: put it in a page or layout body.
 *
 * ```tsx
 * <JsonLd data={faqJsonLd(FAQ)} />
 * ```
 */
export function JsonLd({ data }: JsonLdProps) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
