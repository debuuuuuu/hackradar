import { findUser, sessionFromRequest } from "./auth.js";
import { addRoute, error, json } from "./http.js";
import { calFeed, calToken, deleteSave, listSaves, SavePatch, StatusError, updateSave, upsertSave } from "./saves.js";

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
  const user = session ? await findUser(session.uid, session.iat) : null;
  return user ? user.uid : null;
}

export function registerSavesRoutes(): void {
  // GET /api/me/events — list all saved events
  addRoute("GET", "/api/me/events", async (request) => {
    const uid = await sessionUid(request);
    if (uid === null) return error(401, "not signed in");
    const items = await listSaves(uid);
    return json({ items });
  });

  // POST /api/me/events/:id — save an event (idempotent)
  addRoute("POST", "/api/me/events/:id", async (request, params) => {
    const uid = await sessionUid(request);
    if (uid === null) return error(401, "not signed in");
    const eid = /^\d{1,18}$/.test(params.id) ? Number(params.id) : null;
    if (eid === null) return error(404, "not found");
    const status = await upsertSave(uid, eid);
    return json({ status });
  });

  // PATCH /api/me/events/:id — update status / won / project_url
  addRoute("PATCH", "/api/me/events/:id", async (request, params) => {
    const uid = await sessionUid(request);
    if (uid === null) return error(401, "not signed in");
    const eid = /^\d{1,18}$/.test(params.id) ? Number(params.id) : null;
    if (eid === null) return error(404, "not found");
    const body = await readBody(request);
    if (body instanceof Response) return body;

    const patch: SavePatch = {};
    if ("status" in body && typeof body.status === "string") patch.status = body.status;
    if ("won" in body && typeof body.won === "boolean") patch.won = body.won;
    if ("project_url" in body) patch.project_url = body.project_url === null ? null : String(body.project_url);

    try {
      const status = await updateSave(uid, eid, patch);
      if (status === null) return error(404, "not found");
      return json({ status });
    } catch (e) {
      if (e instanceof StatusError) return error(400, e.message);
      throw e;
    }
  });

  // DELETE /api/me/events/:id — remove a saved event
  addRoute("DELETE", "/api/me/events/:id", async (request, params) => {
    const uid = await sessionUid(request);
    if (uid === null) return error(401, "not signed in");
    const eid = /^\d{1,18}$/.test(params.id) ? Number(params.id) : null;
    if (eid === null) return error(404, "not found");
    if (!(await deleteSave(uid, eid))) return error(404, "not found");
    return json({ ok: true });
  });

  // GET /api/me/calendar-token — returns the cal token and URL (auth required)
  addRoute("GET", "/api/me/calendar-token", async (request) => {
    const uid = await sessionUid(request);
    if (uid === null) return error(401, "not signed in");
    const token = calToken(uid);
    const url = `/api/me/calendar.ics?token=${token}&user=${uid}`;
    return json({ token, url });
  });

  // GET /api/me/calendar.ics?token=<hex>&user=<uid> — public, token-gated ICS feed
  addRoute("GET", "/api/me/calendar.ics", async (_request, _params, parsedUrl) => {
    const token = parsedUrl.searchParams.get("token");
    const userParam = parsedUrl.searchParams.get("user");
    if (!token || !userParam || !/^\d{1,18}$/.test(userParam)) {
      return error(401, "invalid token");
    }
    const uid = Number(userParam);
    let expected: string;
    try {
      expected = calToken(uid);
    } catch {
      return error(500, "calendar feed not configured");
    }
    if (token !== expected) return error(401, "invalid token");
    const ics = await calFeed(uid);
    return new Response(ics, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "cache-control": "private, no-store",
      },
    });
  });
}
