import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import Monitor from "../components/Monitor.js";

/** True unless /api/me says the new user has not finished setup (any failure keeps the normal landing). */
async function isOnboarded(): Promise<boolean> {
  try {
    const res = await fetch("/api/me", { headers: { accept: "application/json" } });
    return res.ok ? ((await res.json()) as { onboarded?: boolean }).onboarded !== false : true;
  } catch {
    return true;
  }
}

export default function ConfirmSignIn() {
  const [sp] = useSearchParams();
  const params = useRef({ token: sp.get("token") ?? "", next: sp.get("next") ?? "/" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.history.replaceState(null, "", "/signin/confirm");
  }, []);

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/email/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(params.current),
      });
      const data = res.ok ? ((await res.json()) as { next?: string }) : null;
      if (!data?.next) {
        window.location.assign("/signin?error=expired");
        return;
      }
      window.location.assign(data.next === "/" && !(await isOnboarded()) ? "/welcome" : data.next);
    } catch {
      window.location.assign("/signin?error=expired");
    }
  }

  return (
    <div style={{ maxWidth: 580, margin: "48px auto 96px" }}>
      <section className="tablet grid-paper enter" aria-labelledby="confirm-h">
        <div className="in" style={{ textAlign: "center", display: "grid", justifyItems: "center", gap: 16 }}>
          <Monitor size={80} mood="happy" />
          <h1 className="h1" id="confirm-h" style={{ margin: 0 }}>
            Confirm sign-in
          </h1>
          <p className="lead" style={{ margin: 0 }}>
            One more click to finish signing in.
          </p>
          <button
            type="button"
            className="btn solid wide"
            disabled={busy}
            onClick={() => void confirm()}
            style={{ marginTop: 12 }}
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </div>
      </section>
    </div>
  );
}
