import { Link } from "react-router";

export default function Terms() {
  return (
    <div
      className="page"
      style={{
        maxWidth: 680,
        margin: "0 auto 96px",
        padding: "0 16px",
      }}
    >
      <header
        className="fade-in"
        style={{ margin: "48px 0 40px" }}
      >
        <h1 className="h1" style={{ color: "var(--chalk)", margin: "0 0 8px" }}>
          Terms of Service
        </h1>
        <p style={{ font: "20px/1.4 var(--hand)", color: "var(--coral-text)", margin: 0 }}>
          Short, plain language. No surprises.
        </p>
      </header>

      <div
        className="card-paper"
        style={{
          padding: "32px 36px",
          borderRadius: 16,
          border: "1.5px solid var(--line-dark)",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <section>
          <h2 className="h3" style={{ color: "var(--chalk)", margin: "0 0 8px" }}>
            Who this is for
          </h2>
          <p style={{ color: "var(--mute)", lineHeight: 1.6, margin: 0 }}>
            HackRadar is a hackathon discovery tool for users who are{" "}
            <strong style={{ color: "var(--chalk)" }}>18 or older</strong>.
            By creating an account or setting a public profile, you confirm that you meet this age requirement.
          </p>
        </section>

        <section>
          <h2 className="h3" style={{ color: "var(--chalk)", margin: "0 0 8px" }}>
            Public profile
          </h2>
          <p style={{ color: "var(--mute)", lineHeight: 1.6, margin: 0 }}>
            Public profiles are <strong style={{ color: "var(--chalk)" }}>opt-in</strong>.
            When you enable your public profile, your name, handle, and participation activity
            (events registered for, submitted, won) will be visible to{" "}
            <strong style={{ color: "var(--chalk)" }}>anyone with your profile link</strong>.
            No email addresses or private settings are ever shown publicly.
          </p>
        </section>

        <section>
          <h2 className="h3" style={{ color: "var(--chalk)", margin: "0 0 8px" }}>
            Your data
          </h2>
          <p style={{ color: "var(--mute)", lineHeight: 1.6, margin: 0 }}>
            You can{" "}
            <strong style={{ color: "var(--chalk)" }}>disable or delete your profile</strong>{" "}
            at any time from{" "}
            <Link to="/settings" style={{ color: "var(--coral-text)", textDecoration: "underline" }}>
              Settings
            </Link>
            . Disabling your profile makes it private immediately. Deleting your account removes all
            your data from HackRadar permanently.
          </p>
        </section>

        <section>
          <h2 className="h3" style={{ color: "var(--chalk)", margin: "0 0 8px" }}>
            What we collect
          </h2>
          <p style={{ color: "var(--mute)", lineHeight: 1.6, margin: 0 }}>
            We store your email address, name, notification preferences, and the events you save or
            register for. We do not sell your data or share it with third parties.
          </p>
        </section>

        <section>
          <h2 className="h3" style={{ color: "var(--chalk)", margin: "0 0 8px" }}>
            Event data
          </h2>
          <p style={{ color: "var(--mute)", lineHeight: 1.6, margin: 0 }}>
            HackRadar collects publicly available hackathon listings. Dates and prizes are sourced
            directly from the platforms — we do not fabricate them. We are not affiliated with any
            hackathon organiser listed.
          </p>
        </section>
      </div>

      <div style={{ marginTop: 32, display: "flex", gap: 12 }}>
        <Link to="/" className="btn ghost">
          ← Back to hackathons
        </Link>
      </div>
    </div>
  );
}
