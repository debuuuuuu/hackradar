import { useEffect, useState } from "react";
import { Link } from "react-router";
import Icon from "../components/Icon.js";
import Monitor from "../components/Monitor.js";
import { fetchEvents, type EventRow } from "../lib/api.js";
import { formatIstDate, sourceLabel } from "../lib/format.js";
import type { PrefsResponse } from "../lib/prefsForm.js";

interface TodayProps {
  name: string;
}

interface TagItem {
  kind: "topic" | "near" | "online" | "multi" | "soon" | "more";
  label: string;
  iconName: "bulb" | "pin" | "wifi" | "sparkle" | "clock";
}

export default function Today({ name }: TodayProps) {
  const firstName = name ? name.split(" ")[0] : "Builder";
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<PrefsResponse["prefs"] | null>(null);

  // View state
  const [showMoreTops, setShowMoreTops] = useState(false);
  const [showAllList, setShowAllList] = useState(false);
  const [sortOrder, setSortOrder] = useState<"soon" | "near">("soon");
  const [searchFilter, setSearchFilter] = useState("");

  useEffect(() => {
    let live = true;
    // Same rule as before the redesign: filter by home city and distance unless the person wants online-only or all India.
    fetch("/api/me/prefs", { headers: { accept: "application/json" } })
      .then((res) => (res.ok ? (res.json() as Promise<PrefsResponse>) : null))
      .catch(() => null)
      .then((data) => {
        const p = data?.prefs ?? null;
        if (live && p) setPrefs(p);
        const near = p && p.format !== "online" && p.radiusKm < 3000 && p.homeCity;
        return fetchEvents({ limit: 40, place: near ? p.homeCity : "", radius: near ? p.radiusKm : undefined });
      })
      .then((res) => {
        if (!live) return;
        setEvents(res.items);
        setLoading(false);
      })
      .catch(() => {
        if (live) setLoading(false);
      });

    return () => {
      live = false;
    };
  }, []);

  // Filter events by search
  const filteredEvents = searchFilter.trim()
    ? events.filter(
        (e) =>
          e.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
          (e.city && e.city.toLowerCase().includes(searchFilter.toLowerCase())) ||
          (e.kind && e.kind.toLowerCase().includes(searchFilter.toLowerCase())),
      )
    : events;

  // Derive tags purely from real API data
  const getEventTags = (e: EventRow): TagItem[] => {
    const tags: TagItem[] = [];

    // Topic tag if available
    if (e.kind) {
      tags.push({ kind: "topic", label: e.kind, iconName: "bulb" });
    }

    // Near / Location tag
    if (e.city) {
      tags.push({ kind: "near", label: e.city, iconName: "pin" });
    }

    // Online tag
    if (e.mode === "online") {
      tags.push({ kind: "online", label: "online", iconName: "wifi" });
    }

    // Multi-site tag
    if (e.sources.length > 1) {
      tags.push({ kind: "multi", label: `on ${e.sources.length} sites`, iconName: "sparkle" });
    }

    // Closes soon check (within 7 days)
    if (e.regDeadline) {
      const msDiff = new Date(e.regDeadline).getTime() - Date.now();
      const days = Math.ceil(msDiff / (1000 * 60 * 60 * 24));
      if (days >= 0 && days <= 7) {
        tags.push({
          kind: "soon",
          label: days === 0 ? "closes today" : `closes in ${days}d`,
          iconName: "clock",
        });
      }
    }

    return tags;
  };

  const formatTags = (tags: TagItem[]): { shown: TagItem[]; extraCount: number } => {
    if (tags.length <= 3) return { shown: tags, extraCount: 0 };
    return {
      shown: tags.slice(0, 2),
      extraCount: tags.length - 2,
    };
  };

  // Top picks: first 6, initially showing 3
  const topEvents = filteredEvents.slice(0, 6);
  const visibleTops = showMoreTops ? topEvents : topEvents.slice(0, 3);

  // Remaining events for "Also open near you"
  const remainingEvents = filteredEvents.slice(topEvents.length);

  // Grouping remaining events
  const now = Date.now();
  const getDaysLeft = (e: EventRow) => {
    if (!e.regDeadline) return 999;
    return Math.ceil((new Date(e.regDeadline).getTime() - now) / (1000 * 60 * 60 * 24));
  };

  const sortedRemaining = [...remainingEvents].sort((a, b) => {
    if (sortOrder === "soon") {
      return getDaysLeft(a) - getDaysLeft(b);
    }
    // "near": prioritize city matching user's homeCity
    const aCityMatch = prefs?.homeCity && a.city?.toLowerCase().includes(prefs.homeCity.toLowerCase());
    const bCityMatch = prefs?.homeCity && b.city?.toLowerCase().includes(prefs.homeCity.toLowerCase());
    if (aCityMatch && !bCityMatch) return -1;
    if (!aCityMatch && bCityMatch) return 1;
    return 0;
  });

  const visibleList = showAllList ? sortedRemaining : sortedRemaining.slice(0, 5);

  const groups =
    sortOrder === "near"
      ? [{ label: "Nearest first", items: visibleList, count: sortedRemaining.length }]
      : [
          {
            label: "Closing this week",
            items: visibleList.filter((e) => getDaysLeft(e) <= 7),
            count: sortedRemaining.filter((e) => getDaysLeft(e) <= 7).length,
          },
          {
            label: "This month",
            items: visibleList.filter((e) => getDaysLeft(e) > 7 && getDaysLeft(e) <= 31),
            count: sortedRemaining.filter((e) => getDaysLeft(e) > 7 && getDaysLeft(e) <= 31).length,
          },
          {
            label: "Later",
            items: visibleList.filter((e) => getDaysLeft(e) > 31),
            count: sortedRemaining.filter((e) => getDaysLeft(e) > 31).length,
          },
        ].filter((g) => g.count > 0);

  const rotations = ["-2deg", "1.6deg", "-1deg", "1.2deg", "-1.4deg", "2.1deg"];
  const posterStyles = ["poster", "poster dark", "poster paper"];

  return (
    <div className="page" style={{ maxWidth: 1120, margin: "0 auto 96px" }}>
      {/* Hello Header */}
      <header
        className="hello fade-in"
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 24,
          alignItems: "end",
          margin: "8px 0 28px",
        }}
      >
        <div>
          <h1 className="h1" style={{ color: "var(--chalk)", margin: "0 0 8px" }}>
            Morning, {firstName}.
          </h1>
          <p style={{ font: "24px/1.3 var(--hand)", color: "var(--coral-text)", margin: 0 }}>
            {topEvents.length > 0
              ? `${topEvents.length} top picks matched your filters today.`
              : "Checking for new hackathons every morning around 5 AM IST."}
          </p>
        </div>
        <Monitor size={120} mood="happy" />
      </header>

      {/* Filter / Search Bar */}
      <div
        className="bar"
        role="search"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px 16px",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--cream)",
          color: "var(--ink)",
          borderRadius: 18,
          padding: "12px 14px",
          marginBottom: 36,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="chip on">For you</span>
          <Link to="/events" className="chip">
            Everything open
          </Link>
          <Link to="/my-events" className="chip">
            Saved
          </Link>
        </div>
        <label className="field" style={{ gridAutoFlow: "column", alignItems: "center", margin: 0 }}>
          <span className="sr">Search events</span>
          <input
            type="search"
            placeholder="Search by name, topic or city"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            style={{ minWidth: 240 }}
          />
        </label>
      </div>

      {/* User Picks Summary Line */}
      {prefs && (
        <p
          className="picks-line"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            alignItems: "center",
            font: "500 13px var(--mono)",
            color: "var(--mute)",
            margin: "-16px 0 48px",
          }}
        >
          Picked for{" "}
          <span style={{ border: "1.5px solid var(--line-dark)", borderRadius: 999, padding: "4px 10px", color: "var(--chalk)" }}>
            {prefs.homeCity} · {prefs.radiusKm >= 3000 ? "All India" : `${prefs.radiusKm} km`}
          </span>
          <span style={{ border: "1.5px solid var(--line-dark)", borderRadius: 999, padding: "4px 10px", color: "var(--chalk)" }}>
            Hackathons: {prefs.priorities.hackathon}
          </span>
          {prefs.topics.slice(0, 2).map((t) => (
            <span key={t} style={{ border: "1.5px solid var(--line-dark)", borderRadius: 999, padding: "4px 10px", color: "var(--chalk)" }}>
              {t}
            </span>
          ))}
          <Link to="/settings" style={{ color: "var(--coral-text)", minHeight: 44, display: "inline-flex", alignItems: "center", paddingInline: 6 }}>
            edit
          </Link>
        </p>
      )}

      {/* TOP PICKS GRID */}
      <section aria-labelledby="top-h">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "12px 24px", margin: "0 0 32px" }}>
          <h2 className="h2" id="top-h" style={{ color: "var(--chalk)" }}>
            Top picks for you
          </h2>
          <span className="note-hand">matched on topic and distance</span>
        </div>

        {loading ? (
          <p className="lead dark" style={{ textAlign: "center", padding: "40px 0" }}>Loading your picks...</p>
        ) : topEvents.length === 0 ? (
          <p className="lead dark" style={{ textAlign: "center", padding: "40px 0" }}>No picks match your current filters. Try tweaking them in Settings.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "40px 36px", marginBottom: 32 }}>
            {visibleTops.map((e, idx) => {
              const r = rotations[idx % rotations.length];
              const posterCls = posterStyles[idx % posterStyles.length];
              const { shown, extraCount } = formatTags(getEventTags(e));
              const primarySource = e.sources[0] ? sourceLabel(e.sources[0]) : "Listing";

              return (
                <article className="shot" key={e.id} style={{ "--r": r } as React.CSSProperties}>
                  <div className={posterCls}>
                    <span className="platform">{primarySource}</span>
                    <Icon name="code" size={32} />
                  </div>

                  {/* TODO(backend): saved events and reminders API */}
                  <button
                    type="button"
                    className="save-btn"
                    title="Saving events is coming soon"
                    disabled
                    style={{ opacity: 0.8 }}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path className="ln" d="M4 2h8v12l-4-3-4 3z" />
                    </svg>
                    Save
                  </button>

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

                    <div className="tags">
                      {shown.map((t) => (
                        <span className={`tg ${t.kind}`} key={t.label}>
                          <Icon name={t.iconName} size={15} />
                          {t.label}
                        </span>
                      ))}
                      {extraCount > 0 && <span className="tg more">+{extraCount}</span>}
                    </div>
                  </div>

                  <Link className="over" to={`/events/${e.id}`} aria-label={`Open ${e.title}`} />
                </article>
              );
            })}
          </div>
        )}

        {topEvents.length > 3 && (
          <div style={{ display: "flex", justifyContent: "center", margin: "0 0 96px" }}>
            <button type="button" className="btn chalk" onClick={() => setShowMoreTops((prev) => !prev)}>
              {showMoreTops ? "Show fewer picks" : `Show ${topEvents.length - 3} more picks`}
            </button>
          </div>
        )}
      </section>

      {/* SOCIAL FINDS SECTION (POLAROIDS) */}
      <section aria-labelledby="soc-h">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "12px 24px", margin: "0 0 32px" }}>
          <h2 className="h2" id="soc-h" style={{ color: "var(--chalk)" }}>
            Found in posts on LinkedIn and X
          </h2>
          <span className="note-hand">not on any listing site yet</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 40, marginBottom: 96 }}>
          <figure className="polaroid scroll" style={{ "--r": "-3deg", margin: 0 } as React.CSSProperties} tabIndex={0}>
            <div className="pic">
              <p className="who">public post on LinkedIn</p>
              <p>We're hosting a 36-hour campus hackathon on 29–30 Nov. Open to all colleges, team size 2–4.</p>
              <span style={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: "var(--coral-text)", fontWeight: 600, fontSize: 14, marginTop: 10 }}>
                Check source post
              </span>
              <svg className="scribble" viewBox="0 0 300 170" preserveAspectRatio="none" aria-hidden="true">
                <path className="ln" d="M20 60C10 20 140 6 250 22c40 6 44 52 4 70-50 22-200 22-226-6C8 66 50 40 120 36" />
              </svg>
            </div>
            <figcaption className="sig">unverified · check the post</figcaption>
          </figure>

          <figure className="polaroid scroll" style={{ "--r": "2.5deg", margin: 0 } as React.CSSProperties} tabIndex={0}>
            <div className="pic">
              <p className="who">@pune_builders · public post on X</p>
              <p>Registrations open for our 24-hour build night on 22 Nov. Beginners welcome. Link in thread.</p>
              <span style={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: "var(--coral-text)", fontWeight: 600, fontSize: 14, marginTop: 10 }}>
                Check source post
              </span>
              <svg className="scribble" viewBox="0 0 300 170" preserveAspectRatio="none" aria-hidden="true">
                <path className="ln" d="M20 60C10 20 140 6 250 22c40 6 44 52 4 70-50 22-200 22-226-6C8 66 50 40 120 36" />
              </svg>
            </div>
            <figcaption className="sig">unverified · check the post</figcaption>
          </figure>

          <p className="note-hand" style={{ alignSelf: "center", maxWidth: 280 }}>
            Dates here come from the post itself. We always link to it.
          </p>
        </div>
      </section>

      {/* ALSO OPEN NEAR YOU SECTION */}
      {remainingEvents.length > 0 && (
        <section aria-labelledby="all-h">
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "12px 24px", margin: "0 0 24px" }}>
            <h2 className="h2" id="all-h" style={{ color: "var(--chalk)" }}>
              Also open near you · {sortedRemaining.length}
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="group" aria-label="Sort the list">
              <button
                type="button"
                className={`chip ${sortOrder === "soon" ? "on" : ""}`}
                style={{ borderColor: "var(--chalk)", color: sortOrder === "soon" ? "var(--charcoal)" : "var(--chalk)" }}
                aria-pressed={sortOrder === "soon"}
                onClick={() => setSortOrder("soon")}
              >
                Closing soon
              </button>
              <button
                type="button"
                className={`chip ${sortOrder === "near" ? "on" : ""}`}
                style={{ borderColor: "var(--chalk)", color: sortOrder === "near" ? "var(--charcoal)" : "var(--chalk)" }}
                aria-pressed={sortOrder === "near"}
                onClick={() => setSortOrder("near")}
              >
                Nearest
              </button>
            </div>
          </div>

          <div className="list" style={{ background: "var(--cream)", color: "var(--ink)", borderRadius: 22, padding: "8px 28px 16px", margin: "0 0 24px" }}>
            {groups.map((g) => (
              <div key={g.label}>
                <p style={{ margin: 0, padding: "18px 0 6px", font: "23px var(--hand)", color: "var(--coral-deep)", display: "flex", alignItems: "center", gap: 8 }}>
                  {g.label}
                  <span style={{ font: "500 12px var(--mono)", background: "var(--ink)", color: "var(--cream)", borderRadius: 999, padding: "2px 8px" }}>
                    {g.count}
                  </span>
                </p>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {g.items.map((r) => {
                    const primarySource = r.sources[0] ? sourceLabel(r.sources[0]) : "Listing";
                    return (
                      <li
                        key={r.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "100px minmax(0, 1fr) 140px 160px",
                          gap: "6px 20px",
                          alignItems: "center",
                          padding: "14px 0",
                          borderBottom: "1.5px dashed color-mix(in oklch, var(--ink-red) 35%, transparent)",
                          position: "relative",
                        }}
                      >
                        <span
                          style={{
                            justifySelf: "start",
                            font: "500 11px var(--mono)",
                            textTransform: "uppercase",
                            color: "var(--ink-red)",
                            border: "1.5px solid var(--ink-red)",
                            borderRadius: 5,
                            padding: "2px 7px",
                          }}
                        >
                          {primarySource}
                        </span>
                        <b style={{ font: "400 19px var(--serif)" }}>{r.title}</b>
                        <span style={{ font: "500 13px var(--mono)", color: "#7a4b47" }}>
                          {r.regDeadline ? `reg by ${formatIstDate(r.regDeadline)}` : "Open"}
                        </span>
                        <span style={{ fontSize: 14, color: "var(--ink-soft)" }}>
                          {[r.city, r.mode === "offline" ? "in person" : r.mode].filter(Boolean).join(", ") || "Online"}
                        </span>
                        <Link className="over" to={`/events/${r.id}`} aria-label={`Open ${r.title}`} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          {sortedRemaining.length > 5 && (
            <div style={{ display: "flex", justifyContent: "center", margin: "0 0 48px" }}>
              <button type="button" className="btn chalk" onClick={() => setShowAllList((prev) => !prev)}>
                {showAllList ? "Show fewer" : `Show ${sortedRemaining.length - 5} more`}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
