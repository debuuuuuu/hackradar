import { Link } from "react-router";
import Monitor from "./Monitor.js";

export default function Footer() {
  return (
    <footer className="site-foot">
      {/* Marquee ticker of sources */}
      <div className="ticker" aria-label="Sources we check">
        <div className="track">
          <span>Devpost</span>
          <span>Unstop</span>
          <span>Devfolio</span>
          <span>MLH</span>
          <span>Luma</span>
          <span>LinkedIn and X posts</span>
          <span>checked every morning</span>
          <span aria-hidden="true">Devpost</span>
          <span aria-hidden="true">Unstop</span>
          <span aria-hidden="true">Devfolio</span>
          <span aria-hidden="true">MLH</span>
          <span aria-hidden="true">Luma</span>
          <span aria-hidden="true">LinkedIn and X posts</span>
          <span aria-hidden="true">checked every morning</span>
        </div>
      </div>

      {/* Hand-drawn coral wave */}
      <svg className="foot-wave" viewBox="0 0 1200 28" preserveAspectRatio="none" aria-hidden="true">
        <path
          className="ln"
          d="M0 14c40-14 80 14 120 0s80 14 120 0 80 14 120 0 80 14 120 0 80 14 120 0 80 14 120 0 80 14 120 0 80 14 120 0 80 14 120 0 80 14 120 0 80 14 120 0"
        />
      </svg>

      <div className="foot-grid">
        <div className="foot-brand">
          <Link to="/">
            <Monitor size={34} mood="idle" />
            HackRadar
          </Link>
          <p>
            Hackathons near you, every morning. Made in Pune for people who build on <b>weekends</b>.
          </p>
        </div>

        <nav aria-label="Explore">
          <h2 className="foot-h">Explore</h2>
          <ul className="foot-links">
            <li>
              <a href="/#how">How it works</a>
            </li>
            <li>
              <Link to="/events">Open hackathons</Link>
            </li>
            <li>
              <Link to="/leaderboard">Leaderboard</Link>
            </li>
            <li>
              <Link to="/settings">Your picks</Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Messages">
          <h2 className="foot-h">Messages</h2>
          <ul className="foot-links">
            <li>
              <a href="/#morning">See a sample</a>
            </li>
            <li>
              <Link to="/settings">Change channels</Link>
            </li>
            <li>
              <Link to="/settings">Unsubscribe</Link>
            </li>
          </ul>
        </nav>

        <div className="foot-doodle">
          <Monitor size={92} sleepy />
          <span>next list lands around 5 AM IST</span>
        </div>
      </div>

      <div className="foot-base">
        <span>Dates and prizes come from the source, never from AI.</span>
        <span>Free · no card · one message a morning at most</span>
      </div>
    </footer>
  );
}
