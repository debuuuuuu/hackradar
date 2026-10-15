import { findUser, sessionFromRequest } from "./auth.js";
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
}
