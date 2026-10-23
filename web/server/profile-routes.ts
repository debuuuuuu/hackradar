import { findUser, sessionFromRequest } from "./auth.js";
import { error, addRoute, json } from "./http.js";
import { checkHandle, getOwnProfile, getPublicProfile, ProfileError, setProfile } from "./profile.js";

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

async function sessionUid(request: Request): Promise<number | null> {
  const session = sessionFromRequest(request);
  const user = session ? await findUser(session.uid, session.iat) : null;
  return user ? user.uid : null;
}

export function registerProfileRoutes(): void {
  // GET /api/profile/handle-check?q=<handle> — must be before /:handle
  addRoute("GET", "/api/profile/handle-check", async (_request, _params, parsedUrl) => {
    const q = parsedUrl.searchParams.get("q") ?? "";
    const result = await checkHandle(q);
    return json(result);
  });

  // GET /api/profile/:handle — public profile
  addRoute("GET", "/api/profile/:handle", async (request, params) => {
    const session = sessionFromRequest(request);
    const callerUid = session ? session.uid : undefined;
    try {
      const profile = await getPublicProfile(params.handle, callerUid);
      return json(profile);
    } catch (e) {
      if (e instanceof ProfileError) return error(e.status, e.message);
      throw e;
    }
  });

  // GET /api/me/profile — own profile (auth required)
  addRoute("GET", "/api/me/profile", async (request) => {
    const uid = await sessionUid(request);
    if (uid === null) return error(401, "not signed in");
    try {
      const profile = await getOwnProfile(uid);
      return json(profile);
    } catch (e) {
      if (e instanceof ProfileError) return error(e.status, e.message);
      throw e;
    }
  });

  // PATCH /api/me/profile — update handle, terms, profilePublic
  addRoute("PATCH", "/api/me/profile", async (request) => {
    const uid = await sessionUid(request);
    if (uid === null) return error(401, "not signed in");

    const body = await readBody(request);
    if (body instanceof Response) return body;

    const patch: { handle?: string; termsAccepted?: boolean; profilePublic?: boolean } = {};
    if ("handle" in body && typeof body.handle === "string") patch.handle = body.handle;
    if ("termsAccepted" in body && typeof body.termsAccepted === "boolean") patch.termsAccepted = body.termsAccepted;
    if ("profilePublic" in body && typeof body.profilePublic === "boolean") patch.profilePublic = body.profilePublic;

    try {
      const result = await setProfile(uid, patch);
      return json(result);
    } catch (e) {
      if (e instanceof ProfileError) return error(e.status, e.message);
      throw e;
    }
  });
}
