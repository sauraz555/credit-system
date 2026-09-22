/**
 * API Client Configuration and Base URL Resolution.
 *
 * Provides a centralized API base URL resolving from the NEXT_PUBLIC_API_URL
 * environment variable with fallback to local development server (http://localhost:8000).
 *
 * Architecture:
 *   Frontend Network Integration Layer.
 *   Exported for use across all Next.js App Router client and server components.
 */

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Checks connectivity to the backend health endpoint.
 * Returns true if the service responds with 200, false otherwise.
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/health`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}
