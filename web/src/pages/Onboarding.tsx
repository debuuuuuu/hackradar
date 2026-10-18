import { useState } from "react";
import NameForm from "../components/NameForm.js";
import PrefsForm from "../components/PrefsForm.js";
import RequireMe from "../components/RequireMe.js";

// Email-link and Discord accounts start with this placeholder, so we ask for a real name first.
const PLACEHOLDER_NAME = "Member";

export default function Onboarding() {
  const [named, setNamed] = useState(false);
  return (
    <RequireMe>
      {(me) =>
        me.name === PLACEHOLDER_NAME && !named ? (
          <section className="card-paper" style={{ maxWidth: 520, margin: "48px auto", padding: "24px 32px" }}>
            <h1 className="h2">Welcome! What should we call you?</h1>
            <p className="hint">We use it in your digests and reminders. You can change it later in Settings.</p>
            <NameForm initial="" submitLabel="Continue" onSaved={() => setNamed(true)} />
          </section>
        ) : (
          <PrefsForm mode="onboarding" />
        )
      }
    </RequireMe>
  );
}
