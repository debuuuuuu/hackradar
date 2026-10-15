import { Link, Route, Routes } from "react-router";
import EventDetail from "./pages/EventDetail.js";
import Events from "./pages/Events.js";

export default function App() {
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
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Events />} />
          <Route path="/events/:id" element={<EventDetail />} />
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
