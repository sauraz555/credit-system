import type { Metadata } from "next";
import "./globals.css";
import CarbonShell from "@/components/CarbonShell";

export const metadata: Metadata = {
  title: "Credit Reporting Mechanism",
  description: "Enterprise Credit Scoring & Reporting Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="/carbon.css" />
        <link rel="stylesheet" href="https://1.www.s81c.com/common/carbon/plex/sans.css" />
        <link rel="stylesheet" href="https://1.www.s81c.com/common/carbon/plex/mono.css" />
      </head>
      <body>
        <CarbonShell>
          {children}
        </CarbonShell>
      </body>
    </html>
  );
}
