import { useEffect, useState, type FormEvent } from "react";
import { fetchBusy, type BusyPeriod } from "../lib/api.js";
import { formatIstDate } from "../lib/format.js";

const istToday = (): string => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/** Dates the person is unavailable. Past periods are hidden; the digest and picks only use upcoming ones. */
export default function BusyForm() {
  const [periods, setPeriods] = useState<BusyPeriod[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let live = true;
    fetchBusy()
      .then((r) => live && setPeriods(r.periods))
      .catch(() => live && setProblem("Could not load your busy dates. Reload the page to try again."))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, []);

  const upcoming = periods.filter((p) => p.endsOn >= istToday());

  async function request(path: string, init: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    setBusy(true);
    setProblem("");
    try {
      const res = await fetch(path, init);
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) setProblem(typeof body.error === "string" ? body.error : "That did not work. Check your connection and try again.");
      return { ok: res.ok, body };
    } catch {
      setProblem("That did not work. Check your connection and try again.");
      return { ok: false, body: {} };
    } finally {
      setBusy(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const { ok, body } = await request("/api/me/busy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ startsOn: from, endsOn: to, label }),
    });
    if (!ok) return;
    setPeriods((prev) => [...prev, body as unknown as BusyPeriod].sort((a, b) => a.startsOn.localeCompare(b.startsOn)));
    setFrom("");
    setTo("");
    setLabel("");
  }

  async function remove(id: number) {
    const { ok } = await request(`/api/me/busy/${id}`, { method: "DELETE" });
    if (ok) setPeriods((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {loaded && upcoming.length === 0 && <p className="hint">No busy dates yet.</p>}
      {upcoming.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {upcoming.map((p) => (
            <li key={p.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>
                <b>{p.label}</b> · {formatIstDate(p.startsOn)} to {formatIstDate(p.endsOn)}
              </span>
              <button type="button" className="btn ghost" disabled={busy} aria-label={`Remove ${p.label}`} onClick={() => void remove(p.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void add(e)} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
        <label className="field">
          From
          <input type="date" required value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          To
          <input type="date" required value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="field">
          Label
          <input type="text" placeholder="Exams, holiday..." maxLength={40} required value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <button type="submit" className="btn solid" disabled={busy || !from || !to || label.trim() === ""}>
          {busy ? "Saving..." : "Add busy dates"}
        </button>
      </form>
      {problem && (
        <p role="alert" className="notice">
          {problem}
        </p>
      )}
    </div>
  );
}
