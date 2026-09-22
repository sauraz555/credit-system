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
        <link rel="stylesheet" href="/carbon.css" />
        <link rel="stylesheet" href="https://1.www.s81c.com/common/carbon/plex/sans.css" />
        <link rel="stylesheet" href="https://1.www.s81c.com/common/carbon/plex/mono.css" />
      </head>
      <body className="bg-[#0b0b0d] text-[#e6e6e6]">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
