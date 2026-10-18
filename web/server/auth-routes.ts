import { authorizeUrl, clearOauthCookie, discordConfigured, exchangeCode, newState, oauthCookie, readOauthCookie, sameState, upsertUserByDiscord } from "./discord.js";
import { cleanDisplayName, deleteAccount, finishEmailLogin, findUser, revokeSessions, normaliseEmail, peekEmailToken, recordLogin, safeNext, sessionFromRequest, sessionSecret, setDisplayName, signInWithGoogle, signInWithSupabase, startEmailLogin } from "./auth.js";
import * as google from "./google.js";
import { supabaseConfig, verifySupabaseToken } from "./supabase.js";
import { keyFromEnv } from "./crypto.js";
import { addRoute, error, json } from "./http.js";
import { isBadRecipient, sendLoginEmail, sendWelcomeEmail } from "./mail.js";
import { clearSessionCookie, sessionCookie, signSession } from "./session.js";
import { readUnsubscribeToken, unsubscribeToken } from "./unsubscribe.js";

const MAX_BODY_BYTES = 2048;

const isJson = (request: Request): boolean =>
  (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");

/** Parses a small JSON object body, or returns the error response to send. */
async function readBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown> | Response> {
  if (!isJson(request)) return error(415, "content-type must be application/json");
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes) return error(400, "request too large");
  const text = await request.text();
  if (Buffer.byteLength(text) > maxBytes) return error(400, "request too large");
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

/**
 * Welcome mail for a brand-new account. Awaited because a serverless function can be frozen once the
 * response is sent. A failure must never block the sign-in itself, so it is only logged.
 */
async function welcomeNewUser(result: { uid: number; isNew: boolean; email?: string }, url: URL): Promise<void> {
  if (!result.isNew || !result.email) return;
  const origin = originFor(url);
  const unsubscribe = new URL(`/api/auth/unsubscribe?token=${unsubscribeToken(result.uid)}`, origin).toString();
  await sendWelcomeEmail(result.email, new URL("/welcome", origin).toString(), unsubscribe).catch((e) =>
    console.error("welcome email failed:", errTag(e)),
  );
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
      // Vercel overwrites x-forwarded-for with the real client address, so its first entry can't be spoofed.
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
      await startEmailLogin(email, { send: sendLoginEmail, origin: originFor(url), next, ip });
    } catch (e) {
      // Log the class only (messages can carry addresses). Tell the person when the mail did not go out:
      // 422 = the server refused this address (check for typos), 502 = we could not send right now.
      console.error("email sign-in start failed:", errTag(e));
      return isBadRecipient(e) ? error(422, "undeliverable address") : error(502, "could not send email");
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
      await welcomeNewUser(result, new URL(request.url));
      const cookie = sessionCookie(signSession({ uid: result.uid }, secret));
      return json({ ok: true, next: safeNext(typeof body.next === "string" ? body.next : null) }, { headers: { "set-cookie": cookie } });
    } catch (e) {
      console.error("email sign-in verify failed:", errTag(e));
      return failed();
    }
  });

  addRoute("GET", "/api/auth/providers", () =>
    json({ email: true, discord: discordConfigured(), google: google.googleConfigured(), password: supabaseConfig() }),
  );

  // The browser signed in (or confirmed its email) with Supabase and hands over its access token. We ask
  // Supabase whether it is valid and confirmed, then give out our own session, the same as every other method.
  addRoute("POST", "/api/auth/supabase/session", async (request, _params, url) => {
    const body = await readBody(request, 8192);
    if (body instanceof Response) return body.status === 415 ? body : error(400, "invalid request");
    const token = typeof body.accessToken === "string" ? body.accessToken : "";
    if (!token || token.length > 6000) return error(400, "invalid request");
    try {
      const secret = sessionSecret(); // read before anything changes
      keyFromEnv();
      const profile = await verifySupabaseToken(token);
      const result = await signInWithSupabase(profile.email, profile.name);
      if (!result) return error(401, "sign-in failed");
      await welcomeNewUser(result, url);
      return json({ ok: true }, { headers: { "set-cookie": sessionCookie(signSession({ uid: result.uid }, secret)) } });
    } catch (e) {
      console.error("supabase sign-in failed:", errTag(e));
      return error(401, "sign-in failed");
    }
  });

  addRoute("GET", "/api/auth/google/start", (_request, _params, url) => {
    if (!google.googleConfigured()) return redirect("/signin?error=google");
    try {
      const state = newState();
      const next = safeNext(url.searchParams.get("next"));
      const cookie = oauthCookie(state, next, sessionSecret(), google.GOOGLE_COOKIE_PATH);
      return redirect(google.authorizeUrl(state, `${originFor(url)}/api/auth/google/callback`), [cookie]);
    } catch (e) {
      console.error("google sign-in start failed:", errTag(e));
      return redirect("/signin?error=google");
    }
  });

  addRoute("GET", "/api/auth/google/callback", async (request, _params, url) => {
    const clear = [clearOauthCookie(google.GOOGLE_COOKIE_PATH)]; // state is single-use in every outcome
    try {
      if (!google.googleConfigured()) return redirect("/signin?error=google", clear);
      const secret = sessionSecret(); // read before anything changes
      const saved = readOauthCookie(request.headers.get("cookie"), secret);
      const state = url.searchParams.get("state") ?? "";
      if (!saved || !state || !sameState(state, saved.state)) return redirect("/signin?error=state", clear);
      const code = url.searchParams.get("code") ?? "";
      if (url.searchParams.has("error") || !code || code.length > 512) return redirect("/signin?error=google", clear);
      const profile = await google.exchangeCode(code, `${originFor(url)}/api/auth/google/callback`);
      const result = await signInWithGoogle(profile.email, profile.name);
      if (!result) return redirect("/signin?error=google", clear);
      await welcomeNewUser(result, url);
      return redirect(safeNext(saved.next), [...clear, sessionCookie(signSession({ uid: result.uid }, secret))]);
    } catch (e) {
      console.error("google sign-in failed:", errTag(e));
      return redirect("/signin?error=google", clear);
    }
  });

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

  // "Sign out everywhere": every cookie issued before now stops working, including this one.
  addRoute("POST", "/api/auth/logout-all", async (request) => {
    if (!isJson(request)) return error(415, "content-type must be application/json");
    const session = sessionFromRequest(request);
    const user = session ? await findUser(session.uid, session.iat) : null;
    if (!user) return error(401, "not signed in");
    await revokeSessions(user.uid);
    return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
  });

  // Account deletion. The body must say {"confirm":"delete"} so a stray request cannot do it.
  addRoute("DELETE", "/api/me", async (request) => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    if (body.confirm !== "delete") return error(400, "confirm with {\"confirm\":\"delete\"}");
    const session = sessionFromRequest(request);
    const user = session ? await findUser(session.uid, session.iat) : null;
    if (!user) return error(401, "not signed in");
    await deleteAccount(user.uid);
    return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
  });

  // Unsubscribe link in our emails. GET only forwards to the confirm page (mail scanners prefetch links);
  // POST deletes the account, because unsubscribing from HackRadar means leaving it.
  addRoute("GET", "/api/auth/unsubscribe", (_request, _params, url) =>
    redirect(`/unsubscribe?token=${encodeURIComponent(url.searchParams.get("token") ?? "")}`),
  );

  addRoute("POST", "/api/auth/unsubscribe", async (request) => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    try {
      const uid = readUnsubscribeToken(body.token);
      if (uid === null) return error(400, "this link is not valid");
      await deleteAccount(uid);
    } catch (e) {
      console.error("unsubscribe failed:", errTag(e));
      return error(500, "could not unsubscribe");
    }
    return json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
  });

  // The name shown in the app and in messages. The email link has no name to start with, so we ask for one.
  addRoute("PUT", "/api/me/name", async (request) => {
    const body = await readBody(request);
    if (body instanceof Response) return body;
    const session = sessionFromRequest(request);
    const user = session ? await findUser(session.uid, session.iat) : null;
    if (!user) return error(401, "not signed in");
    const name = cleanDisplayName(body.name);
    if (!name) return error(400, "enter your name");
    await setDisplayName(user.uid, name);
    return json({ ok: true, name });
  });

  addRoute("GET", "/api/me", async (request) => {
    const session = sessionFromRequest(request);
    const user = session ? await findUser(session.uid, session.iat) : null;
    if (!user) return error(401, "not signed in");
    return json(user);
  });
}
