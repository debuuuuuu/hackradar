import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import Icon from "../components/Icon.js";
import Monitor, { type MonitorMood } from "../components/Monitor.js";
import PasswordSignIn, { type SupabaseCfg } from "../components/PasswordSignIn.js";

export default function SignIn() {
  const [sp] = useSearchParams();
  const next = sp.get("next") ?? undefined;
  const errorCode = sp.get("error");
  const expired = errorCode === "expired";

  const [discord, setDiscord] = useState(false);
  const [google, setGoogle] = useState(false);
  const [password, setPassword] = useState<SupabaseCfg | null>(null);

  const [tab, setTab] = useState<"link" | "pw">("link");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "invalid" | "undeliverable" | "failed">("idle");
  const [mood, setMood] = useState<MonitorMood>("idle");

  useEffect(() => {
    let live = true;
    fetch("/api/auth/providers")
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { discord?: boolean; google?: boolean; password?: SupabaseCfg | null } | null) => {
        if (!live) return;
        setDiscord(p?.discord === true);
        setGoogle(p?.google === true);
        setPassword(p?.password?.url && p.password.anonKey ? p.password : null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const googleHref = `/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const discordHref = `/api/auth/discord/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/auth/email/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name, next }),
      });
      setState(res.ok ? "sent" : res.status === 400 ? "invalid" : res.status === 422 ? "undeliverable" : "failed");
    } catch {
      setState("failed");
    }
  }

  const lines: Record<string, string> = {
    idle: "Psst. Sign in and I'll find your next hackathon.",
    google: "One click? My favourite.",
    email: "Ooh, typing. I'll send you a magic link.",
    password: "I'm not looking. Promise.",
  };

  const currentSpeech = lines[mood] ?? lines.idle;

  return (
    <div className="signin-page wrap">
      {/* Decorative doodle */}
      <div className="doodle o1" style={{ width: 64, height: 64, left: -90, top: "20%" }} aria-hidden="true">
        <svg viewBox="0 0 40 40">
          <path className="ln" d="M20 35s-10-10-10-18a10 10 0 0 1 20 0c0 8-10 18-10 18zM16.5 17a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0" />
        </svg>
      </div>

      <section className="tablet grid-paper enter" aria-labelledby="si-h">
        <div className="in">
          <p className="pips" style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 0 14px", font: "19px var(--hand)", color: "#7a4b47" }}>
            <i className="on" style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--ink-red)", background: "var(--coral)", borderColor: "var(--coral-deep)", display: "inline-block" }}></i>
            <i style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--ink-red)", display: "inline-block" }}></i>
            <i style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--ink-red)", display: "inline-block" }}></i>
            step 1 of 3, about 2 minutes
          </p>

          <h1 className="h1" id="si-h" style={{ fontSize: "54px" }}>
            Hey, builder.
          </h1>
          <p className="lead" style={{ marginBottom: 20 }}>
            Sign in and we'll do the hackathon hunting. Browsing stays free without an account.
          </p>

          {expired && (
            <p className="notice" role="alert">
              That link has expired or was already used. Request a new one.
            </p>
          )}
          {errorCode === "state" && (
            <p className="notice" role="alert">
              That sign-in attempt expired. Please try again.
            </p>
          )}
          {errorCode === "discord" && (
            <p className="notice" role="alert">
              Discord sign-in did not complete. Please try again.
            </p>
          )}
          {errorCode === "google" && (
            <p className="notice" role="alert">
              Google sign-in did not complete. Please try again, or use an email link.
            </p>
          )}

          <div className="stack" style={{ display: "grid", gap: 14 }}>
            {google && (
              <a
                className="btn google wide"
                href={googleHref}
                onMouseEnter={() => setMood("google")}
                onMouseLeave={() => setMood("idle")}
                onFocus={() => setMood("google")}
                onBlur={() => setMood("idle")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 20, height: 20 }}>
                  <path className="ln" d="M20 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.5a3.9 3.9 0 0 1-1.7 2.5M12 20a8 8 0 1 1 5.4-13.9" />
                </svg>
                Continue with Google
              </a>
            )}

            {discord && (
              <a className="btn discord wide" href={discordHref}>
                <Icon name="discord" />
                Continue with Discord
              </a>
            )}

            <div className="or-fun">
              <svg className="squig" viewBox="0 0 180 16" preserveAspectRatio="none" aria-hidden="true">
                <path className="ln" d="M2 8c7.5-8 15 8 22.5 0s15 8 22.5 0 15 8 22.5 0 15 8 22.5 0 15 8 22.5 0 15 8 22.5 0 15 8 22.5 0" />
              </svg>
              <span className="or-stamp">or</span>
              <svg className="squig r" viewBox="0 0 180 16" preserveAspectRatio="none" aria-hidden="true">
                <path className="ln" d="M2 8c7.5-8 15 8 22.5 0s15 8 22.5 0 15 8 22.5 0 15 8 22.5 0 15 8 22.5 0 15 8 22.5 0 15 8 22.5 0" />
              </svg>
            </div>
            <p className="or-sub">use your email instead</p>

            {password && (
              <div className="tabs" role="tablist" aria-label="Email sign-in method" style={{ display: "flex", gap: 6, margin: "0 0 22px", borderBottom: "2px solid color-mix(in oklch, var(--ink-red) 30%, transparent)" }}>
                <button
                  type="button"
                  role="tab"
                  className={`tab ${tab === "link" ? "on" : ""}`}
                  aria-selected={tab === "link"}
                  onClick={() => setTab("link")}
                  style={{
                    minHeight: 46,
                    padding: "0 16px",
                    background: "none",
                    border: 0,
                    borderBottom: tab === "link" ? "3px solid var(--coral)" : "3px solid transparent",
                    marginBottom: -2,
                    font: "21px var(--hand)",
                    color: tab === "link" ? "var(--ink-red)" : "#7a4b47",
                    cursor: "pointer",
                  }}
                >
                  Magic link
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`tab ${tab === "pw" ? "on" : ""}`}
                  aria-selected={tab === "pw"}
                  onClick={() => setTab("pw")}
                  style={{
                    minHeight: 46,
                    padding: "0 16px",
                    background: "none",
                    border: 0,
                    borderBottom: tab === "pw" ? "3px solid var(--coral)" : "3px solid transparent",
                    marginBottom: -2,
                    font: "21px var(--hand)",
                    color: tab === "pw" ? "var(--ink-red)" : "#7a4b47",
                    cursor: "pointer",
                  }}
                >
                  Password
                </button>
              </div>
            )}

            {tab === "link" ? (
              state === "sent" ? (
                <div className="notice" role="status">
                  Check your inbox. A sign-in link is on its way and works once for 15 minutes.
                </div>
              ) : (
                <form onSubmit={submit} className="stack" style={{ display: "grid", gap: 14 }}>
                  <label className="field">
                    What should we call you?
                    <input
                      type="text"
                      placeholder="Your name (new here? we'll use it)"
                      autoComplete="given-name"
                      maxLength={40}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Email
                    <input
                      type="email"
                      placeholder="you@college.edu"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setMood("email")}
                      onBlur={() => setMood("idle")}
                    />
                  </label>
                  <button type="submit" className="btn solid wide" disabled={state === "sending"}>
                    {state === "sending" ? "Sending..." : "Send the magic link"}
                    <Icon name="plane" className="plane" />
                  </button>
                  <p className="field" style={{ margin: 0 }}>
                    <span className="hint">Works once, expires in 15 minutes. No password to forget.</span>
                  </p>
                  {state === "invalid" && (
                    <p className="notice" role="alert">
                      Enter a valid email address.
                    </p>
                  )}
                  {state === "undeliverable" && (
                    <p className="notice" role="alert">
                      We could not send to that address. Check it for typos.
                    </p>
                  )}
                  {state === "failed" && (
                    <p className="notice" role="alert">
                      We could not send the email just now. Try again in a minute.
                    </p>
                  )}
                </form>
              )
            ) : password ? (
              <PasswordSignIn
                cfg={password}
                next={next}
                onFocusEmail={() => setMood("email")}
                onFocusPassword={() => setMood("password")}
                onBlur={() => setMood("idle")}
              />
            ) : null}
          </div>
        </div>
      </section>

      {/* Mascot pal with speech bubble and reactions */}
      <div className="pal" style={{ display: "grid", justifyItems: "center", gap: 18, position: "relative" }}>
        <span className="star s1" style={{ position: "absolute", left: "4%", top: "2%", width: 26, height: 26, color: "var(--coral-text)" }} aria-hidden="true">
          <svg viewBox="0 0 24 24"><path className="ln" d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /></svg>
        </span>
        <span className="star s2" style={{ position: "absolute", right: "8%", top: "18%", width: 26, height: 26, color: "var(--coral-text)" }} aria-hidden="true">
          <svg viewBox="0 0 24 24"><path className="ln" d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /></svg>
        </span>
        <span className="star s3" style={{ position: "absolute", left: "12%", top: "46%", width: 26, height: 26, color: "var(--coral-text)" }} aria-hidden="true">
          <svg viewBox="0 0 24 24"><path className="ln" d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" /></svg>
        </span>

        <Monitor size={220} mood={mood} />

        <p
          className="talk"
          aria-live="polite"
          style={{
            position: "relative",
            margin: 0,
            maxWidth: 300,
            background: "var(--cream)",
            color: "var(--ink)",
            font: "24px/1.25 var(--hand)",
            padding: "16px 20px",
            borderRadius: 20,
            boxShadow: "0 14px 30px -14px rgb(0 0 0 / 0.7)",
            textAlign: "center",
          }}
        >
          {currentSpeech}
        </p>

        <p className="memo ruled torn" style={{ position: "relative", background: "#fbf5ec", padding: "28px 20px 20px", font: "21px/28px var(--hand)", color: "var(--ink)", maxWidth: 280, boxShadow: "0 18px 36px -16px rgb(0 0 0 / 0.7)", margin: 0, transform: "rotate(3deg)" }}>
          <span className="tape" />
          One message a morning, at most. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}
