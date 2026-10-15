import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

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
  // Read once, then keep in a ref so the token can be removed from the visible URL.
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
      // Full navigation so the header re-reads /api/me with the new cookie.
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
    <section className="signin">
      <h1>Confirm sign-in</h1>
      <p className="lead">One more click to finish signing in.</p>
      <button type="button" className="btn primary" disabled={busy} onClick={() => void confirm()}>
        Sign in
      </button>
    </section>
  );
}
