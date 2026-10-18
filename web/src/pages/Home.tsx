import { Navigate } from "react-router";
import type { MeState } from "../lib/me.js";
import Landing from "./Landing.js";
import Today from "./Today.js";

/**
 * Signed out: Landing page with Hero, How it works, Open right now (real API), Checklist, Morning message.
 * Signed in but not onboarded: Redirect to /welcome.
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
    return <Navigate to="/welcome" replace />;
  }

  return <Today name={state.me.name} />;
}
