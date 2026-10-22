import { findUser, sessionFromRequest } from "./auth.js";
import { addRoute, error, json } from "./http.js";
import { getPicks } from "./picks.js";

export function registerPicksRoutes(): void {
  addRoute("GET", "/api/me/picks", async (request) => {
    const session = sessionFromRequest(request);
    const user = session ? await findUser(session.uid, session.iat) : null;
    if (!user) return error(401, "not signed in");
    return json({ picks: await getPicks(user.uid) });
  });
}
