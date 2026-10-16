import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import PasswordSignIn, { type SupabaseCfg } from "../components/PasswordSignIn.js";

export default function SignIn() {
  const [sp] = useSearchParams();
  const next = sp.get("next") ?? undefined;
  const errorCode = sp.get("error");
  const expired = errorCode === "expired";
  const [discord, setDiscord] = useState(false);
  const [google, setGoogle] = useState(false);
  const [password, setPassword] = useState<SupabaseCfg | null>(null);

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
  const discordHref = `/api/auth/discord/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const googleHref = `/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "invalid" | "undeliverable" | "failed">("idle");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/auth/email/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      setState(res.ok ? "sent" : res.status === 400 ? "invalid" : res.status === 422 ? "undeliverable" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <section className="signin">
      <h1>Sign in</h1>
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
      {(google || discord) && state !== "sent" && (
        <div className="signin-alt">
          {google && (
            <a className="btn primary" href={googleHref}>
              Continue with Google
            </a>
          )}
          {discord && (
            <a className="btn primary" href={discordHref}>
              Continue with Discord
            </a>
          )}
          <p className="signin-or">or</p>
        </div>
      )}
      {password && state !== "sent" && (
        <>
          <PasswordSignIn cfg={password} next={next} />
          <p className="signin-or">or</p>
        </>
      )}
      {state === "sent" ? (
        <p className="notice" role="status">
          Check your inbox. A sign-in link is on its way and works once for 15 minutes. If it has not arrived after a few minutes,
          look in spam, or go back and check the address for typos.
        </p>
      ) : (
        <form onSubmit={submit} className="signin-form">
          {password && <h2>Get a one-time sign-in link</h2>}
          <label className="field grow">
            Email address
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" className="btn primary" disabled={state === "sending"}>
            Email me a sign-in link
          </button>
          {state === "invalid" && (
            <p className="notice" role="alert">
              Enter a valid email address.
            </p>
          )}
          {state === "undeliverable" && (
            <p className="notice" role="alert">
              We could not send to that address. Check it for typos, such as a missing letter in the domain, and try again.
            </p>
          )}
          {state === "failed" && (
            <p className="notice" role="alert">
              We could not send the email just now. Try again in a minute.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
