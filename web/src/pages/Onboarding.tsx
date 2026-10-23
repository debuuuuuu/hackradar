import { useEffect, useRef, useState, type FormEvent } from "react";
import NameForm from "../components/NameForm.js";
import PrefsForm from "../components/PrefsForm.js";
import RequireMe from "../components/RequireMe.js";

// Email-link and Discord accounts start with this placeholder, so we ask for a real name first.
const PLACEHOLDER_NAME = "Member";

const HANDLE_RE = /^[a-z][a-z0-9-]{2,29}$/;
const RESERVED = new Set(["admin", "api", "u", "leaderboard", "terms", "settings", "events", "signin"]);

type CheckState = "idle" | "checking" | "available" | "taken" | "invalid";

function HandleStep() {
  const [handle, setHandle] = useState("");
  const [terms, setTerms] = useState(false);
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function validate(h: string): boolean {
    return HANDLE_RE.test(h) && !RESERVED.has(h);
  }

  function handleChange(h: string) {
    setHandle(h);
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!h.trim()) {
      setCheckState("idle");
      return;
    }
    if (!validate(h)) {
      setCheckState("invalid");
      return;
    }
    setCheckState("checking");
    debounceRef.current = setTimeout(() => {
      void checkHandle(h);
    }, 400);
  }

  async function checkHandle(h: string) {
    try {
      const res = await fetch(`/api/profile/handle-check?q=${encodeURIComponent(h)}`, {
        headers: { accept: "application/json" },
      });
      const body = (await res.json()) as { available: boolean };
      setCheckState(body.available ? "available" : "taken");
    } catch {
      setCheckState("idle");
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!validate(handle) || checkState !== "available" || !terms) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle, termsAccepted: true }),
      });
      if (res.ok) {
        window.location.assign("/");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Could not save. Try a different handle.");
    } catch {
      setError("Could not save. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const checkHint =
    checkState === "checking"
      ? "Checking…"
      : checkState === "available"
      ? "Available ✓"
      : checkState === "taken"
      ? "Taken ✗"
      : checkState === "invalid" && handle.trim()
      ? "3–30 chars, lowercase letters, numbers, hyphens, must start with a letter."
      : "";

  const checkColor =
    checkState === "available"
      ? "var(--coral-deep)"
      : checkState === "taken" || checkState === "invalid"
      ? "var(--ink-red)"
      : "var(--mute)";

  const canSubmit = validate(handle) && checkState === "available" && terms && !submitting;

  return (
    <section
      className="card-paper"
      style={{ maxWidth: 520, margin: "48px auto", padding: "24px 32px" }}
    >
      <p className="eyebrow" style={{ color: "var(--mute)", marginBottom: 4 }}>
        Step 3 of 3
      </p>
      <h1 className="h2" style={{ marginBottom: 8 }}>
        Claim your handle
      </h1>
      <p className="hint">
        Your public profile will live at{" "}
        <strong>hackradar.in/u/{handle || "your-handle"}</strong>. You can change it later.
      </p>

      <form onSubmit={(e) => void submit(e)} noValidate>
        <label className="field" style={{ marginTop: 20 }}>
          Handle
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="your-handle"
            value={handle}
            onChange={(e) => handleChange(e.target.value.toLowerCase())}
            style={{ fontFamily: "monospace" }}
          />
          {checkHint && (
            <span className="hint" style={{ color: checkColor }} aria-live="polite">
              {checkHint}
            </span>
          )}
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            marginTop: 20,
            cursor: "pointer",
            font: "15px/1.5 var(--sans)",
            color: "var(--ink)",
          }}
        >
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>
            I am 18 or older and agree to the{" "}
            <a href="/terms" target="_blank" rel="noreferrer" style={{ color: "var(--coral-deep)" }}>
              Terms of Service
            </a>
            .
          </span>
        </label>

        {error && (
          <p role="alert" style={{ color: "var(--ink-red)", fontWeight: 600, marginTop: 12 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 24 }}>
          <button className="btn solid" type="submit" disabled={!canSubmit}>
            {submitting ? "Saving…" : "Save and continue"}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              sessionStorage.setItem("hr_handle_nudge_shown", "1");
              window.location.assign("/");
            }}
          >
            I'll do this later
          </button>
        </div>
      </form>
    </section>
  );
}

type Step = "name" | "prefs" | "handle";

export default function Onboarding() {
  const [step, setStep] = useState<Step | null>(null);

  return (
    <RequireMe>
      {(me) => {
        // Determine initial step from me if not yet set
        const resolvedStep: Step =
          step !== null
            ? step
            : me.name === PLACEHOLDER_NAME
            ? "name"
            : me.handle !== null
            ? "prefs" // already has handle — treat prefs as the active step (edge case)
            : "prefs"; // normal: name done, do prefs then handle

        if (resolvedStep === "name" && step === null) {
          // use effect-free inline init: show NameForm
        }

        if (resolvedStep === "name") {
          return (
            <section
              className="card-paper"
              style={{ maxWidth: 520, margin: "48px auto", padding: "24px 32px" }}
            >
              <p className="eyebrow" style={{ color: "var(--mute)", marginBottom: 4 }}>
                Step 1 of 3
              </p>
              <h1 className="h2">Welcome! What should we call you?</h1>
              <p className="hint">
                We use it in your digests and reminders. You can change it later in Settings.
              </p>
              <NameForm
                initial=""
                submitLabel="Continue"
                onSaved={() => setStep("prefs")}
              />
            </section>
          );
        }

        if (resolvedStep === "prefs") {
          return (
            <PrefsForm
              mode="onboarding"
              onDone={() => setStep("handle")}
            />
          );
        }

        return <HandleStep />;
      }}
    </RequireMe>
  );
}
