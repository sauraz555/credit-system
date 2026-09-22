/**
 * Next.js Framework Configuration.
 *
 * Configures Next.js compiler settings, image optimization, edge routing,
 * and build options for the Credit Reporting Mechanism frontend.
 *
 * Architecture:
 *   Frontend Build & Runtime Configuration (Next.js App Router).
 *   Used by Next.js build and dev servers.
 */

import type { NextConfig } from "next";
import { execSync } from "child_process";

let gitSha = "01b7736";
try {
  gitSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  // Fallback to default build sha
}

/** Next.js application configuration settings. */
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_GIT_SHA: gitSha,
  },
};

export default nextConfig;

