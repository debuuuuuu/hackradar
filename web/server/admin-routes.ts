import { findUser, sessionFromRequest } from "./auth.js";
import { addRoute, error, json } from "./http.js";
import { adminStats } from "./stats.js";

export function registerAdminRoutes(): void {
  addRoute("GET", "/api/admin/stats", async (request) => {
    const session = sessionFromRequest(request);
    // findUser reads is_admin from the database row on every call, never from the cookie.
    const user = session ? await findUser(session.uid) : null;
    if (!user) return error(401, "not signed in");
    if (!user.isAdmin) return error(403, "forbidden");
    return json(await adminStats(), { headers: { "cache-control": "no-store" } });
  });
}
