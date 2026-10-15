import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";

export default function SignIn() {
  const [sp] = useSearchParams();
  const next = sp.get("next") ?? undefined;
  const expired = sp.get("error") === "expired";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "invalid" | "failed">("idle");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    try {
      const res = await fetch("/api/auth/email/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      setState(res.ok ? "sent" : res.status === 400 ? "invalid" : "failed");
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
      {state === "sent" ? (
        <p className="notice" role="status">
          If that address can receive mail, a sign-in link is on its way. It works once and expires in 15 minutes.
        </p>
      ) : (
        <form onSubmit={submit} className="signin-form">
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
          {state === "failed" && (
            <p className="notice" role="alert">
              Something went wrong. Try again in a moment.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
