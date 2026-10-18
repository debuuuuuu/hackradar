import { useState } from "react";
import { Link } from "react-router";
import Icon from "../components/Icon.js";
import RequireMe from "../components/RequireMe.js";

// TODO(backend): saved events and reminders API (/api/me/events, /api/me/saves, /api/me/history)
export default function MyEvents() {
  return (
    <RequireMe>
      {(me) => <MyEventsContent name={me.name} />}
    </RequireMe>
  );
}

function MyEventsContent({ name }: { name: string }) {
  const [tab, setTab] = useState<"up" | "went">("up");

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
          Coming up · 0
        </button>
        <button
          type="button"
          role="tab"
          className={`chip ${tab === "went" ? "on" : ""}`}
          style={{ borderColor: "var(--chalk)", color: tab === "went" ? "var(--charcoal)" : "var(--chalk)", fontSize: 15 }}
          aria-selected={tab === "went"}
          onClick={() => setTab("went")}
        >
          Went to · 0
        </button>
      </div>

      {tab === "up" ? (
        <div>
          {/* Friendly empty state because backend is not yet implemented */}
          <div
            className="card-paper grid-paper"
            style={{
              padding: "48px 32px",
              textAlign: "center",
              border: "8px solid var(--coral)",
              borderRadius: 24,
            }}
          >
            <Icon name="heart" size={48} variant="coral" />
            <h2 className="h2" style={{ color: "var(--ink-red)", marginTop: 12, marginBottom: 12 }}>
              Saving events is coming soon
            </h2>
            <p className="lead" style={{ margin: "0 auto 24px", maxWidth: "48ch" }}>
              We're building the personal saves, reminder schedules (7d, 3d, 1d), and calendar export for your registered hackathons.
            </p>
            {/* TODO(backend): Implement user_events table reads/writes */}
            <Link className="btn solid" to="/">
              Browse Today's picks
            </Link>
          </div>
        </div>
      ) : (
        <div>
          <div
            className="card-paper grid-paper"
            style={{
              padding: "48px 32px",
              textAlign: "center",
              border: "8px solid var(--coral)",
              borderRadius: 24,
            }}
          >
            <Icon name="trophy" size={48} variant="coral" />
            <h2 className="h2" style={{ color: "var(--ink-red)", marginTop: 12, marginBottom: 12 }}>
              Your hackathon scrap book
            </h2>
            <p className="lead" style={{ margin: "0 auto 24px", maxWidth: "48ch" }}>
              Keep track of past hackathons you attended, your team projects, and finalist stickers. Coming in the next release!
            </p>
            {/* TODO(backend): Implement attended event history logging */}
            <Link className="btn solid" to="/">
              Back to hackathons
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
