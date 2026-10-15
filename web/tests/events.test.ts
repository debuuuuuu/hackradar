import { describe, expect, it } from "vitest";
import handler from "../api/index.js";
import { query } from "../server/db.js";
import { getEvent, listEvents, listPlaces } from "../server/events.js";
import { dbIt, withSchema } from "./helpers.js";

async function addEvent(
  title: string,
  o: { kind?: string; mode?: string | null; lat?: number | null; lon?: number | null; status?: string; days?: number } = {},
): Promise<number> {
  const rows = await query<{ id: number }>(
    `INSERT INTO events (title, kind, mode, lat, lon, status, reg_deadline)
     VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' days')::interval) RETURNING id`,
    [title, o.kind ?? "hackathon", o.mode === undefined ? "offline" : o.mode, o.lat ?? null, o.lon ?? null, o.status ?? "open", String(o.days ?? 10)],
  );
  return rows[0].id;
}

const base = { limit: 20, offset: 0 };
const titles = (r: { items: { title: string }[] }) => r.items.map((i) => i.title);

describe("events", () => {
  dbIt("q matches title case-insensitively and escapes wildcards", () =>
    withSchema(async () => {
      await addEvent("Hack On Hills");
      await addEvent("Other 100% thing");
      await addEvent("Other 100x thing");
      expect(titles(await listEvents({ ...base, q: "hills" }))).toEqual(["Hack On Hills"]);
      expect(titles(await listEvents({ ...base, q: "100%" }))).toEqual(["Other 100% thing"]);
    }),
  );

  dbIt("kind filter, closed events hidden, total ignores limit, ordered by deadline", () =>
    withSchema(async () => {
      await addEvent("B late", { days: 20 });
      await addEvent("A soon", { days: 2 });
      await addEvent("C contest", { kind: "contest", days: 5 });
      await addEvent("Closed", { status: "closed" });
      expect(titles(await listEvents({ ...base, kind: "contest" }))).toEqual(["C contest"]);
      const r = await listEvents({ ...base, limit: 1 });
      expect(r.total).toBe(3);
      expect(titles(r)).toEqual(["A soon"]);
      expect(titles(await listEvents({ ...base, offset: 1, limit: 1 }))).toEqual(["C contest"]);
    }),
  );

  dbIt("near keeps Karjat, drops Delhi and coordinate-less in-person; includeOnline keeps online/unknown", () =>
    withSchema(async () => {
      await addEvent("Karjat", { lat: 18.91, lon: 73.32 });
      await addEvent("Delhi", { lat: 28.61, lon: 77.21 });
      await addEvent("Nowhere", { lat: null, lon: null });
      await addEvent("Online", { mode: "online" });
      await addEvent("Unknown", { mode: null });
      const near = { lat: 18.5204, lon: 73.8567, radiusKm: 150 };
      expect(titles(await listEvents({ ...base, near }))).toEqual(["Karjat"]);
      const inc = await listEvents({ ...base, near, includeOnline: true });
      expect(titles(inc).sort()).toEqual(["Karjat", "Online", "Unknown"]);
      expect(inc.total).toBe(3);
      expect((await listEvents(base)).total).toBe(5);
    }),
  );

  dbIt("getEvent returns sources with urls; null when missing", () =>
    withSchema(async () => {
      const id = await addEvent("Has sources");
      await query(
        `INSERT INTO event_sources (event_id, source, source_id, url, content_hash)
         VALUES ($1,'devfolio','a','https://d.test/a','h'), ($1,'unstop','b','https://u.test/b','h')`,
        [id],
      );
      const e = await getEvent(id);
      expect(e?.sources.map((s) => s.source).sort()).toEqual(["devfolio", "unstop"]);
      expect(e?.sources[0].url).toMatch(/^https:/);
      expect(await getEvent(id + 999)).toBeNull();
      expect((await listEvents(base)).items[0].sources.sort()).toEqual(["devfolio", "unstop"]);
    }),
  );

  dbIt("places and the HTTP routes", () =>
    withSchema(async () => {
      await query("INSERT INTO places (key, name, lat, lon) VALUES ('pune','Pune',18.5204,73.8567)");
      const karjat = await addEvent("Karjat", { lat: 18.91, lon: 73.32 });
      await addEvent("Delhi", { lat: 28.61, lon: 77.21 });
      expect(await listPlaces()).toEqual([{ key: "pune", name: "Pune" }]);
      const get = (p: string) => handler.fetch(new Request(`https://x.test${p}`));
      const ok = await get("/api/events?place=pune&radius=150");
      expect(ok.status).toBe(200);
      expect(ok.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
      const body = (await ok.json()) as { items: { title: string; regDeadline: string }[]; total: number };
      expect(body.items.map((i) => i.title)).toEqual(["Karjat"]);
      expect(typeof body.items[0].regDeadline).toBe("string");
      const bads = ["kind=nope", "place=atlantis", "limit=0", "limit=51", "offset=-1", "radius=0", "radius=3001", `q=${"a".repeat(101)}`];
      for (const bad of bads) expect((await get(`/api/events?${bad}`)).status, bad).toBe(400);
      expect((await get("/api/events/abc")).status).toBe(404);
      expect((await get("/api/events/99999")).status).toBe(404);
      const d = await get(`/api/events/${karjat}`);
      expect(d.status).toBe(200);
      expect(d.headers.get("cache-control")).toContain("s-maxage=300");
      expect((await get("/api/places")).headers.get("cache-control")).toContain("s-maxage=300");
    }),
  );
});
