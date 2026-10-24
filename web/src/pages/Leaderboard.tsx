import { useRef, useState } from "react";
import { Link } from "react-router";
import useSWR from "swr";
import Icon from "../components/Icon.js";
import Monitor from "../components/Monitor.js";
import { useMe } from "../lib/me.js";

interface LeaderboardRow {
  rank: number;
  handle: string;
  points: number;
  registered: number;
  submitted: number;
  won: number;
  isMe: boolean;
}

interface LeaderboardResponse {
  rows: LeaderboardRow[];
  total: number;
  myRank?: number;
  myRow?: LeaderboardRow;
}

const THEME_OPTIONS = [
  { value: "", label: "All themes" },
  { value: "ai", label: "AI / ML" },
  { value: "web", label: "Web" },
  { value: "mobile", label: "Mobile" },
  { value: "blockchain", label: "Blockchain / Web3" },
  { value: "data", label: "Data" },
  { value: "iot", label: "IoT" },
  { value: "security", label: "Security" },
];

async function fetchLeaderboard([url, period, theme, city]: [string, string, string, string]): Promise<LeaderboardResponse> {
  const params = new URLSearchParams({ period });
  if (theme) params.set("theme", theme);
  if (city) params.set("city", city);
  const res = await fetch(`${url}?${params.toString()}`);
  return res.json() as Promise<LeaderboardResponse>;
}

function MedalBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1 ? "gold" :
    rank === 2 ? "silver" :
    rank === 3 ? "bronze" :
    "plain";
  return <span className={`lb-medal ${cls}`}>{rank}</span>;
}

function RowItem({ row }: { row: LeaderboardRow }) {
  const topCls = row.rank === 1 ? " top1" : "";
  const meCls = row.isMe ? " me" : "";
  return (
    <div className={`lb-row${topCls}${meCls}`}>
      <MedalBadge rank={row.rank} />
      <Link className="lb-handle" to={`/u/${row.handle}`}>
        @{row.handle}
        {row.won > 0 && (
          <Icon name="trophy" size={15} style={{ marginLeft: 6, verticalAlign: "-2px" }} variant="coral" />
        )}
      </Link>
      <span className="lb-pts">{row.points} pts</span>
      <span className="lb-stats">
        {row.registered}R · {row.submitted}S · {row.won}W
      </span>
    </div>
  );
}

export default function Leaderboard() {
  const { state } = useMe();
  const [period, setPeriod] = useState<"month" | "all">("month");
  const [theme, setTheme] = useState("");
  const [city, setCity] = useState("");
  const [cityInput, setCityInput] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useSWR<LeaderboardResponse>(
    ["/api/leaderboard", period, theme, city],
    fetchLeaderboard,
  );

  function handleCityChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setCityInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCity(val.trim().toLowerCase());
    }, 400);
  }

  const rows = data?.rows ?? [];

  return (
    <div className="page" style={{ maxWidth: 720, margin: "0 auto 96px" }}>
      {/* Header */}
      <header style={{ margin: "8px 0 32px" }}>
        <p className="note-hand" style={{ margin: "0 0 10px" }}>
          <Icon name="trophy" size={22} />
          who's building the most
        </p>
        <h1 className="h1" style={{ color: "var(--chalk)", margin: "0 0 10px" }}>
          Leaderboard
        </h1>
        <p className="lead dark" style={{ margin: 0 }}>
          Points for registering, submitting, and winning hackathons on HackRadar.
        </p>
      </header>

      {/* Period tabs */}
      <div
        role="tablist"
        aria-label="Leaderboard period"
        style={{ display: "flex", gap: 10, marginBottom: 20 }}
      >
        <button
          type="button"
          role="tab"
          className={`chip ${period === "month" ? "on" : ""}`}
          aria-selected={period === "month"}
          onClick={() => setPeriod("month")}
        >
          This month
        </button>
        <button
          type="button"
          role="tab"
          className={`chip ${period === "all" ? "on" : ""}`}
          aria-selected={period === "all"}
          onClick={() => setPeriod("all")}
        >
          All time
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 28 }}>
        <select
          className="lb-filter"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          aria-label="Filter by theme"
        >
          {THEME_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          className="lb-filter"
          type="text"
          placeholder="Filter by city…"
          value={cityInput}
          onChange={handleCityChange}
          aria-label="Filter by city"
          style={{ minWidth: 160 }}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <p className="lead dark">Loading…</p>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <Monitor size={80} sleepy />
          </div>
          <p className="lead dark" style={{ margin: "0 0 20px", textAlign: "center" }}>
            No one here yet — participate in a hackathon to appear.
          </p>
          <Link to="/" className="btn solid">
            Browse hackathons
          </Link>
        </div>
      ) : (
        <div className="lb-list">
          {rows.map((row) => (
            <RowItem key={row.handle} row={row} />
          ))}
        </div>
      )}

      {/* Pinned self strip */}
      {data?.myRank != null && data.myRow && (
        <>
          <hr className="lb-divider" />
          <div className="lb-row me">
            <span className="lb-you">You · #{data.myRank}</span>
            <Link className="lb-handle" to={`/u/${data.myRow.handle}`}>
              @{data.myRow.handle}
            </Link>
            <span className="lb-pts">{data.myRow.points} pts</span>
            <span className="lb-stats">
              {data.myRow.registered}R · {data.myRow.submitted}S · {data.myRow.won}W
            </span>
          </div>
        </>
      )}

      {/* Not signed in hint */}
      {state.status === "out" && (
        <p className="notice" style={{ marginTop: 24, textAlign: "center" }}>
          <Link to="/signin">Sign in</Link> to track your rank and earn points.
        </p>
      )}
    </div>
  );
}
