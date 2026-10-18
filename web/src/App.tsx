import { useEffect } from "react";
import { Link, Route, Routes } from "react-router";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import Footer from "./components/Footer.js";
import Nav from "./components/Nav.js";
import { useMe } from "./lib/me.js";
import Admin from "./pages/Admin.js";
import ConfirmSignIn from "./pages/ConfirmSignIn.js";
import Unsubscribe from "./pages/Unsubscribe.js";
import EventDetail from "./pages/EventDetail.js";
import Events from "./pages/Events.js";
import Home from "./pages/Home.js";
import MyEvents from "./pages/MyEvents.js";
import Onboarding from "./pages/Onboarding.js";
import Settings from "./pages/Settings.js";
import SignIn from "./pages/SignIn.js";

export default function App() {
  const { state, signOut } = useMe();

  useEffect(() => {
    // Respect prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const lenis = new Lenis({
      duration: 1.4,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      orientation: "vertical",
      smoothWheel: true,
      lerp: 0.08,
    });

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return (
    <div className="hr motion">
      <div className="frame">
        <Nav state={state} signOut={signOut} />

        <main id="main-content">
          <Routes>
            <Route path="/" element={<Home state={state} />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/welcome" element={<Onboarding />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/my-events" element={<MyEvents />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signin/confirm" element={<ConfirmSignIn />} />
            <Route path="/unsubscribe" element={<Unsubscribe />} />
            <Route
              path="*"
              element={
                <div style={{ maxWidth: 600, margin: "64px auto", textAlign: "center" }}>
                  <h1 className="h1" style={{ color: "var(--chalk)" }}>
                    Page not found
                  </h1>
                  <p className="lead dark">
                    The radar couldn't find anything here.
                  </p>
                  <Link to="/" className="btn solid">
                    Back to hackathons
                  </Link>
                </div>
              }
            />
          </Routes>
        </main>

        <Footer />
      </div>
    </div>
  );
}
