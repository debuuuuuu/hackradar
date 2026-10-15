import { authorizeUrl, clearOauthCookie, discordConfigured, exchangeCode, newState, oauthCookie, readOauthCookie, sameState, upsertUserByDiscord } from "./discord.js";
import { finishEmailLogin, findUser, normaliseEmail, peekEmailToken, recordLogin, safeNext, sessionFromRequest, sessionSecret, startEmailLogin } from "./auth.js";
import { keyFromEnv } from "./crypto.js";
import { addRoute, error, json } from "./http.js";
import { sendLoginEmail } from "./mail.js";
import { clearSessionCookie, sessionCookie, signSession } from "./session.js";

const MAX_BODY_BYTES = 2048;

const isJson = (request: Request): boolean =>
  (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");

/** Parses a small JSON object body, or returns the error response to send. */
async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  if (!isJson(request)) return error(415, "content-type must be application/json");
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) return error(400, "request too large");
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return error(400, "request too large");
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  return error(400, "invalid JSON");
}

/** SITE_URL when set, else the request's own origin. */
function originFor(url: URL): string {
  const site = process.env.SITE_URL;
  if (site) {
    try {
      return new URL(site).origin;
    } catch {
      // ignore a malformed SITE_URL and fall back
    }
  }
  return url.origin;
}

/** Error class name plus its short machine `code` (e.g. EAUTH); never the message. */
function errTag(e: unknown): string {
  if (!(e instanceof Error)) return "unknown";
  const code = (e as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,32}$/.test(code) ? `${e.name} ${code}` : e.name;
}

const redirect = (location: string, cookies: string[] = []): Response => {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
};

export function registerAuthRoutes(): void {
  addRoute("POST", "/api/auth/email/start", async (request, _params, url) => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const email = normaliseEmail(body.email);
    if (!email) return error(400, "enter a valid email address");
    const next = typeof body.next === "string" ? body.next : null;
    try {
      await startEmailLogin(email, { send: sendLoginEmail, origin: originFor(url), next });
    } catch (e) {
      // Same response whatever happened; log the class only (messages can carry addresses).
      console.error("email sign-in start failed:", errTag(e));
    }
    return json({ ok: true });
  });

  // GET only checks the token: mail scanners prefetch links, so it must stay usable until confirmed.
  addRoute("GET", "/api/auth/email/verify", async (_request, _params, url) => {
    const token = url.searchParams.get("token") ?? "";
    let valid = false;
    try {
      valid = await peekEmailToken(token);
    } catch (e) {
      console.error("email sign-in check failed:", errTag(e));
    }
    if (!valid) return redirect("/signin?error=expired");
    const next = safeNext(url.searchParams.get("next"));
    return redirect(`/signin/confirm?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`);
  });

  addRoute("POST", "/api/auth/email/verify", async (request) => {
    const failed = () => json({ ok: false }, { status: 400 });
    const body = await readBody(request);
    if (body instanceof Response) return body.status === 415 ? body : failed();
    try {
      const token = typeof body.token === "string" ? body.token : "";
      const secret = sessionSecret(); // read before the token is consumed
      keyFromEnv();
      const result = await finishEmailLogin(token);
      if (!result) return failed();
      const cookie = sessionCookie(signSession({ uid: result.uid }, secret));
      return json({ ok: true, next: safeNext(typeof body.next === "string" ? body.next : null) }, { headers: { "set-cookie": cookie } });
    } catch (e) {
      console.error("email sign-in verify failed:", errTag(e));
      return failed();
    }
  });

  addRoute("GET", "/api/auth/providers", () => json({ email: true, discord: discordConfigured() }));

  addRoute("GET", "/api/auth/discord/start", (_request, _params, url) => {
    if (!discordConfigured()) return redirect("/signin?error=discord");
    try {
      const state = newState();
      const next = safeNext(url.searchParams.get("next"));
      const cookie = oauthCookie(state, next, sessionSecret());
      return redirect(authorizeUrl(state, `${originFor(url)}/api/auth/discord/callback`), [cookie]);
    } catch (e) {
      console.error("discord sign-in start failed:", errTag(e));
      return redirect("/signin?error=discord");
    }
  });

  addRoute("GET", "/api/auth/discord/callback", async (request, _params, url) => {
    const clear = [clearOauthCookie()]; // state is single-use in every outcome
    try {
      if (!discordConfigured()) return redirect("/signin?error=discord", clear);
      const secret = sessionSecret(); // read before anything changes
      const saved = readOauthCookie(request.headers.get("cookie"), secret);
      const state = url.searchParams.get("state") ?? "";
      if (!saved || !state || !sameState(state, saved.state)) return redirect("/signin?error=state", clear);
      const code = url.searchParams.get("code") ?? "";
      if (url.searchParams.has("error") || !code || code.length > 512) return redirect("/signin?error=discord", clear);
      const profile = await exchangeCode(code, `${originFor(url)}/api/auth/discord/callback`);
      const { uid } = await upsertUserByDiscord(profile);
      await recordLogin(uid, "discord");
      return redirect(safeNext(saved.next), [...clear, sessionCookie(signSession({ uid }, secret))]);
    } catch (e) {
      console.error("discord sign-in failed:", errTag(e));
      return redirect("/signin?error=discord", clear);
    }
  });

  addRoute("POST", "/api/auth/logout", async (request) => {
    if (!isJson(request)) return error(415, "content-type must be application/json");
    return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
  });

  addRoute("GET", "/api/me", async (request) => {
    const session = sessionFromRequest(request);
    const user = session ? await findUser(session.uid) : null;
    if (!user) return error(401, "not signed in");
    return json(user);
  });
}
