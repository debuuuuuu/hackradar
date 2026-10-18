import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import Icon from "../components/Icon.js";
import { fetchEvents, fetchPlaces, type EventRow, type Place } from "../lib/api.js";
import { formatIstDate, sourceLabel } from "../lib/format.js";

const PAGE = 18;
const RADII = [50, 100, 150, 300, 500];

export default function Events({
  heading = "Open hackathons right now",
  defaults = { place: "", radius: 150 },
}: {
  heading?: string;
  defaults?: { place: string; radius: number };
}) {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const kind = sp.get("kind") ?? "";
  const rawPlace = sp.get("place") ?? defaults.place;
  const place = rawPlace === "none" ? "" : rawPlace;
  const radius = Number(sp.get("radius")) || defaults.radius;
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const [places, setPlaces] = useState<Place[]>([]);
  const [data, setData] = useState<{ items: EventRow[]; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState(q);

  useEffect(() => {
    fetchPlaces().then(setPlaces, () => setPlaces([]));
  }, []);

  useEffect(() => {
    let live = true;
    setData(null);
    setFailed(false);
    fetchEvents({ q, kind, place, radius: place ? radius : undefined, limit: PAGE, offset }).then(
      (d) => live && setData(d),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [q, kind, place, radius, offset]);

  function update(next: Record<string, string>) {
    const out = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(next)) {
      if (v) out.set(k, v);
      else out.delete(k);
    }
    if (!("offset" in next)) out.delete("offset");
    setSp(out);
  }

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);

  const rotations = ["-2deg", "1.5deg", "-1.2deg", "2deg", "-1.8deg", "1.4deg"];
  const posterStyles = ["poster", "poster dark", "poster paper"];

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto 96px" }}>
      <header style={{ marginBottom: 32 }}>
        <h1 className="h1" style={{ color: "var(--chalk)", marginBottom: 8 }}>
          {heading}
        </h1>
        <p className="lead dark" style={{ margin: 0 }}>
          Open hackathons and contests from public listings. Dates come straight from the source.
        </p>
      </header>

      {/* Filter bar */}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: draft.trim() });
        }}
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "flex-end",
          background: "var(--cream)",
          padding: "16px 20px",
          borderRadius: 20,
          marginBottom: 32,
          color: "var(--ink)",
        }}
      >
        <label className="field" style={{ flex: "1 1 240px", margin: 0 }}>
          <span>Search</span>
          <input
            type="search"
            value={draft}
            maxLength={100}
            placeholder="Search by name, topic..."
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>

        <label className="field" style={{ flex: "0 1 160px", margin: 0 }}>
          <span>Type</span>
          <select value={kind} onChange={(e) => update({ kind: e.target.value })}>
            <option value="">All types</option>
            <option value="hackathon">Hackathons</option>
            <option value="contest">Contests</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="field" style={{ flex: "0 1 160px", margin: 0 }}>
          <span>Near me</span>
          <select value={place || "none"} onChange={(e) => update({ place: e.target.value })}>
            <option value="none">Anywhere</option>
            {places.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {place && (
          <label className="field" style={{ flex: "0 1 130px", margin: 0 }}>
            <span>Within</span>
            <select value={radius} onChange={(e) => update({ radius: e.target.value })}>
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>
        )}

        <button type="submit" className="btn solid" style={{ alignSelf: "flex-end", height: 48 }}>
          <Icon name="search" size={16} variant="ink" />
          Search
        </button>
      </form>

      {/* Status counts */}
      <p style={{ font: "500 13px var(--mono)", color: "var(--mute)", margin: "0 0 24px" }} aria-live="polite">
        {failed
          ? ""
          : data
          ? total === 0
            ? "No events match."
            : `Showing ${from} to ${to} of ${total} hackathons`
          : "Loading events..."}
      </p>

      {failed && (
        <p className="notice" role="alert">
          Could not load events. Please try again.
        </p>
      )}

      {/* Events Grid */}
      {data && data.items.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: "40px 32px" }}>
          {data.items.map((e, idx) => {
            const r = rotations[idx % rotations.length];
            const posterCls = posterStyles[idx % posterStyles.length];
            const primarySource = e.sources[0] ? sourceLabel(e.sources[0]) : "Listing";

            return (
              <article className="shot" key={e.id} style={{ "--r": r } as React.CSSProperties}>
                <div className={posterCls}>
                  <span className="platform">{primarySource}</span>
                  <Icon name="code" size={32} />
                </div>

                <div className="shot-body">
                  <h3 className="shot-title">{e.title}</h3>
                  <dl className="facts">
                    <dt>When</dt>
                    <dd>{e.regDeadline ? `reg by ${formatIstDate(e.regDeadline)}` : "Open"}</dd>
                    <dt>Where</dt>
                    <dd>{[e.city, e.mode === "offline" ? "in person" : e.mode].filter(Boolean).join(" · ") || "Online"}</dd>
                    <dt>Prize</dt>
                    <dd>{e.prizeText || "Not listed"}</dd>
                  </dl>
                </div>

                {e.sources.length > 1 && (
                  <span className="stamp">
                    on {e.sources.length} sites
                  </span>
                )}

                <Link className="over" to={`/events/${e.id}`} aria-label={`Open ${e.title}`} />
              </article>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {data && total > PAGE && (
        <nav
          aria-label="Pages"
          style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 48 }}
        >
          <button
            type="button"
            className="btn chalk"
            disabled={offset === 0}
            onClick={() => update({ offset: String(Math.max(0, offset - PAGE)) })}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn chalk"
            disabled={offset + PAGE >= total}
            onClick={() => update({ offset: String(offset + PAGE) })}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
