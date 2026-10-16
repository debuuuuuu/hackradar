import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { fetchEvents, fetchPlaces, type EventRow, type Place } from "../lib/api.js";
import { formatIst, sourceLabel } from "../lib/format.js";

const PAGE = 20;
const RADII = [50, 100, 150, 300, 500];

export default function Events({
  heading = "Hackathons, found for you",
  defaults = { place: "", radius: 150 },
}: {
  heading?: string;
  defaults?: { place: string; radius: number };
}) {
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const kind = sp.get("kind") ?? "";
  const rawPlace = sp.get("place") ?? defaults.place;
  const place = rawPlace === "none" ? "" : rawPlace; // "none" = the person turned Near me off
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

  /** Change filters; any change except paging goes back to page one. */
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

  return (
    <>
      <h1>{heading}</h1>
      <p className="lead">Open hackathons and contests from public listings. Dates come from the source.</p>

      <form
        className="filters"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: draft.trim() });
        }}
      >
        <label className="field grow">
          <span>Search</span>
          <input type="search" value={draft} maxLength={100} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <label className="field">
          <span>Type</span>
          <select value={kind} onChange={(e) => update({ kind: e.target.value })}>
            <option value="">All types</option>
            <option value="hackathon">Hackathons</option>
            <option value="contest">Contests</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="field">
          <span>Near me</span>
          <select value={place || "none"} onChange={(e) => update({ place: e.target.value })}>
            <option value="none">Off</option>
            {places.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {place && (
          <label className="field">
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
        <button type="submit" className="btn primary">
          Search
        </button>
      </form>

      <p className="count" aria-live="polite">
        {failed ? "" : data ? (total === 0 ? "No events match." : `Showing ${from} to ${to} of ${total}`) : "Loading"}
      </p>
      {failed && <p role="alert">Could not load events. Please try again.</p>}

      {data && data.items.length > 0 && (
        <ul className="events">
          {data.items.map((e) => (
            <li key={e.id}>
              <h2>
                <Link to={`/events/${e.id}`}>{e.title}</Link>
              </h2>
              <p className="meta">
                {e.kind && <span className="tag">{e.kind}</span>}
                {e.regDeadline && <span>Registration closes {formatIst(e.regDeadline)}</span>}
                {(e.city || e.mode) && (
                  <span>{[e.city, e.mode === "offline" ? "in person" : e.mode].filter(Boolean).join(", ")}</span>
                )}
                {e.sources.map((s) => (
                  <span className="tag" key={s}>
                    {sourceLabel(s)}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ul>
      )}

      {data && total > PAGE && (
        <nav className="pager" aria-label="Pages">
          <button
            type="button"
            className="btn"
            disabled={offset === 0}
            onClick={() => update({ offset: String(Math.max(0, offset - PAGE)) })}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn"
            disabled={offset + PAGE >= total}
            onClick={() => update({ offset: String(offset + PAGE) })}
          >
            Next
          </button>
        </nav>
      )}
    </>
  );
}
