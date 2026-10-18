const TIMEOUT_MS = 8000;
const MAX_NAME_LEN = 40;

/** Supabase project URL and anon key (public by design). Null until both are set. */
export function supabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  return url && anonKey ? { url, anonKey } : null;
}

const cleanName = (s: string): string =>
  Array.from(s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim())
    .slice(0, MAX_NAME_LEN)
    .join("") || "Member";

/**
 * Asks Supabase who an access token belongs to (GET /auth/v1/user), so no signing secret lives in our code.
 * Only a CONFIRMED email is accepted, because our account is keyed by email. Throws a generic Error on any
 * failure; the message never carries response text or the token.
 */
export async function verifySupabaseToken(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ email: string; name: string }> {
  const fail = () => new Error("supabase token check failed");
  try {
    const cfg = supabaseConfig();
    if (!cfg) throw fail();
    const res = await fetchImpl(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.anonKey, authorization: `Bearer ${accessToken}`, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw fail();
    const user = (await res.json()) as {
      email?: unknown;
      email_confirmed_at?: unknown;
      user_metadata?: { name?: unknown; full_name?: unknown };
    };
    if (typeof user.email !== "string" || !user.email) throw fail();
    if (typeof user.email_confirmed_at !== "string" || !user.email_confirmed_at) throw fail();
    const meta = user.user_metadata ?? {};
    const raw = typeof meta.name === "string" ? meta.name : typeof meta.full_name === "string" ? meta.full_name : "";
    return { email: user.email, name: cleanName(raw) };
  } catch {
    throw fail();
  }
}
