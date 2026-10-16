import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router";
import type { MeState } from "../lib/me.js";
import type { PrefsResponse } from "../lib/prefsForm.js";
import Events from "./Events.js";

/** Signed out: landing with the public events below it. Signed in but not onboarded: onboarding. Otherwise: the personal feed. */
export default function Home({ state }: { state: MeState }) {
  if (state.status === "loading") return <p>Loading</p>;
  if (state.status === "out")
    return (
      <>
        <Landing />
        <Events heading="Open hackathons right now" />
      </>
    );
  if (!state.me.onboarded) return <Navigate to="/welcome" replace />;
  return <Today name={state.me.name} />;
}

function Landing() {
  return (
    <section className="hero">
      <h1>Never miss a hackathon you would actually want.</h1>
      <p className="lead">
        HackRadar checks Devpost, Unstop and Devfolio every day, keeps what is near you and fits your interests, and sends it
        to Discord, WhatsApp or email. Free, no passwords. Browse everything below without an account; sign in to get picks made for you.
      </p>
      <Link to="/signin" className="btn primary">
        Sign in for personal picks
      </Link>
      <ol className="steps">
        <li>
          <strong>Sign in</strong> with Discord or a one-time email link.
        </li>
        <li>
          <strong>Tell us what you like</strong>: city, distance, topics, where to reach you.
        </li>
        <li>
          <strong>Get your picks</strong> each morning, with dates straight from the source.
        </li>
      </ol>
    </section>
  );
}

function Today({ name }: { name: string }) {
  const [defaults, setDefaults] = useState<{ place: string; radius: number } | null>(null);

  useEffect(() => {
    fetch("/api/me/prefs", { headers: { accept: "application/json" } })
      .then(async (res) => (res.ok ? ((await res.json()) as PrefsResponse).prefs : null))
      .then(
        (p) => setDefaults(p && p.format !== "online" && p.radiusKm < 3000 ? { place: p.homeCity, radius: p.radiusKm } : { place: "", radius: 150 }),
        () => setDefaults({ place: "", radius: 150 }),
      );
  }, []);

  if (!defaults) return <p>Loading</p>;
  return <Events heading={`Today, ${name.split(" ")[0]}`} defaults={defaults} />;
}
