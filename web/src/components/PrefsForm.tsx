import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { fetchPlaces, type Place } from "../lib/api.js";
import {
  fromApi,
  resolveCity,
  toggle,
  toPayload,
  TOPIC_LABELS,
  type Channel,
  type FormState,
  type Kind,
  type Level,
  type MessageType,
  type PrefsResponse,
} from "../lib/prefsForm.js";

type Mode = "onboarding" | "settings";

const KIND_ROWS: ReadonlyArray<{ kind: Kind; title: string; sub: string; sparse?: boolean }> = [
  { kind: "hackathon", title: "Hackathons", sub: "Build a project in a weekend or two" },
  { kind: "contest", title: "Coding contests and CTFs", sub: "Competitive programming, security, quizzes" },
  { kind: "workshop", title: "Workshops and meetups", sub: "Talks, bootcamps, community events", sparse: true },
  { kind: "fest", title: "Fests and conferences", sub: "College techfests, summits, expos", sparse: true },
];
const LEVEL_ROWS: ReadonlyArray<readonly [Level, string]> = [
  ["top", "Top"],
  ["normal", "Normal"],
  ["off", "Off"],
];
const MESSAGE_ROWS: ReadonlyArray<{ type: MessageType; title: string; sub: string }> = [
  { type: "digest", title: "Daily digest", sub: "One message around 5:00 AM" },
  { type: "ping", title: "Top pings", sub: "In the next morning's run, when a Top kind appears" },
  { type: "reminders", title: "Reminders for saved events", sub: "7 days, 3 days, 1 day, and the morning of" },
];
const CHANNEL_ROWS: ReadonlyArray<readonly [Channel, string]> = [
  ["email", "Email"],
  ["discord", "Discord"],
  ["whatsapp", "WhatsApp"],
];
const CHANNEL_ORDER: readonly Channel[] = ["email", "discord", "whatsapp"];
const TOPIC_ORDER = TOPIC_LABELS.map(([k]) => k);
const FIELD_LABEL: Record<string, string> = {
  email: "email",
  phone: "WhatsApp number",
  callmebotKey: "CallMeBot key",
  homeCity: "home city",
  radiusKm: "distance",
  format: "format",
};

const DISCORD_INVITE = import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined;

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

export default function PrefsForm({ mode, name }: { mode: Mode; name?: string }) {
  const onboarding = mode === "onboarding";
  const [form, setForm] = useState<FormState | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    let live = true;
    fetch("/api/me/prefs", { headers: { accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return fromApi((await res.json()) as PrefsResponse);
      })
      .then(
        (f) => live && setForm(f),
        () => live && setLoadError(true),
      );
    fetchPlaces().then(
      (p) => live && setPlaces(p),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  if (loadError) return <p role="alert">Could not load your settings. Reload the page to try again.</p>;
  if (!form) return <p>Loading</p>;

  const { prefs } = form;
  const patch = (p: Partial<FormState["prefs"]>) => {
    setStatus({ kind: "idle" });
    setForm({ ...form, prefs: { ...prefs, ...p } });
  };
  const patchForm = (p: Partial<FormState>) => {
    setStatus({ kind: "idle" });
    setForm({ ...form, ...p });
  };
  const city = resolveCity(prefs.homeCity, places);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/me/prefs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toPayload(form, places)),
      });
      if (res.ok) {
        if (onboarding) {
          // Full navigation so the header re-reads /api/me and drops "Finish setup".
          window.location.assign("/");
          return;
        }
        setForm({ ...form, callmebotKey: "", hasCallmebotKey: form.hasCallmebotKey || form.callmebotKey.trim() !== "" });
        setStatus({ kind: "saved" });
        return;
      }
      const body = (await res.json().catch(() => null)) as { field?: string } | null;
      const label = body?.field ? FIELD_LABEL[body.field] : undefined;
      setStatus({
        kind: "error",
        message: res.status === 401 ? "You are signed out. Sign in again." : label ? `Please check the ${label} field.` : "Could not save. Please check your choices.",
      });
    } catch {
      setStatus({ kind: "error", message: "Could not save. Check your connection and try again." });
    }
  }

  const step = (n: number) => (onboarding ? `Step ${n} of 4` : null);

  return (
    <div className="prefs">
      <h1>{onboarding ? "Pick what you hear about" : "Settings"}</h1>
      <p className="lead">
        {onboarding
          ? "The site lists every event. Your picks below decide which ones we message you about. Skip anything, and change it later in Settings."
          : "Your picks decide which events we message you about. The site always lists every event."}
      </p>
      {!onboarding && name && (
        <p className="small prefs-who">
          Signed in as <b>{name}</b>
        </p>
      )}

      <div className="prefs-layout">
        <nav className="rail" aria-label="Sections">
          <a href="#reach">
            Where to reach you<span>Optional</span>
          </a>
          <a href="#place">
            Where you are<span>Home city and distance</span>
          </a>
          <a href="#interests">
            What you follow<span>Event types and topics</span>
          </a>
          <a href="#notify">
            How we message you<span>Digest, pings, reminders</span>
          </a>
        </nav>

        <form className="prefs-main" onSubmit={(e) => void save(e)}>
          <section id="reach">
            {step(1) && <p className="eyebrow">{step(1)}</p>}
            <h2>Where to reach you</h2>
            <p className="hint">All optional. We use each only for the notifications you turn on for it.</p>
            <div className="grid">
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  autoComplete="email"
                  readOnly={form.emailLocked}
                  value={form.email}
                  onChange={(e) => patchForm({ email: e.target.value })}
                />
                {form.emailLocked && <span className="note">This is your sign-in email, so it cannot be changed here.</span>}
              </div>
              <div className="field">
                <label htmlFor="phone">WhatsApp number</label>
                <input
                  id="phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => patchForm({ phone: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="cbkey">CallMeBot key</label>
                <input
                  id="cbkey"
                  type="password"
                  autoComplete="off"
                  placeholder={form.hasCallmebotKey ? "Saved. Leave blank to keep it." : "Paste your key"}
                  value={form.callmebotKey}
                  onChange={(e) => patchForm({ callmebotKey: e.target.value })}
                />
              </div>
            </div>
            <p className="small">
              WhatsApp messages use CallMeBot, a free service. Send it a message from your own phone to get a personal key, then paste the key here.
              Optional.
            </p>
            {DISCORD_INVITE && (
              <div className="row spaced">
                <a className="btn" href={DISCORD_INVITE} target="_blank" rel="noreferrer">
                  Join the Discord server
                </a>
                <span className="hint">The digest arrives there with Save and Not interested buttons.</span>
              </div>
            )}
            <p className="small">Email and number are stored encrypted and are never sent to the AI. Only public event text is.</p>
          </section>

          <section id="place">
            {step(2) && <p className="eyebrow">{step(2)}</p>}
            <h2>Where you are</h2>
            <p className="hint">Decides which in-person events count as nearby. Online events always count.</p>
            <div className="grid">
              <div className="field">
                <label htmlFor="city">Home city</label>
                <select id="city" value={city} onChange={(e) => patch({ homeCity: e.target.value })}>
                  {places.length === 0 && <option value={city}>{city}</option>}
                  {places.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="radius">Willing to travel</label>
                <select id="radius" value={prefs.radiusKm} onChange={(e) => patch({ radiusKm: Number(e.target.value) as FormState["prefs"]["radiusKm"] })}>
                  <option value={50}>50 km</option>
                  <option value={150}>150 km</option>
                  <option value={300}>300 km</option>
                  <option value={3000}>Anywhere in India</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="format">Format</label>
                <select id="format" value={prefs.format} onChange={(e) => patch({ format: e.target.value as FormState["prefs"]["format"] })}>
                  <option value="online_near">Online and near me</option>
                  <option value="online">Online only</option>
                  <option value="in_person">In person only</option>
                  <option value="anything">Anything</option>
                </select>
              </div>
            </div>
          </section>

          <section id="interests">
            {step(3) && <p className="eyebrow">{step(3)}</p>}
            <h2>What you follow</h2>
            <p className="hint">
              Top means we message you in the next morning's run. Normal puts it in your daily digest. Off means no messages; it still shows on the
              site.
            </p>

            {KIND_ROWS.map((row) => (
              <div className="line" key={row.kind}>
                <div>
                  <b>{row.title}</b>
                  <small>{row.sub}</small>
                  {row.sparse && <small>Few events of this kind are tracked yet.</small>}
                </div>
                <fieldset className="seg top">
                  <legend className="sr">{row.title} priority</legend>
                  {LEVEL_ROWS.map(([level, label]) => (
                    <label key={level}>
                      <input
                        type="radio"
                        name={`p-${row.kind}`}
                        checked={prefs.priorities[row.kind] === level}
                        onChange={() => patch({ priorities: { ...prefs.priorities, [row.kind]: level } })}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              </div>
            ))}

            <fieldset className="topics">
              <legend className="label-strong">Topics</legend>
              <div className="chips">
                {TOPIC_LABELS.map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={prefs.topics.includes(key)}
                      onChange={(e) => patch({ topics: toggle(prefs.topics, key, e.target.checked, TOPIC_ORDER) })}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="check">
              <input type="checkbox" checked={prefs.includeSocial} onChange={(e) => patch({ includeSocial: e.target.checked })} />
              <span>
                <b>Include posts found on LinkedIn and X</b>
                <br />
                <span className="sub">Organisers often announce there first. We read public posts through search only, with no logins.</span>
              </span>
            </label>
          </section>

          <section id="notify">
            {step(4) && <p className="eyebrow">{step(4)}</p>}
            <h2>How we message you</h2>
            <p className="hint">Only for the kinds you set to Top or Normal above.</p>
            {MESSAGE_ROWS.map((row) => (
              <div className="line" key={row.type}>
                <div>
                  <b>{row.title}</b>
                  <small>{row.sub}</small>
                </div>
                <fieldset className="chips">
                  <legend className="sr">{row.title} channels</legend>
                  {CHANNEL_ROWS.map(([channel, label]) => (
                    <label key={channel}>
                      <input
                        type="checkbox"
                        checked={prefs.channels[row.type].includes(channel)}
                        onChange={(e) =>
                          patch({ channels: { ...prefs.channels, [row.type]: toggle(prefs.channels[row.type], channel, e.target.checked, CHANNEL_ORDER) } })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              </div>
            ))}
          </section>

          <div className="foot">
            {status.kind === "saved" && (
              <span role="status" className="saved">
                Saved
              </span>
            )}
            {status.kind === "error" && (
              <span role="alert" className="failed">
                {status.message}
              </span>
            )}
            {onboarding && <Link to="/">Skip for now</Link>}
            <button className="btn primary" type="submit" disabled={status.kind === "saving"}>
              {onboarding ? "Save and open the site" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
