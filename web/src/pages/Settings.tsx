import { useState } from "react";
import AccountActions from "../components/AccountActions.js";
import NameForm from "../components/NameForm.js";
import PrefsForm from "../components/PrefsForm.js";
import RequireMe from "../components/RequireMe.js";

export default function Settings() {
  const [saved, setSaved] = useState(false);
  return (
    <RequireMe>
      {(me) => (
        <>
          <PrefsForm mode="settings" name={me.name} />
          <section className="card-paper" style={{ maxWidth: 1120, margin: "32px auto 0", padding: "24px 32px" }} aria-labelledby="name-h">
            <h2 className="h3" id="name-h">
              Your name
            </h2>
            <p className="hint">Shown in the app and in your digests and reminders.</p>
            <div style={{ maxWidth: 420 }}>
              <NameForm initial={me.name === "Member" ? "" : me.name} submitLabel="Save name" onSaved={() => setSaved(true)} />
            </div>
            {saved && <p className="hint" role="status">Saved. It shows everywhere after you reload.</p>}
          </section>
          <AccountActions />
        </>
      )}
    </RequireMe>
  );
}
