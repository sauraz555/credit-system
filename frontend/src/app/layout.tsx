/**
 * Root Next.js Layout Component.
 *
 * Defines HTML envelope structure, metadata, IBM Plex font stylesheets, and Carbon CSS,
 * wrapping all application views within the persistent CarbonShell navigation frame.
 *
 * Architecture:
 *   Frontend Presentation Layer (Root Layout).
 *   Top-level layout for the Next.js App Router.
 *   Imports globals.css and mounts CarbonShell.
 *
 * Legal / Regulatory:
 *   Specifies lang="en" and semantic root element structures for WCAG 2.1 AA screen reader compliance.
 */

import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Credit Reporting Mechanism",
  description: "Enterprise Credit Scoring & Reporting Platform",
};

/**
 * Props for the RootLayout component.
 */
export interface RootLayoutProps {
  /** Child routes and page components to render. */
  children: React.ReactNode;
}

/**
 * Root Next.js HTML and body wrapper for the entire application.
 *
 * @param props - RootLayoutProps containing children elements.
 * @returns JSX.Element defining the HTML structure and persistent AppShell wrapper.
 */
export default function RootLayout({
  children,
}: RootLayoutProps) {
  return (
    <html lang="en" data-carbon-theme="g100">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Mukta:wght@300;400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <link rel="stylesheet" href="/carbon.css" />
      </head>
      <body className="bg-[#0b0b0d] text-[#e6e6e6]">
        <I18nProvider>
          <AppShell>
            {children}
          </AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
