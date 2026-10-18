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
import Icon from "./Icon.js";
import Monitor from "./Monitor.js";

type Mode = "onboarding" | "settings";

const KIND_DEFS: ReadonlyArray<{ id: Kind; label: string; sub: string }> = [
  { id: "hackathon", label: "Hackathons", sub: "Devpost, Unstop, Devfolio, MLH" },
  { id: "contest", label: "Coding contests and CTFs", sub: "Online rounds and capture-the-flag" },
  { id: "workshop", label: "Workshops and meetups", sub: "Few listed yet: more arrive with Luma" },
  { id: "fest", label: "Fests and conferences", sub: "Few listed yet" },
];

const LEVEL_LABELS: ReadonlyArray<readonly [Level, string]> = [
  ["top", "ping me!"],
  ["normal", "digest"],
  ["off", "nah"],
];

const MESSAGE_DEFS: ReadonlyArray<{ id: MessageType; label: string; sub: string }> = [
  { id: "digest", label: "Daily digest", sub: "Normal picks, every morning" },
  { id: "ping", label: "Top pings", sub: "One message per Top pick" },
  { id: "reminders", label: "Reminders", sub: "Before saved events close" },
];

const CHANNELS: ReadonlyArray<readonly [Channel, string]> = [
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
  discordWebhook: "Discord webhook URL",
  homeCity: "home city",
  radiusKm: "distance",
  format: "format",
};

const DISCORD_INVITE = import.meta.env.VITE_DISCORD_INVITE_URL as string | undefined;

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const hookHint = (isSet: boolean, typed: boolean): string => (isSet && typed ? "Save first, then test the new URL." : "");

export default function PrefsForm({ mode, name }: { mode: Mode; name?: string }) {
  const onboarding = mode === "onboarding";
  const [form, setForm] = useState<FormState | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [hookTest, setHookTest] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "ok" } | { kind: "fail"; message: string }
  >({ kind: "idle" });

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

  if (loadError) return <p role="alert" className="notice">Could not load your settings. Reload the page to try again.</p>;
  if (!form) return <p className="lead dark" style={{ textAlign: "center", padding: "40px 0" }}>Loading settings...</p>;

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
          window.location.assign("/");
          return;
        }
        const typedHook = form.discordWebhook.trim() !== "";
        setForm({
          ...form,
          callmebotKey: "",
          hasCallmebotKey: form.hasCallmebotKey || form.callmebotKey.trim() !== "",
          discordWebhook: "",
          clearDiscordWebhook: false,
          discordWebhookSet: typedHook || (form.discordWebhookSet && !form.clearDiscordWebhook),
        });
        setHookTest({ kind: "idle" });
        setStatus({ kind: "saved" });
        return;
      }
      const body = (await res.json().catch(() => null)) as { field?: string; error?: string } | null;
      const label = body?.field ? FIELD_LABEL[body.field] : undefined;
      setStatus({
        kind: "error",
        message:
          res.status === 401
            ? "You are signed out. Sign in again."
            : body?.error?.endsWith(".")
            ? body.error // a sentence from the server, e.g. "That is not a Discord webhook URL."
            : label
            ? `Please check the ${label} field.`
            : "Could not save. Please check your choices.",
      });
    } catch {
      setStatus({ kind: "error", message: "Could not save. Check your connection and try again." });
    }
  }

  async function testWebhook() {
    setHookTest({ kind: "sending" });
    try {
      const res = await fetch("/api/me/prefs/test-discord", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (body?.ok === true) setHookTest({ kind: "ok" });
      else
        setHookTest({
          kind: "fail",
          message:
            res.status === 401 ? "You are signed out. Sign in again." : body?.reason ?? "The test message failed.",
        });
    } catch {
      setHookTest({ kind: "fail", message: "Could not send the test. Check your connection and try again." });
    }
  }

  const hookTyped = form.discordWebhook.trim() !== "";
  const canTestHook = form.discordWebhookSet && !form.clearDiscordWebhook && !hookTyped && hookTest.kind !== "sending";

  // Distance vibe text
  const r = prefs.radiusKm;
  const vibe =
    r <= 50
      ? "auto-rickshaw range"
      : r <= 150
      ? "a bus ride away"
      : r <= 400
      ? "worth a weekend trip"
      : r < 3000
      ? "overnight-train energy"
      : "anywhere in India";

  const allOff = KIND_DEFS.every((k) => prefs.priorities[k.id] === "off");
  const tops = KIND_DEFS.filter((k) => prefs.priorities[k.id] === "top").map((k) => k.label.toLowerCase());

  // Mascot dynamic reaction line
  const mascotSay = allOff
    ? "Everything on nah? I'll just sit here quietly then."
    : r >= 3000
    ? "Anywhere in India? Bold. Pack snacks."
    : !prefs.includeSocial
    ? "Skipping LinkedIn and X finds? Those are the hidden gems!"
    : prefs.topics.length === 0
    ? "No topics means you get everything. Brave."
    : prefs.topics.length >= 5
    ? "That's a lot of topics. Love the energy."
    : "Ooh, " +
      prefs.topics
        .slice(0, 2)
        .map((t) => TOPIC_LABELS.find(([k]) => k === t)?.[1] ?? t)
        .join(" and ") +
      ". Good taste.";

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto 96px" }}>
      <header
        className="fade-in"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          margin: "8px auto 36px",
        }}
      >
        <div>
          <p className="eyebrow" style={{ color: "var(--mute)" }}>
            {onboarding ? "Step 3 of 3 · change any of it later in Settings" : "Your personal radar filters"}
          </p>
          <h1 className="h1" style={{ color: "var(--chalk)", margin: 0 }}>
            {onboarding ? "What should we look out for?" : "Settings"}
          </h1>
          <span className="note-hand" style={{ marginTop: 10 }}>
            four quick parts, skip any of them
          </span>
          {!onboarding && name && (
            <p className="lead dark" style={{ marginTop: 8, fontSize: 16 }}>
              Signed in as <b>{name}</b>
            </p>
          )}
        </div>

        {/* Mascot Buddy speech bubble */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Monitor size={96} mood="happy" />
          <p
            aria-live="polite"
            style={{
              position: "relative",
              margin: 0,
              maxWidth: 280,
              background: "var(--cream)",
              color: "var(--ink)",
              font: "21px/1.25 var(--hand)",
              padding: "14px 18px",
              borderRadius: 18,
              boxShadow: "0 12px 26px -12px rgb(0 0 0 / 0.7)",
            }}
          >
            {mascotSay}
          </p>
        </div>
      </header>

      <form
        className="card-paper grid-paper fade-in"
        style={{ border: "10px solid var(--coral)", borderRadius: 28 }}
        noValidate // the browser's own bubble can hide on a far field; our message below the form always shows
        onSubmit={(e) => void save(e)}
      >
        {/* PART 1: Where should we ping you? */}
        <section className="part" style={{ paddingBottom: 24 }} aria-labelledby="p1">
          <div className="step-tab">
            <span className="num" aria-hidden="true">
              1
            </span>
            <h2 className="h3" id="p1">
              Where should we ping you?
            </h2>
            <Icon name="phone" className="sec-doodle" size={32} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 18 }}>
            <label className="field">
              Email
              <input
                type="email"
                readOnly={form.emailLocked}
                value={form.email}
                placeholder="name@example.com"
                onChange={(e) => patchForm({ email: e.target.value })}
              />
              <span className="hint">
                {form.emailLocked ? "From your sign-in. Locked to your account." : "Messages can go to this address."}
              </span>
            </label>

            <label className="field">
              WhatsApp number
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={form.phone}
                onChange={(e) => patchForm({ phone: e.target.value })}
              />
              <span className="hint">Optional. Needs the one-time CallMeBot key below.</span>
            </label>

            <label className="field">
              CallMeBot key
              <input
                type="password"
                autoComplete="off"
                placeholder={form.hasCallmebotKey ? "Saved. Leave blank to keep." : "Paste key from WhatsApp bot"}
                value={form.callmebotKey}
                onChange={(e) => patchForm({ callmebotKey: e.target.value })}
              />
              <span className="hint">Free WhatsApp bot key. Send a message to CallMeBot to get it.</span>
            </label>
          </div>

          {/* Discord Webhook Section */}
          <div className="field" style={{ marginTop: 18 }}>
            <label htmlFor="dwebhook">Discord webhook URL (optional)</label>
            <input
              id="dwebhook"
              type="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://discord.com/api/webhooks/..."
              value={form.discordWebhook}
              onChange={(e) => {
                setHookTest({ kind: "idle" });
                patchForm({ discordWebhook: e.target.value, clearDiscordWebhook: false });
              }}
            />
            <span className="hint">
              Anyone with this URL can post to that channel, so keep it private. Create one in Discord channel settings.
            </span>

            {form.discordWebhookSet && !form.clearDiscordWebhook && !hookTyped && (
              <span className="note">A webhook is saved. Paste a new one to replace it.</span>
            )}
            {form.clearDiscordWebhook && (
              <span className="note" style={{ color: "var(--ink-red)" }}>
                The saved webhook will be removed when you save.
              </span>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 8 }}>
              <button type="button" className="btn chalk" disabled={!canTestHook} onClick={() => void testWebhook()}>
                {hookTest.kind === "sending" ? "Sending..." : "Send test message"}
              </button>
              {form.discordWebhookSet && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setHookTest({ kind: "idle" });
                    patchForm({ discordWebhook: "", clearDiscordWebhook: !form.clearDiscordWebhook });
                  }}
                >
                  {form.clearDiscordWebhook ? "Keep saved webhook" : "Remove saved webhook"}
                </button>
              )}
              {DISCORD_INVITE && (
                <a className="btn ghost" href={DISCORD_INVITE} target="_blank" rel="noreferrer">
                  Join HackRadar Discord
                </a>
              )}
              <span role="status" aria-live="polite" style={{ fontSize: 13, color: hookTest.kind === "fail" ? "var(--ink-red)" : "var(--coral-deep)" }}>
                {hookTest.kind === "ok" && "Test message sent! Check your Discord channel."}
                {hookTest.kind === "fail" && hookTest.message}
                {hookTest.kind === "idle" && !canTestHook && !form.discordWebhookSet && "Save a webhook to enable the test."}
                {hookTest.kind === "idle" && hookHint(form.discordWebhookSet, hookTyped)}
              </span>
            </div>
          </div>
        </section>

        {/* PART 2: Where's home base? */}
        <section className="part" style={{ borderTop: "2px dashed color-mix(in oklch, var(--ink-red) 35%, transparent)", paddingTop: 32, paddingBottom: 24 }} aria-labelledby="p2">
          <div className="step-tab">
            <span className="num" aria-hidden="true">
              2
            </span>
            <h2 className="h3" id="p2">
              Where's home base?
            </h2>
            <Icon name="pin" className="sec-doodle" size={32} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 18 }}>
            <label className="field">
              Home city
              <select value={city} onChange={(e) => patch({ homeCity: e.target.value })}>
                {places.length === 0 && <option value={city}>{city}</option>}
                {places.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="range-row">
              <label className="field" htmlFor="radius">
                How far you'd travel
              </label>
              <input
                id="radius"
                type="range"
                min="50"
                max="3000"
                step="50"
                value={prefs.radiusKm}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  const nearest = val <= 100 ? 50 : val <= 225 ? 150 : val <= 1500 ? 300 : 3000;
                  patch({ radiusKm: nearest as FormState["prefs"]["radiusKm"] });
                }}
                style={{ width: "100%", accentColor: "var(--coral-deep)", minHeight: 44 }}
              />
              <span className="val" style={{ font: "24px var(--hand)", color: "var(--ink-red)" }}>
                {r >= 3000 ? "anywhere in India" : `${r} km · ${vibe}`}
              </span>
            </div>

            <div className="field">
              Format
              <div className="seg" role="group" aria-label="Format">
                {[
                  { value: "in_person", label: "In person" },
                  { value: "online", label: "Online" },
                  { value: "online_near", label: "Both" },
                ].map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    className={prefs.format === f.value ? "on" : ""}
                    aria-pressed={prefs.format === f.value}
                    onClick={() => patch({ format: f.value as FormState["prefs"]["format"] })}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* PART 3: What gets you out of bed on a weekend? */}
        <section className="part" style={{ borderTop: "2px dashed color-mix(in oklch, var(--ink-red) 35%, transparent)", paddingTop: 32, paddingBottom: 24 }} aria-labelledby="p3">
          <div className="step-tab">
            <span className="num" aria-hidden="true">
              3
            </span>
            <h2 className="h3" id="p3">
              What gets you out of bed on a weekend?
            </h2>
            <Icon name="rocket" className="sec-doodle" size={32} />
          </div>

          {KIND_DEFS.map((k) => (
            <div className="kind-row" key={k.id}>
              <div>
                <b>{k.label}</b>
                <small>{k.sub}</small>
              </div>
              <div className="seg" role="group" aria-label={`${k.label} priority`}>
                {LEVEL_LABELS.map(([level, label]) => {
                  const on = prefs.priorities[k.id] === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      className={on ? (level === "top" ? "on top" : "on") : ""}
                      aria-pressed={on}
                      onClick={() => patch({ priorities: { ...prefs.priorities, [k.id]: level } })}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <p style={{ font: "15px/1.45 var(--sans)", color: "#7a4b47", margin: "14px 0 0" }}>
            <b>ping me!</b> its own message in the next morning's run. <b>digest</b>: rolled into your daily digest.{" "}
            <b>nah</b>: never messaged, still on the site.
          </p>

          <p style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-soft)", margin: "20px 0 10px" }}>
            Topics you nerd out about (pick none to get everything)
          </p>
          <div className="chips">
            {TOPIC_LABELS.map(([key, label]) => {
              const on = prefs.topics.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={on ? "chip on" : "chip"}
                  aria-pressed={on}
                  onClick={() => patch({ topics: toggle(prefs.topics, key, !on, TOPIC_ORDER) })}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <p style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-soft)", margin: "24px 0 8px" }}>
            Social finds
          </p>
          <button
            type="button"
            className={prefs.includeSocial ? "switch on" : "switch"}
            aria-pressed={prefs.includeSocial}
            onClick={() => patch({ includeSocial: !prefs.includeSocial })}
          >
            <span className="track" aria-hidden="true" />
            Include hackathons found in LinkedIn and X posts (marked unverified)
          </button>
        </section>

        {/* PART 4: How loud should we be? */}
        <section className="part" style={{ borderTop: "2px dashed color-mix(in oklch, var(--ink-red) 35%, transparent)", paddingTop: 32, paddingBottom: 24 }} aria-labelledby="p4">
          <div className="step-tab">
            <span className="num" aria-hidden="true">
              4
            </span>
            <h2 className="h3" id="p4">
              How loud should we be?
            </h2>
            <Icon name="clock" className="sec-doodle" size={32} />
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="matrix">
              <thead>
                <tr>
                  <th scope="col">Message</th>
                  <th scope="col">Email</th>
                  <th scope="col">Discord</th>
                  <th scope="col">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {MESSAGE_DEFS.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <b>{row.label}</b>
                      <small>{row.sub}</small>
                    </td>
                    {CHANNELS.map(([channel, channelLabel]) => {
                      const on = prefs.channels[row.id].includes(channel);
                      return (
                        <td key={channel}>
                          <button
                            type="button"
                            className={on ? "cell on" : "cell"}
                            aria-pressed={on}
                            aria-label={`${row.label} by ${channelLabel}`}
                            onClick={() =>
                              patch({
                                channels: {
                                  ...prefs.channels,
                                  [row.id]: toggle(prefs.channels[row.id], channel, !on, CHANNEL_ORDER),
                                },
                              })
                            }
                          >
                            <svg viewBox="0 0 16 16" aria-hidden="true">
                              <path className="tick" d="M3 8.5l3 3 7-7" />
                            </svg>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Save footer */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            paddingTop: 24,
            borderTop: "2px dashed color-mix(in oklch, var(--ink-red) 35%, transparent)",
          }}
        >
          <div>
            <p style={{ margin: 0, font: "20px var(--hand)", color: "#7a4b47" }}>
              {tops.length > 0
                ? `Top pings for ${tops.join(" and ")}. Everything else in your morning digest.`
                : "Everything you follow arrives in your morning digest."}
            </p>
            {status.kind === "saved" && (
              <p style={{ color: "var(--ink-red)", fontWeight: 600, margin: "4px 0 0" }}>Saved!</p>
            )}
            {status.kind === "error" && (
              <p style={{ color: "var(--coral-deep)", fontWeight: 600, margin: "4px 0 0" }} role="alert">
                {status.message}
              </p>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {onboarding && (
              <Link to="/" className="btn ghost">
                Skip for now
              </Link>
            )}
            <button className="btn solid" type="submit" disabled={status.kind === "saving"}>
              {status.kind === "saving"
                ? "Saving..."
                : onboarding
                ? "Save and show me hackathons"
                : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
