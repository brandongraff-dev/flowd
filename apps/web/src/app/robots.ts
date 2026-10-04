import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/seo/robots";

/** robots.txt: the marketing site, tools and public pages are open; anything behind a login, the mock API and the dev gallery are not. */
export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
