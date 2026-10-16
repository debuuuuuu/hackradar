import { Link, Route, Routes, useLocation } from "react-router";
import { signInHref, useMe } from "./lib/me.js";
import Admin from "./pages/Admin.js";
import EventDetail from "./pages/EventDetail.js";
import ConfirmSignIn from "./pages/ConfirmSignIn.js";
import Home from "./pages/Home.js";
import Onboarding from "./pages/Onboarding.js";
import Settings from "./pages/Settings.js";
import SignIn from "./pages/SignIn.js";

export default function App() {
  const { state, signOut } = useMe();
  const loc = useLocation();
  return (
    <div className="wrap">
      <header>
        <svg
          width="30"
          height="30"
          viewBox="0 0 34 34"
          fill="none"
          stroke="#17181C"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M5.5 22.5a12.5 12.5 0 1 1 23 0" />
          <path d="M10.5 21a7 7 0 1 1 13 0" opacity=".5" />
          <path d="M17 20 L25 9" />
          <circle cx="17" cy="20" r="2.6" fill="#F2602A" />
        </svg>
        <Link to="/" className="brand">
          HackRadar
        </Link>
        <nav className="who" aria-label="Account">
          {state.status === "in" && (
            <>
              <span>{state.me.name}</span>
              {state.me.isAdmin && <Link to="/admin">Admin</Link>}
              {state.me.onboarded ? <Link to="/settings">Settings</Link> : <Link to="/welcome">Finish setup</Link>}
              <button type="button" className="btn" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          )}
          {state.status === "out" && (
            <Link to={signInHref(loc.pathname, loc.search)} className="btn">
              Sign in
            </Link>
          )}
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home state={state} />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/welcome" element={<Onboarding />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signin/confirm" element={<ConfirmSignIn />} />
          <Route
            path="*"
            element={
              <p>
                Page not found. <Link to="/">All events</Link>
              </p>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
