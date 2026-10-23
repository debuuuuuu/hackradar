import { useEffect, useState } from "react";
import { Link } from "react-router";
import AccountActions from "../components/AccountActions.js";
import BusyForm from "../components/BusyForm.js";
import NameForm from "../components/NameForm.js";
import PrefsForm from "../components/PrefsForm.js";
import RequireMe from "../components/RequireMe.js";

interface OwnProfile {
  handle: string | null;
  profilePublic: boolean;
  termsAcceptedAt: string | null;
}

function ProfileSection({ initialHandle }: { initialHandle: string | null }) {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/me/profile", { headers: { accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return (await res.json()) as OwnProfile;
      })
      .then(
        (p) => live && setProfile(p),
        () => live && setLoadError(true),
      );
    return () => {
      live = false;
    };
  }, []);

  // Fall back to handle from /api/me while profile is loading
  const handle = profile ? profile.handle : initialHandle;

  async function togglePublic() {
    if (!profile) return;
    const next = !profile.profilePublic;
    setToggling(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profilePublic: next }),
      });
      if (res.ok) {
        setProfile({ ...profile, profilePublic: next });
      }
    } finally {
      setToggling(false);
    }
  }

  if (loadError) {
    return (
      <p role="alert" className="notice">
        Could not load profile settings. Reload the page to try again.
      </p>
    );
  }

  return (
    <section
      className="card-paper"
      style={{ maxWidth: 1120, margin: "32px auto 0", padding: "24px 32px" }}
      aria-labelledby="profile-h"
    >
      <h2 className="h3" id="profile-h">
        Public profile
      </h2>
      <p className="hint">Control your handle and whether others can see your profile.</p>

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {handle ? (
          <>
            <p style={{ margin: 0 }}>
              <span style={{ color: "var(--ink-soft)", fontSize: 14 }}>Handle: </span>
              <strong style={{ fontFamily: "monospace" }}>@{handle}</strong>{" "}
              <Link to="/welcome" style={{ fontSize: 13, color: "var(--coral-deep)", marginLeft: 8 }}>
                Change handle
              </Link>
            </p>
            {profile?.profilePublic && (
              <p style={{ margin: 0 }}>
                <a
                  href={`/u/${handle}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "var(--coral-deep)", fontSize: 14 }}
                >
                  View public profile →
                </a>
              </p>
            )}
          </>
        ) : (
          <p style={{ margin: 0 }}>
            <span style={{ color: "var(--ink-soft)" }}>No handle set. </span>
            <Link to="/welcome" style={{ color: "var(--coral-deep)" }}>
              Set up your profile
            </Link>
          </p>
        )}

        <button
          type="button"
          className={profile?.profilePublic ? "switch on" : "switch"}
          aria-pressed={profile?.profilePublic ?? false}
          disabled={toggling || !profile}
          onClick={() => void togglePublic()}
        >
          <span className="track" aria-hidden="true" />
          {profile?.profilePublic ? "Profile is public" : "Profile is private"}
        </button>

        <p style={{ margin: 0, fontSize: 14, color: "var(--ink-soft)" }}>
          <Link to="/terms" style={{ color: "var(--coral-deep)" }}>
            Read our Terms of Service
          </Link>
        </p>
      </div>
    </section>
  );
}

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
          <section className="card-paper" style={{ maxWidth: 1120, margin: "32px auto 0", padding: "24px 32px" }} aria-labelledby="busy-h">
            <h2 className="h3" id="busy-h">
              Busy dates
            </h2>
            <p className="hint">In-person events that overlap these dates, or deadlines that fall inside them, are flagged and ranked lower.</p>
            <BusyForm />
          </section>
          <ProfileSection initialHandle={me.handle} />
          <AccountActions />
        </>
      )}
    </RequireMe>
  );
}
