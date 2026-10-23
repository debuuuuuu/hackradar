import { findUser, sessionFromRequest } from "./auth.js";
import { addRoute, json } from "./http.js";
import { fetchLeaderboard } from "./leaderboard.js";

export function registerLeaderboardRoutes(): void {
  // GET /api/leaderboard
  addRoute("GET", "/api/leaderboard", async (request, _params, parsedUrl) => {
    const sp = parsedUrl.searchParams;

    const period = sp.get("period") ?? "all";
    const theme = sp.get("theme") ?? undefined;
    const city = sp.get("city") ?? undefined;

    const limitRaw = sp.get("limit");
    const offsetRaw = sp.get("offset");
    const limit = limitRaw !== null ? Math.min(Math.max(1, Number(limitRaw) || 50), 100) : 50;
    const offset = offsetRaw !== null ? Math.max(0, Number(offsetRaw) || 0) : 0;

    // Resolve caller uid (optional — leaderboard is public)
    const session = sessionFromRequest(request);
    let callerUid: number | null = null;
    if (session) {
      const user = await findUser(session.uid, session.iat);
      if (user) callerUid = user.uid;
    }

    const result = await fetchLeaderboard({
      period,
      theme,
      city,
      limit,
      offset,
      callerUid,
    });

    return json(result);
  });
}
