import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./globals.css";
import { Providers } from "@/components/shell/providers";
import { REDUCE_GLASS_BOOT_SCRIPT } from "@/components/glass/reduce-glass";
import { SERVER_RESOLVED_THEME, themeInitScript } from "@/lib/theme";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "flowd: the open creator market for apps",
    template: "%s · flowd",
  },
  description:
    "flowd is the open creator market for apps. App teams fund bounties, creators compete for them, and money flows to what actually drives views, installs and paid subscriptions.",
  applicationName: "flowd",
  // Brand assets live in public/brand (copied from brand/logo). The file-based src/app/icon.svg is the same favicon.
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/brand/favicon.ico",
    apple: [{ url: "/brand/favicon-180.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    siteName: "flowd",
    type: "website",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630, alt: "flowd. Money follows what works." }],
  },
  twitter: { card: "summary_large_image", images: ["/brand/og-image.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  // Browser chrome colour must be a literal; these are the brand canvases (BRAND.md 6.2: abyss / pearl).
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#030921" },
    { media: "(prefers-color-scheme: light)", color: "#F3F7FF" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the init script below sets data-theme / color-scheme before React hydrates.
    <html
      lang="en"
      data-theme={SERVER_RESOLVED_THEME}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* In-app "Reduce glass": applies html[data-transparency="reduce"] before first paint (Safari/Firefox ignore the media query). */}
        <script dangerouslySetInnerHTML={{ __html: REDUCE_GLASS_BOOT_SCRIPT }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only rounded-full bg-surface-solid px-4 py-2 text-sm font-medium text-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
