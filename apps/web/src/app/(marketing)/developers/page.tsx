import Link from "next/link";
import { Download } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { buttonVariants } from "@/components/ui/button-variants";
import { Badge } from "@/components/ui/badge";
import { CtaBand, HeroAccent, PageHero } from "@/components/features/marketing/pages/kit";
import { CodeBlock } from "@/components/features/marketing/pages/developers/code-block";
import { getApiFacts } from "@/components/features/marketing/pages/developers/developers-data";
import {
  CURL_CREATE,
  ConventionsSection,
  EndpointsSection,
  FirstCallSection,
  LimitsSection,
  McpSection,
  RESPONSE_CREATE,
  SandboxSection,
  WebhooksSection,
} from "@/components/features/marketing/pages/developers/developers-sections";

export const metadata = buildMetadata({
  title: "Developers",
  description: "The flowd API: scopes (read, write, financial), drafts by default, endpoint groups, signed webhooks, an MCP server and rate limits. OpenAPI 3.1 download and a sandbox key.",
  path: "/developers",
});

export default async function DevelopersPage() {
  const facts = await getApiFacts();
  return (
    <>
      <PageHero
        eyebrow="Developers"
        title={
          <>
            An API for the <HeroAccent>whole market.</HeroAccent>
          </>
        }
        lede="The same money rules as the dashboard, over REST, webhooks and MCP. Drafts by default, scopes you can read at a glance, integer cents everywhere, and a spec you can download."
        actions={
          <>
            <Link href="/signup/brand" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Get a sandbox key
            </Link>
            <a href="/openapi.yaml" download className={buttonVariants({ variant: "secondary", size: "lg" })}>
              <Download aria-hidden="true" />
              OpenAPI spec
            </a>
          </>
        }
        meta={
          <>
            <Badge size="lg">{facts.paths} paths</Badge>
            <Badge size="lg">{facts.operations} operations</Badge>
            <Badge size="lg">{facts.webhookEvents} webhook events</Badge>
            <Badge size="lg">{facts.mcpTools} MCP tools</Badge>
          </>
        }
        art={
          <div className="mx-auto grid w-full max-w-[36rem] gap-3 lg:ml-auto">
            <CodeBlock label="curl · create a draft bounty" code={CURL_CREATE} />
            <CodeBlock label="Response · 201 · a draft, not yet funded" code={RESPONSE_CREATE} />
          </div>
        }
      />
      <ConventionsSection />
      <FirstCallSection />
      <EndpointsSection facts={facts} />
      <WebhooksSection facts={facts} />
      <McpSection facts={facts} />
      <LimitsSection />
      <SandboxSection facts={facts} />
      <CtaBand
        title="Build the thing you wish the market had."
        description="Create a brand workspace, make a sandbox key and send your first call in minutes. Questions? A person answers."
        actions={
          <>
            <Link href="/signup/brand" className={buttonVariants({ variant: "primary", size: "lg" })}>
              Create a workspace
            </Link>
            <Link href="/help" className={buttonVariants({ variant: "secondary", size: "lg" })}>
              Ask a question
            </Link>
          </>
        }
      />
    </>
  );
}
