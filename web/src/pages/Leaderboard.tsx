import { useRef, useState } from "react";
import { Link } from "react-router";
import useSWR from "swr";
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
  if (rank === 1) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--coral)",
          color: "var(--charcoal)",
          fontWeight: 700,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--ink)",
          color: "var(--chalk)",
          fontWeight: 700,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "#f5f0e8",
          color: "var(--charcoal)",
          fontWeight: 700,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        3
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        color: "var(--mute)",
        fontWeight: 400,
        fontSize: 13,
        flexShrink: 0,
      }}
    >
      {rank}
    </span>
  );
}

function RowItem({ row }: { row: LeaderboardRow }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderRadius: 12,
        border: row.isMe ? "1.5px solid var(--coral)" : "1.5px solid var(--line-dark)",
        background: row.isMe ? "rgba(255,95,70,0.05)" : "transparent",
      }}
    >
      <MedalBadge rank={row.rank} />
      <Link
        to={`/u/${row.handle}`}
        style={{ color: "var(--chalk)", fontWeight: 600, fontSize: 15, flex: 1, textDecoration: "none" }}
      >
        @{row.handle}
      </Link>
      <span style={{ fontWeight: 700, color: "var(--coral-text)" }}>{row.points} pts</span>
      <span style={{ fontSize: 13, color: "var(--mute)", whiteSpace: "nowrap" }}>
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
    fetchLeaderboard
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
      <header style={{ margin: "8px 0 28px" }}>
        <h1 className="h1" style={{ color: "var(--chalk)", margin: "0 0 8px" }}>
          Leaderboard
        </h1>
        <p className="lead dark" style={{ margin: 0 }}>
          Top hackathon builders on HackRadar.
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 28 }}>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          style={{
            background: "var(--card-bg, var(--charcoal))",
            color: "var(--chalk)",
            border: "1.5px solid var(--line-dark)",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          {THEME_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter by city…"
          value={cityInput}
          onChange={handleCityChange}
          style={{
            background: "var(--card-bg, var(--charcoal))",
            color: "var(--chalk)",
            border: "1.5px solid var(--line-dark)",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 14,
            outline: "none",
            minWidth: 160,
          }}
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <p style={{ color: "var(--mute)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--chalk)" }}>
          <p style={{ fontSize: 16, marginBottom: 16 }}>
            No one here yet. Be the first to appear — participate in a hackathon!
          </p>
          <Link to="/" className="btn solid">
            Browse hackathons
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row) => (
            <RowItem key={row.handle} row={row} />
          ))}
        </div>
      )}

      {/* Pinned self strip */}
      {data?.myRank != null && data.myRow && (
        <>
          <hr style={{ border: "none", borderTop: "1px solid var(--line-dark)", margin: "24px 0" }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              borderRadius: 12,
              border: "1.5px solid var(--coral)",
              background: "rgba(255,95,70,0.05)",
            }}
          >
            <span style={{ color: "var(--coral-text)", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              You · #{data.myRank}
            </span>
            <Link
              to={`/u/${data.myRow.handle}`}
              style={{ color: "var(--chalk)", fontWeight: 600, fontSize: 15, flex: 1, textDecoration: "none" }}
            >
              @{data.myRow.handle}
            </Link>
            <span style={{ fontWeight: 700, color: "var(--coral-text)" }}>{data.myRow.points} pts</span>
            <span style={{ fontSize: 13, color: "var(--mute)", whiteSpace: "nowrap" }}>
              {data.myRow.registered}R · {data.myRow.submitted}S · {data.myRow.won}W
            </span>
          </div>
        </>
      )}

      {/* Not signed in hint */}
      {state.status === "out" && (
        <p style={{ marginTop: 24, fontSize: 13, color: "var(--mute)", textAlign: "center" }}>
          <Link to="/signin" style={{ color: "var(--coral-text)" }}>Sign in</Link> to see your rank.
        </p>
      )}
    </div>
  );
}
