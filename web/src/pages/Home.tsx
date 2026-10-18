import { Link } from "react-router";
import type { MeState } from "../lib/me.js";
import Landing from "./Landing.js";
import Today from "./Today.js";

/**
 * Signed out: Landing page with Hero, How it works, Open right now (real API), Checklist, Morning message.
 * Signed in but not onboarded: the same landing page with a "Finish setup" banner (setup is never forced).
 * Signed in and onboarded: Personal Today feed.
 */
export default function Home({ state }: { state: MeState }) {
  if (state.status === "loading") {
    return (
      <div style={{ maxWidth: 1120, margin: "60px auto", textAlign: "center" }}>
        <p className="lead dark">Loading HackRadar...</p>
      </div>
    );
  }

  if (state.status === "out") {
    return <Landing />;
  }

  if (!state.me.onboarded) {
    const hello = state.me.name === "Member" ? "Welcome!" : `Welcome, ${state.me.name}!`;
    return (
      <>
        <p className="notice" role="status" style={{ maxWidth: 1120, margin: "16px auto 0", textAlign: "center" }}>
          {hello} Pick what you want to hear about and your daily digest starts.{" "}
          <Link to="/welcome">Finish setup</Link>
        </p>
        <Landing />
      </>
    );
  }

  return <Today name={state.me.name} />;
}
