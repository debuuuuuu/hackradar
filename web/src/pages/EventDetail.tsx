import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { buildPrompt, chatgptUrl, claudeUrl } from "../../server/prompt.js";
import { fetchEvent, type EventDetail as Detail } from "../lib/api.js";
import { formatIst, formatIstDate, sourceLabel } from "../lib/format.js";

export default function EventDetail() {
  const { id = "" } = useParams();
  const [event, setEvent] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [copy, setCopy] = useState("");

  useEffect(() => {
    let live = true;
    setEvent(null);
    setError("");
    setCopy("");
    fetchEvent(id).then(
      (e) => live && setEvent(e),
      (e: Error) => live && setError(e.message === "not found" ? "Event not found." : "Could not load this event."),
    );
    return () => {
      live = false;
    };
  }, [id]);

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
      setCopy("Copied");
    } catch {
      setCopy('Copy is not available here. Open "See exactly what gets sent" and copy the text by hand.');
    }
  }

  if (error) {
    return (
      <>
        <p className="crumb">
          <Link to="/">All events</Link>
        </p>
        <p role="alert">{error}</p>
      </>
    );
  }
  if (!event) return <p className="count">Loading</p>;

  const first = event.sources[0];
  const mode = event.mode === "offline" ? "in person" : event.mode;

  return (
    <>
      <p className="crumb">
        <Link to="/">All events</Link> / {event.title}
      </p>
      <h1 className="detail-title">{event.title}</h1>
      <p className="meta">
        {(event.city || mode) && (
          <span>
            {event.city && <b>{event.city}</b>}
            {event.city && mode ? ", " : ""}
            {mode}
          </span>
        )}
        {event.regDeadline && (
          <span>
            Registration closes <b>{formatIst(event.regDeadline)}</b>
          </span>
        )}
        {event.sources.map((s) => (
          <span className="tag" key={s.source}>
            {sourceLabel(s.source)}
          </span>
        ))}
      </p>

      <div className="layout">
        <div className="col main">
          <section>
            <h2>What it is</h2>
            <p className="body">{event.summary ?? "No summary yet."}</p>
            <p className="small">
              Summary written by AI from the listing. Dates and numbers come from {first ? sourceLabel(first.source) : "the source"}.
            </p>
          </section>

          <section aria-labelledby="ask">
            <h2 id="ask">Ask an AI about this event</h2>
            <p className="hint">
              Opens your own chatbot with the public event details already filled in, so you can ask whether it suits you, what to
              prepare, or how to pitch.
            </p>
            <div className="actions">
              <a className="btn primary" href={chatgptUrl(prompt)} target="_blank" rel="noopener noreferrer">
                Ask ChatGPT
              </a>
              <a className="btn primary" href={claudeUrl(prompt)} target="_blank" rel="noopener noreferrer">
                Ask Claude
              </a>
              <button className="btn" type="button" onClick={copyPrompt}>
                Copy prompt
              </button>
            </div>
            <p className="small" role="status">
              {copy}
            </p>
            <details className="prompt">
              <summary>See exactly what gets sent</summary>
              <pre>{prompt}</pre>
            </details>
            <p className="small">
              Nothing about you is included, only the public event details above. If a link doesn&apos;t prefill, use Copy prompt and
              paste it in.
            </p>
          </section>
        </div>

        <aside className="col side" aria-label="Key facts">
          <section>
            <h2>Key dates</h2>
            <dl>
              <dt>Register by</dt>
              <dd>{formatIst(event.regDeadline) ?? "Not listed"}</dd>
              <dt>Starts</dt>
              <dd>{formatIstDate(event.startDate) ?? "Not listed"}</dd>
              <dt>Ends</dt>
              <dd>{formatIstDate(event.endDate) ?? "Not listed"}</dd>
              {event.submissionDeadline && (
                <>
                  <dt>Submit by</dt>
                  <dd>{formatIst(event.submissionDeadline)}</dd>
                </>
              )}
              <dt>Team</dt>
              <dd>{event.teamSize ?? "Not listed"}</dd>
              <dt>Fee</dt>
              <dd>{event.entryFee ?? "Not listed"}</dd>
              <dt>Prize</dt>
              <dd>{event.prizeText ?? "Not listed"}</dd>
            </dl>
            <div className="actions">
              {event.sources.map((s) => (
                <a className="btn primary" key={s.source + s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                  Open on {sourceLabel(s.source)}
                </a>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
