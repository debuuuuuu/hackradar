import { useState } from "react";
import { Link } from "react-router";
import useSWR from "swr";
import Icon from "../components/Icon.js";
import RequireMe from "../components/RequireMe.js";
import { fetchMyEvents, updateEventStatus, unsaveEvent, type SavedEvent } from "../lib/api.js";
import { formatIstDate } from "../lib/format.js";

export default function MyEvents() {
  return (
    <RequireMe>
      {(me) => <MyEventsContent name={me.name} />}
    </RequireMe>
  );
}

function MyEventsContent({ name }: { name: string }) {
  const [tab, setTab] = useState<"up" | "went">("up");
  const { data, mutate } = useSWR("/api/me/events", fetchMyEvents);
  const items = data?.items ?? [];

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const upcoming = items.filter((e) => !e.startDate || e.startDate >= today);
  const past = items.filter((e) => e.startDate && e.startDate < today);

  return (
    <div className="page" style={{ maxWidth: 1120, margin: "0 auto 96px" }}>
      <header
        className="hello fade-in"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "16px 32px",
          margin: "8px 0 28px",
        }}
      >
        <div>
          <h1 className="h1" style={{ color: "var(--chalk)", margin: "0 0 8px" }}>
            Your events
          </h1>
          <p style={{ font: "24px/1.3 var(--hand)", color: "var(--coral-text)", margin: 0 }}>
            {name ? `Saved and attended events for ${name.split(" ")[0]}.` : "Saved and attended events."}
          </p>
        </div>
        <span className="note-hand">we remind you before things close</span>
      </header>

      {/* Tabs */}
      <div className="tabs" role="tablist" aria-label="My events" style={{ display: "flex", gap: 10, marginBottom: 40 }}>
        <button
          type="button"
          role="tab"
          className={`chip ${tab === "up" ? "on" : ""}`}
          style={{ borderColor: "var(--chalk)", color: tab === "up" ? "var(--charcoal)" : "var(--chalk)", fontSize: 15 }}
          aria-selected={tab === "up"}
          onClick={() => setTab("up")}
        >
          Coming up · {upcoming.length}
        </button>
        <button
          type="button"
          role="tab"
          className={`chip ${tab === "went" ? "on" : ""}`}
          style={{ borderColor: "var(--chalk)", color: tab === "went" ? "var(--charcoal)" : "var(--chalk)", fontSize: 15 }}
          aria-selected={tab === "went"}
          onClick={() => setTab("went")}
        >
          Went to · {past.length}
        </button>
      </div>

      {tab === "up" ? (
        <EventList events={upcoming} mutate={mutate} emptyMessage="Nothing saved yet — go find your next hack." />
      ) : (
        <EventList events={past} mutate={mutate} emptyMessage="No past events yet." />
      )}
    </div>
  );
}

function EventList({
  events,
  mutate,
  emptyMessage,
}: {
  events: SavedEvent[];
  mutate: () => Promise<unknown>;
  emptyMessage: string;
}) {
  if (events.length === 0) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", color: "var(--chalk)" }}>
        <Icon name="heart" size={40} variant="coral" />
        <p style={{ marginTop: 16, fontSize: 18 }}>{emptyMessage}</p>
        <Link className="btn solid" to="/" style={{ marginTop: 16, display: "inline-flex" }}>
          Browse today's picks
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {events.map((e) => (
        <EventCard key={e.eventId} event={e} mutate={mutate} />
      ))}
    </div>
  );
}

function EventCard({ event: e, mutate }: { event: SavedEvent; mutate: () => Promise<unknown> }) {
  const [askRegister, setAskRegister] = useState(false);
  const sourceUrl = e.sources[0]?.url;

  async function markRegistered() {
    await updateEventStatus(e.eventId, { status: "registered" });
    await mutate();
    setAskRegister(false);
  }

  async function remove() {
    try {
      await unsaveEvent(e.eventId);
    } catch {
      // 404 = already gone; fall through and refresh
    }
    await mutate();
  }

  return (
    <div
      className="card-paper"
      style={{
        padding: "20px 24px",
        borderRadius: 16,
        border: "1.5px solid var(--line-dark)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--chalk)", fontSize: 18 }}>{e.title}</h3>
          {e.regDeadline && (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--mute)" }}>
              Reg by {formatIstDate(e.regDeadline)}
            </p>
          )}
        </div>
        <span
          style={{
            fontSize: 12,
            padding: "3px 10px",
            borderRadius: 99,
            background: e.status === "registered" ? "var(--coral)" : "var(--coal)",
            color: e.status === "registered" ? "var(--charcoal)" : "var(--mute)",
            flexShrink: 0,
          }}
        >
          {e.status}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn ghost"
            style={{ fontSize: 13 }}
            onClick={() => !askRegister && e.status === "saved" && setAskRegister(true)}
          >
            <Icon name="rocket" size={14} />
            Register
          </a>
        )}
        {e.gcalLink && (
          <a
            href={e.gcalLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn ghost"
            style={{ fontSize: 13 }}
          >
            <Icon name="clock" size={14} />
            Add to Google Calendar
          </a>
        )}
        <button type="button" className="btn ghost" style={{ fontSize: 13 }} onClick={remove}>
          <Icon name="heart" size={14} />
          Unsave
        </button>
      </div>

      {askRegister && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--chalk)" }}>
          <span>Mark as registered?</span>
          <button type="button" className="btn solid" style={{ fontSize: 13, padding: "4px 14px" }} onClick={markRegistered}>
            Yes
          </button>
          <button type="button" className="btn ghost" style={{ fontSize: 13, padding: "4px 14px" }} onClick={() => setAskRegister(false)}>
            No
          </button>
        </div>
      )}
    </div>
  );
}
