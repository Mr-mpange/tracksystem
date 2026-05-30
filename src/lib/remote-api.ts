/**
 * On GitHub Pages there is no Node server — admin APIs run on Supabase Edge Functions.
 */

const EDGE_FN: Record<string, string> = {
  "/api/drivers/invite": "invite-driver",
  "/api/sms/bulk": "sms-bulk",
  "/api/schedules/notify": "schedule-notify",
};

const isStaticHost = import.meta.env.VITE_GITHUB_PAGES === "true";

export function siteBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const base = import.meta.env.BASE_URL || "/";
  return `${window.location.origin}${base}`.replace(/\/$/, "");
}

export function resolveApiUrl(path: string): string {
  if (!isStaticHost) return path;
  const fn = EDGE_FN[path];
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  if (!fn || !supabaseUrl) return path;
  return `${supabaseUrl}/functions/v1/${fn}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = resolveApiUrl(path);
  const headers = new Headers(init.headers);

  if (isStaticHost) {
    const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (anon) headers.set("apikey", anon);
  }

  return fetch(url, { ...init, headers });
}

export async function apiJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.ok
        ? "Invalid server response"
        : `Request failed (${res.status}). Deploy Supabase Edge Functions for GitHub Pages — see docs/GITHUB_PAGES.md`
    );
  }
}
