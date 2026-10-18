import { useEffect, useState, type FormEvent } from "react";
import Icon from "./Icon.js";

export interface SupabaseCfg {
  url: string;
  anonKey: string;
}

type Mode = "signin" | "signup" | "forgot" | "newpassword";
const MIN_PASSWORD = 8;

async function gotrue(
  cfg: SupabaseCfg,
  path: string,
  init: { method: string; body: unknown; token?: string },
): Promise<Response> {
  return fetch(`${cfg.url}/auth/v1${path}`, {
    method: init.method,
    headers: {
      apikey: cfg.anonKey,
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: JSON.stringify(init.body),
  });
}

/** Hands a Supabase access token to our server, which checks it and sets our own session cookie. */
async function startSession(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/supabase/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Tokens or an error that Supabase puts in the URL fragment when someone follows an emailed link. */
function readHash(): URLSearchParams | null {
  const h = window.location.hash.replace(/^#/, "");
  return h.includes("access_token=") || h.includes("error=") ? new URLSearchParams(h) : null;
}

interface PasswordSignInProps {
  cfg: SupabaseCfg;
  next: string | undefined;
  onFocusEmail?: () => void;
  onFocusPassword?: () => void;
  onBlur?: () => void;
}

export default function PasswordSignIn({
  cfg,
  next,
  onFocusEmail,
  onFocusPassword,
  onBlur,
}: PasswordSignInProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);

  const land = () =>
    window.location.assign(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
  const failed = (text: string) => setNote({ kind: "err", text });

  async function finish(token: string) {
    if (await startSession(token)) land();
    else failed("We could not sign you in. Try again, or use an email link.");
  }

  // Returning from the confirm or reset link in an email: the token is in the URL fragment.
  useEffect(() => {
    const p = readHash();
    if (!p) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    const token = p.get("access_token");
    if (p.get("error") || !token) {
      failed("That link has expired or was already used. Sign in, or ask for a new one.");
    } else if (p.get("type") === "recovery") {
      setRecoveryToken(token);
      setMode("newpassword");
    } else {
      setBusy(true);
      setNote({ kind: "ok", text: "Email confirmed. Signing you in." });
      void finish(token);
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setNote(null);
    if ((mode === "signup" || mode === "newpassword") && password.length < MIN_PASSWORD) {
      return failed(`Use at least ${MIN_PASSWORD} characters for the password.`);
    }
    setBusy(true);
    try {
      const redirect = encodeURIComponent(`${window.location.origin}/signin`);
      if (mode === "signin") {
        const res = await gotrue(cfg, "/token?grant_type=password", {
          method: "POST",
          body: { email: email.trim(), password },
        });
        if (res.status === 429) return failed("Too many tries. Wait a minute and try again.");
        const body = (await res.json().catch(() => ({}))) as { access_token?: string };
        if (!res.ok || !body.access_token)
          return failed("That email and password do not match, or the email is not confirmed yet.");
        await finish(body.access_token);
      } else if (mode === "signup") {
        const res = await gotrue(cfg, `/signup?redirect_to=${redirect}`, {
          method: "POST",
          body: { email: email.trim(), password },
        });
        if (res.status === 429) return failed("Too many tries. Wait a minute and try again.");
        if (!res.ok) return failed("We could not create that account. Check the email address and try again.");
        const body = (await res.json().catch(() => ({}))) as { access_token?: string };
        if (body.access_token) await finish(body.access_token);
        else setNote({ kind: "ok", text: "Check your inbox and press the confirm link. Then come back and sign in." });
      } else if (mode === "forgot") {
        const res = await gotrue(cfg, `/recover?redirect_to=${redirect}`, {
          method: "POST",
          body: { email: email.trim() },
        });
        if (res.status === 429) return failed("Too many tries. Wait a minute and try again.");
        setNote({ kind: "ok", text: "If that address has an account, a reset link is on its way." });
      } else if (mode === "newpassword" && recoveryToken) {
        const res = await gotrue(cfg, "/user", {
          method: "PUT",
          body: { password },
          token: recoveryToken,
        });
        if (!res.ok) return failed("We could not save the new password. Ask for a new reset link.");
        await finish(recoveryToken);
      }
    } catch {
      failed("We could not reach the sign-in service. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const action = {
    signin: "Let me in",
    signup: "Create account",
    forgot: "Send reset link",
    newpassword: "Save password",
  }[mode];

  return (
    <form onSubmit={submit} className="stack" aria-label="Password sign-in">
      {mode !== "newpassword" && (
        <label className="field">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@college.edu"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={onFocusEmail}
            onBlur={onBlur}
          />
        </label>
      )}

      {mode !== "forgot" && (
        <label className="field">
          {mode === "newpassword" ? "New password" : "Password"}
          <input
            type="password"
            name="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder={mode === "signin" ? "Your password" : `At least ${MIN_PASSWORD} characters`}
            required
            minLength={mode === "signin" ? undefined : MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onFocus={onFocusPassword}
            onBlur={onBlur}
          />
        </label>
      )}

      <button type="submit" className="btn solid wide" disabled={busy}>
        {action}
        <Icon name="plane" className="plane" />
      </button>

      {note && (
        <p className="notice" role={note.kind === "err" ? "alert" : "status"}>
          {note.text}
        </p>
      )}

      {mode !== "newpassword" && (
        <div className="links">
          {mode !== "signin" && (
            <button
              type="button"
              className="btn ghost"
              style={{ paddingInline: 8, minHeight: 36, border: "none", color: "var(--ink-red)" }}
              onClick={() => {
                setMode("signin");
                setNote(null);
              }}
            >
              Back to sign in
            </button>
          )}
          {mode === "signin" && (
            <>
              <button
                type="button"
                className="btn ghost"
                style={{ paddingInline: 8, minHeight: 36, border: "none", color: "var(--ink-red)", cursor: "pointer" }}
                onClick={() => {
                  setMode("signup");
                  setNote(null);
                }}
              >
                Create an account
              </button>
              <button
                type="button"
                className="btn ghost"
                style={{ paddingInline: 8, minHeight: 36, border: "none", color: "var(--ink-red)", cursor: "pointer" }}
                onClick={() => {
                  setMode("forgot");
                  setNote(null);
                }}
              >
                Forgot password?
              </button>
            </>
          )}
        </div>
      )}
    </form>
  );
}
