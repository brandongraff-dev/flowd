/**
 * flowd command-palette search. Import from "@/lib/search". Pure functions fed with data the caller already has.
 *
 *   const index = buildSearchIndex({ role, bounties, creators, apps, lessons, recent });   // once per role or data change
 *   const groups = search(index, query);                                                    // ranked, grouped
 *   toCommandGroups(groups, { onAction })                                                   // from "@/lib/search/palette"
 *   useSearch(index)                                                                        // from "@/lib/search/use-search" (client)
 *
 * The route registry (`ROUTE_REGISTRY`) is the single list of static pages: the palette, the sitemap and the route-guard tests read it.
 */

export * from "./types";
export * from "./routes";
export * from "./actions";
export * from "./rank";
export * from "./build";
export * from "./recents";
