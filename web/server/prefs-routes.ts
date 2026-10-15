import { findUser, sessionFromRequest } from "./auth.js";
import { decrypt, keyFromEnv } from "./crypto.js";
import { query } from "./db.js";
import { isDiscordWebhook } from "./discord-webhook.js";
import { addRoute, error, json } from "./http.js";
import { getPrefs, savePrefs, validateContact, validatePrefs, ValidationError } from "./prefs.js";

const MAX_BODY_BYTES = 8192;

const isJson = (request: Request): boolean =>
  (request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json");

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

/** The signed-in user's id from the session cookie only (never from the client), or null. */
async function sessionUid(request: Request): Promise<number | null> {
  const session = sessionFromRequest(request);
  const user = session ? await findUser(session.uid) : null;
  return user ? user.uid : null;
}

export function registerPrefsRoutes(): void {
  addRoute("GET", "/api/me/prefs", async (request) => {
    const uid = await sessionUid(request);
    const found = uid === null ? null : await getPrefs(uid);
    if (!found) return error(401, "not signed in");
    const { contact, ...prefs } = found;
    return json({ prefs, contact });
  });

  addRoute("PUT", "/api/me/prefs", async (request) => {
    const uid = await sessionUid(request);
    if (uid === null) return error(401, "not signed in");
    const body = await readBody(request);
    if (body instanceof Response) return body;
    try {
      const prefs = await validatePrefs(body.prefs);
      const contact = validateContact(body.contact);
      await savePrefs(uid, prefs, contact);
    } catch (e) {
      if (e instanceof ValidationError) return json({ error: e.message, field: e.field }, { status: 400 });
      throw e;
    }
    return json({ ok: true });
  });

  // Sends one harmless message to the caller's own saved webhook. The URL and any error text that could
  // contain it stay server-side: responses carry only a generic reason, and nothing is logged.
  addRoute("POST", "/api/me/prefs/test-discord", async (request) => {
    const uid = await sessionUid(request);
    if (uid === null) return error(401, "not signed in");
    if (!isJson(request)) return error(415, "content-type must be application/json");
    const fail = (reason: string) => json({ ok: false, reason });

    const rows = await query<{ enc: string | null }>("SELECT discord_webhook_enc AS enc FROM users WHERE id = $1", [uid]);
    if (!rows[0]?.enc) return fail("No webhook is saved yet.");
    let url: string;
    try {
      url = decrypt(rows[0].enc, keyFromEnv());
    } catch {
      return fail("The saved webhook could not be read. Paste it again and save.");
    }
    if (!isDiscordWebhook(url)) return fail("The saved webhook is not a valid Discord webhook. Paste it again and save.");

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "HackRadar test message. If you see this, your webhook works." }),
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return json({ ok: true });
      return fail("Discord did not accept the message. Check that the webhook still exists.");
    } catch {
      return fail("Could not reach Discord. Try again in a moment.");
    }
  });
}
