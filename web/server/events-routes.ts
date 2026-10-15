import { getEvent, getPlace, listEvents, listPlaces, type EventFilter, type Kind } from "./events.js";
import { addRoute, error, json } from "./http.js";

const CACHE = { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" };
const KINDS: Kind[] = ["hackathon", "contest", "other"];

/** Parse a strict base-10 integer within [min, max]; undefined input yields the default. */
function intParam(raw: string | null, def: number, min: number, max: number): number | null {
  if (raw === null) return def;
  if (!/^\d{1,9}$/.test(raw) && !/^-\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= min && n <= max ? n : null;
}

export function registerEventRoutes(): void {
  addRoute("GET", "/api/events", async (_req, _params, url) => {
    const sp = url.searchParams;
    const q = sp.get("q")?.trim() ?? "";
    if (q.length > 100) return error(400, "q too long");
    const kind = sp.get("kind");
    if (kind !== null && !KINDS.includes(kind as Kind)) return error(400, "invalid kind");
    const limit = intParam(sp.get("limit"), 20, 1, 50);
    const offset = intParam(sp.get("offset"), 0, 0, 1_000_000);
    const radius = intParam(sp.get("radius"), 150, 1, 3000);
    if (limit === null || offset === null || radius === null) return error(400, "invalid number parameter");
    const filter: EventFilter = { limit, offset };
    if (q) filter.q = q;
    if (kind) filter.kind = kind as Kind;
    const place = sp.get("place");
    if (place) {
      const at = await getPlace(place);
      if (!at) return error(400, "unknown place");
      filter.near = { ...at, radiusKm: radius };
      filter.includeOnline = true;
    }
    return json(await listEvents(filter), { headers: CACHE });
  });

  addRoute("GET", "/api/events/:id", async (_req, params) => {
    if (!/^\d{1,15}$/.test(params.id)) return error(404, "not found");
    const event = await getEvent(Number(params.id));
    return event ? json(event, { headers: CACHE }) : error(404, "not found");
  });

  addRoute("GET", "/api/places", async () => json(await listPlaces(), { headers: CACHE }));
}
