import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import confetti from "canvas-confetti";
import Icon from "../components/Icon.js";
import Monitor from "../components/Monitor.js";
import { fetchEvents, type EventRow } from "../lib/api.js";
import { formatIstDate, sourceLabel } from "../lib/format.js";

interface CardTransform {
  x: number;
  y: number;
  r: number;
  z: number;
}

export default function Landing() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Interactive "Tell us what you like" checklist state
  const [checklist, setChecklist] = useState<[boolean, boolean, boolean]>([false, false, false]);

  // Movable and randomized cards state
  const [cardTransforms, setCardTransforms] = useState<{ [id: string | number]: CardTransform }>({});
  const [draggingId, setDraggingId] = useState<number | string | null>(null);
  const [isScattered, setIsScattered] = useState(true);
  const dragStartRef = useRef<{
    id: number | string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const topZRef = useRef<number>(10);

  function toggleItem(i: number) {
    setChecklist((prev) => {
      const next: [boolean, boolean, boolean] = [
        i === 0 ? !prev[0] : prev[0],
        i === 1 ? !prev[1] : prev[1],
        i === 2 ? !prev[2] : prev[2],
      ];
      if (next.filter(Boolean).length === 3 && !prev.every(Boolean)) {
        try {
          confetti({
            particleCount: 60,
            spread: 70,
            origin: { y: 0.7 },
            colors: ["#e5484d", "#f3e7d7", "#9b2b2f", "#ede6dc"],
            disableForReducedMotion: true,
          });
        } catch {}
      }
      return next;
    });
  }

  useEffect(() => {
    let live = true;
    fetchEvents({ limit: 6 })
      .then((res) => {
        if (!live) return;
        setEvents(res.items);
        setTotal(res.total);
        setLoading(false);

        // Generate natural playful initial scatter offsets
        const initial: { [id: string]: CardTransform } = {};
        const seeds = [
          { x: -12, y: 10, r: -3.2 },
          { x: 16, y: -10, r: 2.6 },
          { x: -10, y: 14, r: -1.8 },
          { x: 16, y: -8, r: 3.2 },
          { x: 12, y: 12, r: -2.5 },
          { x: -14, y: -10, r: 2.0 },
        ];
        res.items.forEach((item, idx) => {
          const s = seeds[idx % seeds.length];
          initial[item.id] = {
            x: s.x,
            y: s.y,
            r: s.r,
            z: idx + 1,
          };
        });
        setCardTransforms(initial);
      })
      .catch(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  function scatterCards() {
    const next: { [id: string]: CardTransform } = {};
    topZRef.current += 1;
    events.forEach((e, i) => {
      const rx = (Math.random() - 0.5) * 54;
      const ry = (Math.random() - 0.5) * 40;
      const rr = (Math.random() - 0.5) * 9;
      next[e.id] = {
        x: Math.round(rx),
        y: Math.round(ry),
        r: Number(rr.toFixed(1)),
        z: 1 + i,
      };
    });
    setCardTransforms(next);
    setIsScattered(true);
    try {
      confetti({
        particleCount: 25,
        spread: 60,
        origin: { y: 0.6 },
        colors: ["#e5484d", "#f3e7d7", "#34312e"],
        disableForReducedMotion: true,
      });
    } catch {}
  }

  function tidyCards() {
    const next: { [id: string]: CardTransform } = {};
    events.forEach((e) => {
      next[e.id] = {
        x: 0,
        y: 0,
        r: 0,
        z: 1,
      };
    });
    setCardTransforms(next);
    setIsScattered(false);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLElement>, id: number | string) {
    if (e.button !== 0 || e.pointerType === "touch") return;
    const current = cardTransforms[id] || { x: 0, y: 0, r: 0, z: 1 };
    topZRef.current += 1;
    const newZ = topZRef.current;

    setCardTransforms((prev) => ({
      ...prev,
      [id]: { ...current, z: newZ },
    }));

    dragStartRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: current.x,
      origY: current.y,
      moved: false,
    };

    setDraggingId(id);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!dragStartRef.current) return;
    const { id, startX, startY, origX, origY } = dragStartRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragStartRef.current.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      dragStartRef.current.moved = true;
      // Capture only once it is a real drag, so a plain click still reaches the card link.
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    setCardTransforms((prev) => {
      const cur = prev[id] || { x: 0, y: 0, r: 0, z: topZRef.current };
      return {
        ...prev,
        [id]: {
          ...cur,
          x: origX + dx,
          y: origY + dy,
          r: Math.max(-10, Math.min(10, (cur.r || 0) + dx * 0.04)),
        },
      };
    });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLElement>) {
    if (!dragStartRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setDraggingId(null);
    setTimeout(() => {
      dragStartRef.current = null;
    }, 60);
  }

  const checkedCount = checklist.filter(Boolean).length;
  const sceneLabels = [
    "Empty frame waiting for your picks",
    "A radar drawn in",
    "Radar with two flags and a builder",
    "Radar fully lit up: your picks are ready",
  ];

  const checklistItems = [
    "Hackathons near Pune",
    "AI and Web3 topics",
    "A WhatsApp message every morning",
  ];

  return (
    <div className="landing-content">
      {/* PAGE 1: HERO SECTION */}
      <section className="landing-section hero-section" id="hero" aria-label="Hero">
        {/* Floating background doodles */}
        <div className="doodle o1" style={{ width: 70, height: 70, left: -84, top: "42%" }} aria-hidden="true">
          <svg viewBox="0 0 40 40">
            <path className="ln" d="M9 14h18v9a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8zM27 17h3a3 3 0 0 1 0 6h-3M14 5c-1.5 2 1.5 3 0 6M20 5c-1.5 2 1.5 3 0 6" />
          </svg>
        </div>
        <div className="doodle o2" style={{ width: 78, height: 78, right: -88, top: "4%" }} aria-hidden="true">
          <svg viewBox="0 0 40 40">
            <path className="ln" d="M7 10q13-7 26 0L20 35zM15.2 15a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M21.2 19a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0M17.5 25a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0" />
          </svg>
        </div>
        <div className="doodle o3" style={{ width: 70, height: 70, right: -84, bottom: 80 }} aria-hidden="true">
          <svg viewBox="0 0 40 40">
            <path className="ln" d="M13 7h14v8a7 7 0 0 1-14 0zM13 10H8a4 4 0 0 0 5 6M27 10h5a4 4 0 0 1-5 6M20 22v6M14 33h12M16 28h8" />
          </svg>
        </div>

        <div className="tablet grid-paper enter">
          <div className="hero-grid">
            <div className="in">
              <p className="brandline">
                <span>HackRadar</span>
              </p>
              <p className="eyebrow">Daily hackathon digest · made in Pune</p>
              <h1 className="h1">
                Never miss a hackathon{" "}
                <span className="rot">
                  <span>near you.</span>
                  <span>worth your weekend.</span>
                  <span>you'd actually want.</span>
                </span>
              </h1>
              <p className="lead">
                We check Devpost, Unstop, Devfolio and MLH every morning, keep what's near you and fits what you like, and send it to Discord, WhatsApp or email.
              </p>
              <div className="cta-row">
                <Link className="btn solid" to="/signin">
                  Sign in for personal picks
                </Link>
                <a className="btn ghost" href="#board">
                  Browse what's open
                </a>
              </div>
              <p className="meta-line">
                Browsing is free and needs no account.
              </p>
            </div>

            {/* Hero Right Visual: Animated Logo Mascot + Large Interactive Radar Scope */}
            <div className="hero-radar-stage in late">
              <div className="mascot-operator">
                <div className="mascot-speech">
                  <span className="dot-live" />
                  <span>Checking the listings every morning...</span>
                </div>
                <div className="mascot-avatar" title="HackRadar Mascot">
                  <Monitor size={58} mood="wake" className="hero-mascot-pc" />
                </div>
              </div>

              <div className="scope-box">
                <svg
                  className="scope"
                  viewBox="0 0 460 460"
                  role="img"
                  aria-label="Radar screen picking up three hackathons"
                >
                  {/* Outer Window Terminal Frame */}
                  <rect
                    className="scope-frame"
                    x="8"
                    y="8"
                    width="444"
                    height="444"
                    rx="22"
                  />
                  {/* Window Bar */}
                  <line className="ln" x1="8" y1="50" x2="452" y2="50" />
                  <circle cx="34" cy="29" r="6" className="dot-btn win-red" />
                  <circle cx="54" cy="29" r="6" className="dot-btn win-yellow" />
                  <circle cx="74" cy="29" r="6" className="dot-btn win-green" />
                  <text className="scope-title" x="205" y="34">
                    radar.digest · Pune
                  </text>
                  <circle cx="420" cy="29" r="4.5" className="live-beacon" />
                  <text className="live-tag" x="400" y="33">
                    DAILY
                  </text>

                  {/* Radar Scope Interior */}
                  <g className="radar-grid" transform="translate(230, 240)">
                    {/* Concentric Range Rings */}
                    <circle className="range-ring outer" r="165" />
                    <circle className="range-ring mid" r="110" />
                    <circle className="range-ring inner" r="55" />
                    <circle className="range-ring core" r="14" />

                    {/* Crosshairs & Diagonals */}
                    <line className="crosshair" x1="-165" y1="0" x2="165" y2="0" />
                    <line className="crosshair" x1="0" y1="-165" x2="0" y2="165" />
                    <line className="crosshair diagonal" x1="-117" y1="-117" x2="117" y2="117" />
                    <line className="crosshair diagonal" x1="-117" y1="117" x2="117" y2="-117" />

                    {/* Distance markers */}
                    <text className="range-txt" x="4" y="-168">250 km</text>
                    <text className="range-txt" x="4" y="-113">100 km</text>
                    <text className="range-txt" x="4" y="-58">25 km</text>

                    {/* Rotating Sweep Beam */}
                    <g className="sweep">
                      <path
                        className="wedge"
                        d="M0 0 L0 -165 A165 165 0 0 1 143 -82 Z"
                      />
                      <line className="sweep-line" x1="0" y1="0" x2="0" y2="-165" />
                    </g>

                    {/* Blip 1: AI · Pune */}
                    <g className="blip-node b1" transform="translate(86, -72)">
                      <circle className="blip-wave" r="18" />
                      <circle className="blip-wave w2" r="28" />
                      <circle className="blip-dot" r="8" />
                      <g className="blip-pill" transform="translate(14, -14)">
                        <rect width="86" height="24" rx="6" />
                        <text x="8" y="16">AI · Pune</text>
                      </g>
                    </g>

                    {/* Blip 2: Web3 · Online */}
                    <g className="blip-node b2" transform="translate(-96, 42)">
                      <circle className="blip-wave" r="18" />
                      <circle className="blip-wave w2" r="28" />
                      <circle className="blip-dot" r="8" />
                      <g className="blip-pill" transform="translate(-108, -14)">
                        <rect width="100" height="24" rx="6" />
                        <text x="8" y="16">Web3 · Online</text>
                      </g>
                    </g>

                    {/* Blip 3: Hardware · 120km */}
                    <g className="blip-node b3" transform="translate(38, 92)">
                      <circle className="blip-wave" r="18" />
                      <circle className="blip-wave w2" r="28" />
                      <circle className="blip-dot" r="8" />
                      <g className="blip-pill" transform="translate(14, -12)">
                        <rect width="122" height="24" rx="6" />
                        <text x="8" y="16">Hardware · 120km</text>
                      </g>
                    </g>
                  </g>

                  {/* Terminal Ticker / Status Bar */}
                  <rect className="terminal-bar" x="18" y="420" width="424" height="26" rx="6" />
                  <text className="terminal-txt" x="28" y="437">
                    ● DEVPOST / DEVFOLIO / UNSTOP / MLH SCANNED · 5 AM IST
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <a href="#how" className="page-cue" aria-label="Scroll to how it works">
            how it works, in four notes ↓
          </a>
        </div>
      </section>

      {/* PAGE 2: HOW IT WORKS SECTION */}
      <section className="landing-section how-section" id="how" aria-labelledby="how-h">
        <div className="sheet over-hero how">
          <svg className="ribbon" viewBox="0 0 1200 90" preserveAspectRatio="none" aria-hidden="true">
            <path className="ln" d="M0 60C120 20 220 80 340 46s200-30 300 6 220 34 330-6 170-20 230 10" />
          </svg>
          <p className="note-hand" style={{ color: "var(--coral-text)", margin: "0 0 16px" }}>
            how it works, in four notes
          </p>
          <h2 className="h2" id="how-h">
            We do the scrolling. You do the building.
          </h2>

          <div className="collage">
            <p className="n1 ruled torn note-fly" style={{ margin: 0, position: "relative" }}>
              <span className="tape" />
              We check Devpost, Unstop, Devfolio and MLH every morning.
            </p>

            <p className="n2 note-fly" style={{ margin: 0 }}>
              <span className="tape r" />
              Only what's near you, in the kinds and topics you follow.
            </p>

            <div className="n3 note-fly">
              <span className="tape" />
              <p>Sent to Discord, WhatsApp or email around 5 AM IST.</p>
              <small>Top picks get a message of their own.</small>
            </div>

            <figure className="n4 polaroid note-fly" style={{ margin: 0 }} tabIndex={0} aria-label="Example: a hackathon found in a public post on X">
              <div className="pic">
                <p className="who">@pune_builders · public post on X</p>
                <p>Registrations open for our 24-hour build night on 22 Nov. Teams of 2–4, beginners welcome. Link in thread.</p>
                <svg className="scribble" viewBox="0 0 300 170" preserveAspectRatio="none" aria-hidden="true">
                  <path className="ln" d="M20 60C10 20 140 6 250 22c40 6 44 52 4 70-50 22-200 22-226-6C8 66 50 40 120 36M210 130l40 26M250 156l-4-18M250 156l-18 0" />
                </svg>
              </div>
              <figcaption className="sig">found on X · unverified</figcaption>
            </figure>

            <p className="n5 note-fly" style={{ margin: 0 }}>
              <svg viewBox="0 0 70 40" aria-hidden="true">
                <path className="ln" d="M66 30C46 34 20 26 8 8m0 0 2 12M8 8l12 2" />
              </svg>
              Posts from LinkedIn and X that no listing site has. Always marked unverified, always with the link.
            </p>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <a href="#board" className="page-cue" aria-label="Scroll to open right now">
            see what's open right now ↓
          </a>
        </div>
      </section>

      {/* PAGE 3: OPEN RIGHT NOW SECTION - REAL API DATA */}
      <section className="landing-section board-section" id="board" aria-labelledby="board-h">
        <div className="board-wrap">
          <div className="board-head">
            <div>
              <h2 className="h2" id="board-h">
                Open right now
              </h2>
              <p className="lead dark" style={{ margin: "6px 0 0" }}>
                Real hackathons from public listings, refreshed every morning.
              </p>
            </div>
            <span className="note-hand">
              <svg viewBox="0 0 40 20" aria-hidden="true" style={{ width: 40, height: 20 }}>
                <path className="ln" d="M38 4C26 2 12 6 4 16m0 0 1-8m-1 8 8-1" />
              </svg>
              public listings
            </span>
          </div>

          <div style={{ position: "relative" }}>
            <div className="blueprint-back" aria-hidden="true" />
            <div className="blueprint">
              <div className="blueprint-topbar">
                <div className="board-hint-badge">
                  <span className="hint-hand">🖐️</span>
                  <span>Movable cards — drag anywhere on board</span>
                </div>
                <div className="board-actions">
                  <button
                    type="button"
                    className={`board-tool-btn ${isScattered ? "active" : ""}`}
                    onClick={scatterCards}
                    title="Scatter cards randomly"
                  >
                    <span>🎲</span> Scatter
                  </button>
                  <button
                    type="button"
                    className={`board-tool-btn ${!isScattered ? "active" : ""}`}
                    onClick={tidyCards}
                    title="Align cards into grid"
                  >
                    <span>📐</span> Tidy
                  </button>
                </div>
              </div>

              <div className="rows" aria-hidden="true">
                <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span>
              </div>

              {loading ? (
                <p className="lead dark" style={{ textAlign: "center", padding: "60px 0" }}>Loading open events...</p>
              ) : events.length === 0 ? (
                <p className="lead dark" style={{ textAlign: "center", padding: "60px 0" }}>No open hackathons at this moment. Check back around 5 AM IST!</p>
              ) : (
                <div className="shots movable-board">
                  {events.map((e, idx) => {
                    const primarySource = e.sources[0] ? sourceLabel(e.sources[0]) : "Listing";
                    const posters = ["poster", "poster dark", "poster paper"];
                    const posterCls = posters[idx % posters.length];
                    const t = cardTransforms[e.id] || { x: 0, y: 0, r: 0, z: 1 };
                    const isDragging = draggingId === e.id;

                    return (
                      <article
                        className={`shot movable ${isDragging ? "is-dragging" : ""}`}
                        key={e.id}
                        style={{
                          transform: `translate3d(${t.x}px, ${t.y}px, 0) rotate(${t.r}deg)`,
                          zIndex: t.z,
                        }}
                        onPointerDown={(ev) => handlePointerDown(ev, e.id)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                      >
                        <span className="card-tape" aria-hidden="true" />
                        <div className={posterCls}>
                          <span className="platform">{primarySource}</span>
                          <Icon name="code" size={32} />
                        </div>
                        <div className="shot-body">
                          <h3 className="shot-title">{e.title}</h3>
                          <dl className="facts">
                            <dt>When</dt>
                            <dd>{e.regDeadline ? `reg by ${formatIstDate(e.regDeadline)}` : "Open"}</dd>
                            <dt>Where</dt>
                            <dd>{[e.city, e.mode === "offline" ? "in person" : e.mode].filter(Boolean).join(" · ") || "Online"}</dd>
                            <dt>Prize</dt>
                            <dd>{e.prizeText || "Not listed"}</dd>
                          </dl>
                        </div>
                        {e.sources.length > 1 && <span className="stamp">on {e.sources.length} sites</span>}
                        <Link
                          className="over"
                          to={`/events/${e.id}`}
                          aria-label={`Open ${e.title}`}
                          onClick={(ev) => {
                            if (dragStartRef.current?.moved) {
                              ev.preventDefault();
                              ev.stopPropagation();
                            }
                          }}
                          onDragStart={(ev) => ev.preventDefault()}
                        />
                      </article>
                    );
                  })}
                </div>
              )}

              <p className="blueprint-cap">everything here is public. dates come from the source.</p>
            </div>
          </div>

          <div className="board-cta">
            <Link className="btn chalk" to="/events">
              See all {total > 0 ? `${total} ` : ""}open hackathons
            </Link>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <a href="#picks" className="page-cue" aria-label="Scroll to tell us what you like">
            tell us what you like ↓
          </a>
        </div>
      </section>

      {/* PAGE 4: TELL US WHAT YOU LIKE CHECKLIST */}
      <section className="landing-section picks-section" id="picks" aria-labelledby="picks-h">
        <div className="picks card-paper">
          <div>
            <h2 className="h2" id="picks-h">
              Tell us what you like
            </h2>
            <p className="lead dark" style={{ marginBottom: 20 }}>
              Tick the kinds of hackathons you care about. We tune your morning radar.
            </p>
            <ul className="checks">
              {checklistItems.map((label, i) => {
                const on = checklist[i];
                return (
                  <li key={label}>
                    <button
                      type="button"
                      className={`chk ${on ? "on" : ""}`}
                      aria-pressed={on}
                      onClick={() => toggleItem(i)}
                    >
                      <span className="box">
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path className="tick" d="M3 8.5l3 3 7-7" />
                        </svg>
                      </span>
                      <span className="txt">{label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Link className={checkedCount === 3 ? "btn solid ready" : "btn solid"} to="/signin">
              Set up my personal picks
            </Link>
          </div>

          {/* Dynamic SVG scene filling with checked boxes */}
          <div className="scene-box">
            <svg className={`scene s${checkedCount}`} viewBox="0 0 320 300" role="img" aria-label={sceneLabels[checkedCount]}>
              <path className="ln frame-line" d="M26 18h268a18 18 0 0 1 18 18v228a18 18 0 0 1-18 18H26a18 18 0 0 1-18-18V36a18 18 0 0 1 18-18z" />
              <text className="hint-text" x="160" y="156">
                tick a box to start
              </text>
              <path className="fill" d="M160 170 L160 80 A90 90 0 0 1 238 125 Z" />
              <g className="st st1">
                <path className="ln" d="M70 170a90 90 0 1 0 180 0a90 90 0 1 0-180 0M105 170a55 55 0 1 0 110 0a55 55 0 1 0-110 0M138 170a22 22 0 1 0 44 0a22 22 0 1 0-44 0M70 170h180M160 80v180" />
              </g>
              <g className="st st2">
                <path className="ln" d="M206 126v-30l20 9-20 9M118 214v-24l16 7-16 7M66 214a12 12 0 1 0 24 0a12 12 0 1 0-24 0M78 226v26M78 236l-14 10M78 236l16-6M66 280l12-16 12 16M94 228h30l-4 12H98z" />
              </g>
              <g className="st st3">
                <path className="ln" d="M262 54l4 10 10 4-10 4-4 10-4-10-10-4 10-4zM40 60l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM250 236c10-6 22-4 28 6m-4-12 4 12-12 2" />
              </g>
            </svg>
          </div>
        </div>
        <p className="after-note">
          change any of it later in Settings
        </p>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <a href="#morning" className="page-cue" aria-label="Scroll to what lands each morning">
            what lands each morning ↓
          </a>
        </div>
      </section>

      {/* PAGE 5: WHAT LANDS EACH MORNING SECTION */}
      <section className="landing-section morning-section" id="morning" aria-labelledby="morning-h">
        <div className="morning">
          <div>
            <p className="note-hand" style={{ margin: "0 0 12px" }}>
              what lands each morning
            </p>
            <h2 className="h2" id="morning-h">
              One message a morning. Only your picks.
            </h2>
            <ul className="chan">
              <li>
                <Icon name="email" size={28} />
                Email, with one-click unsubscribe
              </li>
              <li>
                <Icon name="whatsapp" size={28} />
                WhatsApp, if you add your number
              </li>
              <li>
                <Icon name="discord" size={28} />
                Discord, in your DMs or a server
              </li>
            </ul>
            <Link className="btn chalk" to="/signin">
              Get your morning digest
            </Link>
          </div>

          {/* Features list */}
          <ul className="chan" style={{ marginTop: 20 }}>
            <li>
              <Icon name="trophy" size={28} />
              Leaderboard — see who's building the most
            </li>
            <li>
              <Icon name="people" size={28} />
              Public profile — show off your wins
            </li>
            <li>
              <Icon name="calendar" size={28} />
              Reminders — never miss a deadline
            </li>
          </ul>
          <Link className="btn ghost" to="/leaderboard" style={{ marginTop: 8 }}>
            See the leaderboard
          </Link>

          {/* Sample phone card */}
          <div className="msg" aria-label="Sample morning message">
            <div className="msg-top">
              <Icon name="code" size={24} />
              HackRadar · 4:52 AM
            </div>
            <p className="bubble hand">
              Morning! 3 new near Pune since yesterday.
            </p>
            <div className="bubble">
              <b>Top pick</b> · AI Build Challenge
              <br />
              Weekend · in person · ₹1,00,000
              <span className="src">dates from Devfolio</span>
            </div>
            <div className="bubble">
              Web3 Builders Sprint
              <br />
              Online · registration closes Friday
              <span className="src">dates from Unstop</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
