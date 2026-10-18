const AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const TIMEOUT_MS = 8000;
const MAX_NAME_LEN = 40;

export const GOOGLE_COOKIE_PATH = "/api/auth/google";

export const googleConfigured = (): boolean =>
  Boolean(process.env.GOOGLE_CLIENT_ID) && Boolean(process.env.GOOGLE_CLIENT_SECRET);

export function authorizeUrl(state: string, redirectUri: string): string {
  const u = new URL(AUTHORIZE);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID ?? "");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

const cleanName = (s: string): string =>
  Array.from(s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim())
    .slice(0, MAX_NAME_LEN)
    .join("") || "Member";

/**
 * Trades the code for the person's verified email and display name. Only an address Google reports as
 * verified is accepted, because the account is keyed by email. Throws a generic Error on any failure; the
 * message never carries response text, the access token or the client secret.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ email: string; name: string }> {
  const fail = () => new Error("google exchange failed");
  try {
    const tokenRes = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!tokenRes.ok) throw fail();
    const token = (await tokenRes.json()) as { access_token?: unknown };
    if (typeof token.access_token !== "string" || !token.access_token) throw fail();
    const meRes = await fetchImpl(USERINFO_URL, {
      headers: { authorization: `Bearer ${token.access_token}`, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!meRes.ok) throw fail();
    const me = (await meRes.json()) as { email?: unknown; email_verified?: unknown; name?: unknown };
    if (typeof me.email !== "string" || me.email_verified !== true) throw fail();
    return { email: me.email, name: cleanName(typeof me.name === "string" ? me.name : "") };
  } catch {
    throw fail();
  }
}
