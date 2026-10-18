import { useState } from "react";

async function call(path: string, method: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Account controls on Settings: end all sessions, or delete the account and its data. */
export default function AccountActions() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Full navigation so the header re-reads /api/me and shows the signed-out state.
  async function run(path: string, method: string, body: unknown) {
    setBusy(true);
    setFailed(false);
    if (await call(path, method, body)) window.location.assign("/");
    else {
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <section className="card-paper" style={{ maxWidth: 1120, margin: "32px auto 0", padding: "24px 32px" }} aria-labelledby="acct-h">
      <h2 className="h3" id="acct-h">
        Your account
      </h2>
      <p className="hint">Signed in somewhere you don't trust? Sign out everywhere, then sign in again here.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "12px 0" }}>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void run("/api/auth/logout-all", "POST", {})}>
          Sign out everywhere
        </button>
        {!confirming ? (
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirming(true)}>
            Delete my account
          </button>
        ) : (
          <>
            <button type="button" className="btn solid" disabled={busy} onClick={() => void run("/api/me", "DELETE", { confirm: "delete" })}>
              Yes, delete everything
            </button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Keep my account
            </button>
          </>
        )}
      </div>
      {confirming && (
        <p className="hint" role="alert">
          This removes your picks, contact details and history for good. You can sign up again later, but you start empty.
        </p>
      )}
      {failed && (
        <p role="alert" className="notice">
          That did not work. Check your connection and try again.
        </p>
      )}
    </section>
  );
}
