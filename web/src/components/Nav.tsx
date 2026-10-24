import { Link, useLocation } from "react-router";
import type { MeState } from "../lib/me.js";
import Monitor from "./Monitor.js";
import Quip, { useQuip } from "./Quip.js";

interface NavProps {
  state: MeState;
  signOut: () => Promise<void>;
}

export default function Nav({ state, signOut }: NavProps) {
  const loc = useLocation();
  const { quipText, quipOn, sayNow } = useQuip();

  const isHere = (path: string) => {
    if (path === "/") return loc.pathname === "/";
    return loc.pathname.startsWith(path);
  };

  const loopSvg = (
    <svg className="loop" viewBox="0 0 120 50" preserveAspectRatio="none" aria-hidden="true">
      <path className="ln" d="M10 30C8 12 60 4 104 14c16 4 14 24-8 28-34 7-82 4-88-12C4 18 34 6 70 8" />
    </svg>
  );

  return (
    <nav className="nav" aria-label="Main">
      <Quip text={quipText} show={quipOn} />

      <Link
        className={`brand ${quipOn ? "talking" : ""}`}
        to="/"
        onMouseEnter={sayNow}
        aria-label="HackRadar home"
      >
        <Monitor className="pc" />
        HackRadar
      </Link>

      {state.status === "in" ? (
        <>
          <Link
            className={`navlink ${isHere("/") && loc.pathname === "/" ? "here" : ""}`}
            to="/"
            aria-current={loc.pathname === "/" ? "page" : undefined}
          >
            <span>today</span>
            {loopSvg}
            <em className="cap">picked for you</em>
          </Link>
          <Link
            className={`navlink ${isHere("/my-events") ? "here" : ""}`}
            to="/my-events"
            aria-current={isHere("/my-events") ? "page" : undefined}
          >
            <span>my events</span>
            {loopSvg}
            <em className="cap">saved and went</em>
          </Link>
          <Link
            className={`navlink ${isHere("/leaderboard") ? "here" : ""}`}
            to="/leaderboard"
            aria-current={isHere("/leaderboard") ? "page" : undefined}
          >
            <span>leaderboard</span>
            {loopSvg}
            <em className="cap">top hackers</em>
          </Link>
          {state.me.handle && (
            <Link
              className={`navlink ${isHere(`/u/${state.me.handle}`) ? "here" : ""}`}
              to={`/u/${state.me.handle}`}
              aria-current={isHere(`/u/${state.me.handle}`) ? "page" : undefined}
            >
              <span>my profile</span>
              {loopSvg}
              <em className="cap">public page</em>
            </Link>
          )}
          <Link
            className={`navlink ${isHere("/settings") || isHere("/welcome") ? "here" : ""}`}
            to={state.me.onboarded ? "/settings" : "/welcome"}
            aria-current={isHere("/settings") || isHere("/welcome") ? "page" : undefined}
          >
            <span>your picks</span>
            {loopSvg}
            <em className="cap">change anytime</em>
          </Link>
          {state.me.isAdmin && (
            <Link
              className={`navlink ${isHere("/admin") ? "here" : ""}`}
              to="/admin"
              aria-current={isHere("/admin") ? "page" : undefined}
            >
              <span>admin</span>
              {loopSvg}
              <em className="cap">owner only</em>
            </Link>
          )}
          <button
            type="button"
            className="navlink pill"
            onClick={() => void signOut()}
            style={{ background: "none", cursor: "pointer", font: "inherit" }}
          >
            <span>sign out</span>
            <em className="cap">see you tomorrow</em>
          </button>
        </>
      ) : (
        <>
          <a className={`navlink ${isHere("/how") ? "here" : ""}`} href="/#how">
            <span>how it works</span>
            {loopSvg}
            <em className="cap">four notes</em>
          </a>
          <Link className={`navlink ${isHere("/events") ? "here" : ""}`} to="/events">
            <span>browse</span>
            {loopSvg}
            <em className="cap">no sign-in needed</em>
          </Link>
          <Link className={`navlink ${isHere("/signin") && loc.pathname !== "/signin" ? "here" : ""}`} to="/signin">
            <span>your picks</span>
            {loopSvg}
            <em className="cap">about 2 minutes</em>
          </Link>
          <Link
            className={`navlink pill ${isHere("/signin") ? "here" : ""}`}
            to="/signin"
            aria-current={isHere("/signin") ? "page" : undefined}
          >
            <span>sign in</span>
            <em className="cap">free, no card</em>
          </Link>
        </>
      )}
    </nav>
  );
}
