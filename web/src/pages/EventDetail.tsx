import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import useSWR from "swr";
import { buildPrompt, chatgptUrl, claudeUrl } from "../../server/prompt.js";
import Icon from "../components/Icon.js";
import Monitor from "../components/Monitor.js";
import { fetchEvent, fetchMyEvents, saveEvent, unsaveEvent, type EventDetail as Detail } from "../lib/api.js";
import { formatIst, formatIstDate, sourceLabel } from "../lib/format.js";
import { useMe } from "../lib/me.js";

export default function EventDetail() {
  const { id = "" } = useParams();
  const { state } = useMe();
  const { data: event, error: fetchError } = useSWR<Detail>(id || null, fetchEvent);
  const error = fetchError
    ? fetchError.message === "not found"
      ? "Event not found."
      : "Could not load this event."
    : "";
  const [copyStatus, setCopyStatus] = useState("");

  const prompt = useMemo(() => {
    if (!event) return "";
    return buildPrompt({
      title: event.title,
      kind: event.kind,
      mode: event.mode,
      city: event.city,
      regDeadline: event.regDeadline,
      startDate: event.startDate,
      endDate: event.endDate,
      teamSize: event.teamSize,
      entryFee: event.entryFee,
      prizeText: event.prizeText,
      source: event.sources.map((s) => sourceLabel(s.source)).join(", ") || "not listed",
      url: event.sources[0]?.url ?? "not listed",
      summary: event.summary,
    });
  }, [event]);

  async function copyPrompt() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Copied to clipboard!");
    } catch {
      setCopyStatus('Copy not supported here. Expand "See exactly what is sent" below and copy manually.');
    }
  }

  if (error) {
    return (
      <div style={{ maxWidth: 1120, margin: "40px auto 96px" }}>
        <Link to="/" className="crumb" style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, font: "20px var(--hand)", color: "var(--mute)", textDecoration: "none" }}>
          <svg viewBox="0 0 26 16" aria-hidden="true" style={{ width: 26, height: 16 }}>
            <path className="ln" d="M24 8H3m0 0 6-6M3 8l6 6" />
          </svg>
          back to hackathons
        </Link>
        <p className="notice" role="alert" style={{ marginTop: 24 }}>
          {error}
        </p>
      </div>
    );
  }

  if (!event) {
    return (
      <div style={{ maxWidth: 1120, margin: "60px auto 96px", textAlign: "center" }}>
        <p className="lead dark">Loading event details...</p>
      </div>
    );
  }

  const firstSource = event.sources[0];
  const primaryPlatform = firstSource ? sourceLabel(firstSource.source) : "Listing";
  const modeLabel = event.mode === "offline" ? "in person" : event.mode || "hybrid";

  // Compute countdown from real registration deadline
  let countdownLabel = "";
  if (event.regDeadline) {
    const diffMs = new Date(event.regDeadline).getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) countdownLabel = "closed";
    else if (diffDays === 0) countdownLabel = "today!";
    else countdownLabel = `in ${diffDays} days!`;
  }

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto 96px" }}>
      {/* Back crumb */}
      <Link
        to="/"
        className="crumb"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          minHeight: 44,
          font: "20px var(--hand)",
          color: "var(--mute)",
          textDecoration: "none",
          marginBottom: 16,
        }}
      >
        <svg viewBox="0 0 26 16" aria-hidden="true" style={{ width: 26, height: 16 }}>
          <path className="ln" d="M24 8H3m0 0 6-6M3 8l6 6" />
        </svg>
        back to today
      </Link>

      {/* Main tablet graph-paper card */}
      <article className="tablet grid-paper enter">
        <div
          className="in"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
            gap: 40,
            alignItems: "start",
          }}
        >
          {/* Left Column: Big Poster & Guarantee Memo */}
          <div>
            <div
              className="big-poster"
              style={{
                height: 300,
                borderRadius: 16,
                background: "var(--coral)",
                color: "var(--coal)",
                display: "grid",
                placeItems: "center",
                position: "relative",
                boxShadow: "inset 0 0 0 3px var(--coral-deep)",
              }}
            >
              <span className="platform" style={{ position: "absolute", top: 12, left: 12 }}>
                {primaryPlatform}
              </span>

              <Icon name="code" size={72} />

              {event.sources.length > 1 && (
                <span className="stamp" style={{ position: "absolute", bottom: -12, right: 12 }}>
                  <Icon name="sparkle" size={16} variant="ink" />
                  on {event.sources.length} sites
                </span>
              )}

              {/* Mascot sticker */}
              <div
                className="sticker"
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: -16,
                  right: -14,
                  width: 74,
                  height: 74,
                  transform: "rotate(10deg)",
                  background: "var(--coal)",
                  borderRadius: 16,
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 10px 18px -8px rgb(0 0 0 / 0.6)",
                }}
              >
                <Monitor size={56} mood="happy" />
              </div>
            </div>

            <p
              className="memo ruled torn"
              style={{
                position: "relative",
                background: "#fbf5ec",
                padding: "32px 24px 24px",
                font: "23px/31px var(--hand)",
                color: "var(--ink)",
                boxShadow: "0 18px 36px -16px rgb(0 0 0 / 0.7)",
                margin: "24px 0 0",
                transform: "rotate(2deg)",
              }}
            >
              <span className="tape" />
              Dates and prizes come straight from {primaryPlatform}, never from AI. Pinky promise.
              <Icon name="heart" size={18} />
            </p>
          </div>

          {/* Right Column: Title, Timeline, Notched Facts Ticket, AI Summary */}
          <div>
            <p className="eyebrow">
              {event.kind || "Hackathon"} · {modeLabel} {event.city ? `· ${event.city}` : ""}
            </p>
            <h1 className="h1" style={{ fontSize: "clamp(34px, 20px + 3vw, 54px)", marginBottom: 10 }}>
              {event.title}
            </h1>
            <p style={{ font: "500 13px var(--mono)", color: "#7a4b47", margin: "0 0 22px" }}>
              Listed on {event.sources.map((s) => sourceLabel(s.source)).join(" and ")} · checked this morning
            </p>

            {/* Date Timeline */}
            <ol
              className="dates"
              style={{
                listStyle: "none",
                margin: "0 0 24px",
                padding: 0,
                display: "grid",
                gap: 0,
                borderLeft: "2.5px dashed var(--ink-red)",
                marginLeft: 8,
              }}
            >
              {event.regDeadline && (
                <li style={{ position: "relative", padding: "0 0 18px 24px" }}>
                  <b style={{ display: "block", font: "500 13px var(--mono)", textTransform: "uppercase", letterSpacing: "0.05em", color: "#7a4b47" }}>
                    Registration closes
                  </b>
                  <span style={{ font: "400 20px var(--serif)", color: "var(--ink)" }}>
                    {formatIst(event.regDeadline)}
                  </span>
                  {countdownLabel && (
                    <em style={{ display: "inline-block", font: "17px/1 var(--hand)", fontStyle: "normal", marginLeft: 10, background: "var(--ink)", color: "var(--cream)", borderRadius: 6, padding: "3px 9px", transform: "rotate(4deg)" }}>
                      {countdownLabel}
                    </em>
                  )}
                </li>
              )}
              {event.startDate && (
                <li style={{ position: "relative", padding: "0 0 18px 24px" }}>
                  <b style={{ display: "block", font: "500 13px var(--mono)", textTransform: "uppercase", letterSpacing: "0.05em", color: "#7a4b47" }}>
                    Hackathon starts
                  </b>
                  <span style={{ font: "400 20px var(--serif)", color: "var(--ink)" }}>
                    {formatIstDate(event.startDate)} {event.endDate ? `– ${formatIstDate(event.endDate)}` : ""}
                  </span>
                </li>
              )}
              {event.submissionDeadline && (
                <li style={{ position: "relative", padding: "0 0 18px 24px" }}>
                  <b style={{ display: "block", font: "500 13px var(--mono)", textTransform: "uppercase", letterSpacing: "0.05em", color: "#7a4b47" }}>
                    Submissions close
                  </b>
                  <span style={{ font: "400 20px var(--serif)", color: "var(--ink)" }}>
                    {formatIst(event.submissionDeadline)}
                  </span>
                </li>
              )}
            </ol>

            {/* Notched Ticket Stub Facts Row */}
            <dl
              className="facts-row"
              style={{
                position: "relative",
                background: "#fbf5ec",
                border: "2px dashed var(--ink-red)",
                borderRadius: 14,
                padding: "16px 18px",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                gap: 16,
                margin: "0 0 24px",
              }}
            >
              <div>
                <dt style={{ display: "flex", alignItems: "center", gap: 4, font: "500 11px var(--mono)", textTransform: "uppercase", color: "#7a4b47" }}>
                  <Icon name="pin" size={16} /> Where
                </dt>
                <dd style={{ margin: 0, fontSize: 16, color: "var(--ink)" }}>
                  {[event.city, modeLabel].filter(Boolean).join(" · ") || "Online"}
                </dd>
              </div>

              <div>
                <dt style={{ display: "flex", alignItems: "center", gap: 4, font: "500 11px var(--mono)", textTransform: "uppercase", color: "#7a4b47" }}>
                  <Icon name="trophy" size={16} /> Prize
                </dt>
                <dd style={{ margin: 0, fontSize: 16, color: "var(--ink)" }}>
                  {event.prizeText || "Not listed"}
                </dd>
              </div>

              <div>
                <dt style={{ display: "flex", alignItems: "center", gap: 4, font: "500 11px var(--mono)", textTransform: "uppercase", color: "#7a4b47" }}>
                  <Icon name="people" size={16} /> Team size
                </dt>
                <dd style={{ margin: 0, fontSize: 16, color: "var(--ink)" }}>
                  {event.teamSize || "Any"}
                </dd>
              </div>

              <div>
                <dt style={{ display: "flex", alignItems: "center", gap: 4, font: "500 11px var(--mono)", textTransform: "uppercase", color: "#7a4b47" }}>
                  <Icon name="ticket" size={16} /> Entry fee
                </dt>
                <dd style={{ margin: 0, fontSize: 16, color: "var(--ink)" }}>
                  {event.entryFee || "Free"}
                </dd>
              </div>
            </dl>

            {/* AI Summary */}
            <p style={{ fontSize: 16, color: "var(--ink-soft)", margin: "0 0 6px" }}>
              {event.summary || "No public summary provided yet."}
            </p>
            <p style={{ font: "15px var(--hand)", color: "var(--coral-deep)", margin: "0 0 24px", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="bulb" size={16} />
              summary written by AI from the public listing (dates aren't)
            </p>

            {/* Action Buttons */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {event.sources.map((s) => (
                <a
                  key={s.source + s.url}
                  className="btn solid"
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Register on {sourceLabel(s.source)}
                  <Icon name="rocket" size={18} variant="ink" />
                </a>
              ))}

              {/* Save button — enabled for signed-in users */}
              {state.status === "in" && (
                <SaveButton eventId={Number(id)} />
              )}
            </div>
          </div>
        </div>
      </article>

      {/* ASK AN AI SECTION */}
      <section
        className="ask"
        aria-labelledby="ask-h"
        style={{
          marginTop: 72,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))",
          gap: 40,
          alignItems: "start",
        }}
      >
        <div>
          <p className="note-hand" style={{ margin: "0 0 10px" }}>
            got questions? [o_o]
          </p>
          <h2 className="h2" id="ask-h" style={{ color: "var(--chalk)", marginBottom: 12 }}>
            Ask an AI about this event
          </h2>
          <p className="lead dark">
            Opens your chatbot with the event details filled in. Only public event text is sent, nothing about you.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
            <a className="btn chalk" href={chatgptUrl(prompt)} target="_blank" rel="noopener noreferrer">
              Ask ChatGPT
            </a>
            <a className="btn chalk" href={claudeUrl(prompt)} target="_blank" rel="noopener noreferrer">
              Ask Claude
            </a>
            <button type="button" className="btn chalk" onClick={copyPrompt}>
              Copy prompt
            </button>
          </div>

          {copyStatus && (
            <p className="notice" role="status" style={{ margin: "12px 0" }}>
              {copyStatus}
            </p>
          )}

          <details
            className="prompt"
            style={{
              background: "var(--coal)",
              border: "1.5px solid var(--line-dark)",
              borderRadius: 16,
              overflow: "clip",
            }}
          >
            <summary
              style={{
                minHeight: 52,
                display: "flex",
                alignItems: "center",
                paddingInline: 18,
                font: "20px var(--hand)",
                color: "var(--chalk)",
                cursor: "pointer",
              }}
            >
              See exactly what is sent
            </summary>
            <pre
              style={{
                margin: 0,
                padding: 18,
                borderTop: "1px solid var(--line-dark)",
                font: "13px/1.6 var(--mono)",
                color: "var(--mute)",
                whiteSpace: "pre-wrap",
              }}
            >
              {prompt}
            </pre>
          </details>
        </div>

        <p
          className="memo ruled torn"
          style={{
            position: "relative",
            background: "#fbf5ec",
            padding: "32px 24px 24px",
            font: "25px/33px var(--hand)",
            color: "var(--ink)",
            transform: "rotate(-2deg)",
            boxShadow: "0 18px 36px -16px rgb(0 0 0 / 0.7)",
            margin: "24px 0 0",
          }}
        >
          <span className="tape" />
          Try: "what could a team of 2 first-years build here?"
        </p>
      </section>
    </div>
  );
}

function SaveButton({ eventId }: { eventId: number }) {
  const { data, mutate } = useSWR("/api/me/events", fetchMyEvents);
  const isSaved = data?.items.some((e) => e.eventId === eventId) ?? false;
  const saved = data?.items.find((e) => e.eventId === eventId);

  async function toggle() {
    if (isSaved) {
      await unsaveEvent(eventId);
    } else {
      await saveEvent(eventId);
    }
    await mutate();
  }

  return (
    <>
      <button type="button" className="btn ghost" onClick={toggle}>
        <Icon name="heart" size={18} />
        {isSaved ? "Saved ✓" : "Save event"}
      </button>
      {isSaved && saved?.gcalLink && (
        <a
          href={saved.gcalLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn ghost"
        >
          <Icon name="clock" size={18} />
          Add to Google Calendar
        </a>
      )}
    </>
  );
}
