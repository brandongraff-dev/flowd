import { NextResponse, type NextRequest } from "next/server";

/**
 * `/brand/tests` is not a page: the test planner lives in Insights, so this is a permanent (308) redirect to
 * `/brand/insights/experiments`. A route handler, rather than a page, so crawlers and bookmarks see the 308 itself.
 */
export function GET(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/brand/insights/experiments", request.url), 308);
}

export { GET as HEAD };
