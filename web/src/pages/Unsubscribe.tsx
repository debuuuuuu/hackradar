import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import Monitor from "../components/Monitor.js";

type State = "ask" | "busy" | "done" | "failed";

/** The page behind the unsubscribe link in our emails. Only the button deletes: link scanners just load this page. */
export default function Unsubscribe() {
  const [sp] = useSearchParams();
  const token = useRef(sp.get("token") ?? "");
  const [state, setState] = useState<State>("ask");

  useEffect(() => {
    window.history.replaceState(null, "", "/unsubscribe");
  }, []);

  async function confirm() {
    setState("busy");
    try {
      const res = await fetch("/api/auth/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.current }),
      });
      setState(res.ok ? "done" : "failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <div style={{ maxWidth: 580, margin: "48px auto 96px" }}>
      <section className="tablet grid-paper enter" aria-labelledby="unsub-h">
        <div className="in" style={{ textAlign: "center", display: "grid", justifyItems: "center", gap: 16 }}>
          <Monitor size={80} mood={state === "done" ? "happy" : "idle"} />
          {state === "done" ? (
            <>
              <h1 className="h1" id="unsub-h" style={{ margin: 0 }}>
                Done. I'll miss you.
              </h1>
              <p className="lead" style={{ margin: 0 }}>
                Your account and everything saved with it are gone. No more emails.
              </p>
              <Link to="/" className="btn ghost">
                Back to the site
              </Link>
            </>
          ) : (
            <>
              <h1 className="h1" id="unsub-h" style={{ margin: 0 }}>
                Leave HackRadar?
              </h1>
              <p className="lead" style={{ margin: 0 }}>
                This stops every email and deletes your account, your picks and your history for good. You can sign up again later, but you start empty.
              </p>
              <button type="button" className="btn solid wide" disabled={state === "busy"} onClick={() => void confirm()} style={{ marginTop: 12 }}>
                {state === "busy" ? "Deleting..." : "Unsubscribe and delete my account"}
              </button>
              <Link to="/" className="btn ghost">
                Keep my account
              </Link>
              {state === "failed" && (
                <p role="alert" className="notice">
                  That link is not valid or something went wrong. Open the link from your latest email, or delete your account in Settings.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
