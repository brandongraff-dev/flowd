import { cache } from "react";
import { open } from "node:fs/promises";
import path from "node:path";

export interface ApiFacts {
  paths: number;
  operations: number;
  webhookEvents: number;
  mcpTools: number;
  /** Size of the downloadable spec in whole kilobytes. */
  specKb: number;
}

/** What the generated spec says about itself (its first comment lines), so the page quotes the file it links to instead of a number typed by hand. */
const FALLBACK: ApiFacts = { paths: 210, operations: 236, webhookEvents: 18, mcpTools: 5, specKb: 1400 };

export const getApiFacts = cache(async (): Promise<ApiFacts> => {
  try {
    const file = path.join(process.cwd(), "public", "openapi.yaml");
    const handle = await open(file, "r");
    try {
      const { size } = await handle.stat();
      const buffer = Buffer.alloc(600);
      await handle.read(buffer, 0, 600, 0);
      const head = buffer.toString("utf8");
      const match = /(\d+) paths, (\d+) operations[^\n]*?(\d+) outbound webhook events, (\d+) MCP tools/.exec(head);
      if (!match) return { ...FALLBACK, specKb: Math.round(size / 1024) };
      return { paths: Number(match[1]), operations: Number(match[2]), webhookEvents: Number(match[3]), mcpTools: Number(match[4]), specKb: Math.round(size / 1024) };
    } finally {
      await handle.close();
    }
  } catch {
    return FALLBACK;
  }
});
