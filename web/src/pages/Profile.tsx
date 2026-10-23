import { useState } from "react";
import { Link, useParams } from "react-router";
import useSWR from "swr";

// Types mirrored from web/server/profile.ts
interface ActivityMark {
  eventId: number;
  title: string;
  startDate: string; // IST ISO date "YYYY-MM-DD"
  mark: "registered" | "submitted" | "won" | "skipped";
  projectUrl?: string;
}

interface ProfileCounts {
  registered: number;
  submitted: number;
  won: number;
}

interface PublicProfile {
  handle: string;
  name: string;
  counts: ProfileCounts;
  activity: ActivityMark[];
  isOwn: boolean;
}

interface OwnProfile {
  handle: string | null;
  profilePublic: boolean;
  termsAcceptedAt: string | null;
}

// Fetcher that surfaces 404 as a special error
async function fetchProfile(url: string): Promise<PublicProfile> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 404) {
    const err = new Error("not found") as Error & { status: number };
    err.status = 404;
    throw err;
  }
  if (!res.ok) throw new Error("request failed");
  return (await res.json()) as PublicProfile;
}

async function fetchOwnProfile(url: string): Promise<OwnProfile> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error("request failed");
  return (await res.json()) as OwnProfile;
}

async function patchProfile(body: { profilePublic?: boolean }): Promise<OwnProfile> {
  const res = await fetch("/api/me/profile", {
    method: "PATCH",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("request failed");
  return (await res.json()) as OwnProfile;
}

// --- Activity grid helpers ---

function getIstToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** Returns the ISO week string "YYYY-Www" for a given YYYY-MM-DD date */
function isoWeek(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  // ISO week: Thursday of the week determines the year
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const dayDiff = Math.floor((d.getTime() - startOfWeek1.getTime()) / 86400000);
  const weekNum = Math.floor(dayDiff / 7) + 1;
  if (weekNum < 1) {
    // Belongs to last year
    return isoWeek((d.getFullYear() - 1) + "-12-28");
  }
  // Check if week > 52: could be week 1 of next year
  const dec28 = new Date(d.getFullYear(), 11, 28);
  const totalWeeks = Math.ceil((Math.floor((dec28.getTime() - startOfWeek1.getTime()) / 86400000) + 1) / 7);
  if (weekNum > totalWeeks) {
    return (d.getFullYear() + 1) + "-W01";
  }
  return d.getFullYear() + "-W" + String(weekNum).padStart(2, "0");
}

/** Build the last 52 week labels from today (inclusive), oldest first */
function buildWeekLabels(today: string): string[] {
  const weeks: string[] = [];
  const d = new Date(today + "T00:00:00");
  for (let i = 51; i >= 0; i--) {
    const dd = new Date(d);
    dd.setDate(d.getDate() - i * 7);
    const iso = dd.toISOString().slice(0, 10);
    weeks.push(isoWeek(iso));
  }
  // Deduplicate while preserving order (edge: same week counted twice at year boundary)
  return [...new Set(weeks)];
}

/** Mark symbol */
function markSymbol(mark: ActivityMark["mark"]): string {
  if (mark === "won") return "★";
  if (mark === "skipped") return "○";
  return "●";
}

function markColor(mark: ActivityMark["mark"]): string {
  if (mark === "won") return "var(--coral)";
  if (mark === "skipped") return "var(--mute)";
  return "var(--chalk)";
}

// --- Components ---

function SkeletonProfile() {
  return (
    <div className="page fade-in" style={{ maxWidth: 860, margin: "0 auto 96px", padding: "0 16px" }}>
      <div style={{ margin: "48px 0 32px" }}>
        <div
          style={{
            width: 200,
            height: 36,
            background: "var(--coal)",
            borderRadius: 8,
            marginBottom: 12,
          }}
        />
        <div style={{ width: 120, height: 20, background: "var(--coal)", borderRadius: 6 }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 40 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ width: 110, height: 40, background: "var(--coal)", borderRadius: 99 }}
          />
        ))}
      </div>
      <div style={{ width: "100%", height: 160, background: "var(--coal)", borderRadius: 12 }} />
    </div>
  );
}

function NotFound({ handle }: { handle: string }) {
  return (
    <div style={{ maxWidth: 540, margin: "96px auto", textAlign: "center", padding: "0 16px" }}>
      <p style={{ font: "48px/1 var(--hand)", color: "var(--coral-text)", margin: "0 0 16px" }}>○</p>
      <h1 className="h1" style={{ color: "var(--chalk)", margin: "0 0 12px" }}>
        Profile not found
      </h1>
      <p style={{ color: "var(--mute)", marginBottom: 32 }}>
        No profile found for <strong style={{ color: "var(--chalk)" }}>@{handle}</strong>.
      </p>
      <Link to="/" className="btn solid">
        Back to hackathons
      </Link>
    </div>
  );
}

function CountBadge({ label, count }: { label: string; count: number }) {
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "10px 20px",
        borderRadius: 99,
        border: "1.5px solid var(--line-dark)",
        background: "var(--card)",
        minWidth: 90,
      }}
    >
      <span style={{ fontSize: 22, fontWeight: 700, color: "var(--chalk)", lineHeight: 1 }}>{count}</span>
      <span style={{ fontSize: 12, color: "var(--mute)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
    </div>
  );
}

interface ActivityGridProps {
  activity: ActivityMark[];
  isOwn: boolean;
  today: string;
}

function ActivityGrid({ activity, isOwn, today }: ActivityGridProps) {
  const weekLabels = buildWeekLabels(today);

  // Group activity by week
  const byWeek = new Map<string, ActivityMark[]>();
  for (const mark of activity) {
    if (!mark.startDate) continue;
    if (!isOwn && mark.mark === "skipped") continue;
    const wk = isoWeek(mark.startDate);
    if (!byWeek.has(wk)) byWeek.set(wk, []);
    byWeek.get(wk)!.push(mark);
  }

  // Check if there's anything to show
  const hasAny = weekLabels.some((wk) => (byWeek.get(wk)?.length ?? 0) > 0);

  if (!hasAny) {
    return (
      <div
        style={{
          padding: "40px 24px",
          textAlign: "center",
          borderRadius: 12,
          border: "1.5px solid var(--line-dark)",
          color: "var(--mute)",
        }}
      >
        <p style={{ fontSize: 32, margin: "0 0 8px" }}>○</p>
        <p style={{ margin: 0 }}>No activity in the last 52 weeks.</p>
      </div>
    );
  }

  return (
    <div
      style={{
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        paddingBottom: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: 6,
          minWidth: weekLabels.length * 40,
        }}
      >
        {weekLabels.map((wk) => {
          const marks = byWeek.get(wk) ?? [];
          return (
            <div
              key={wk}
              style={{
                width: 36,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                alignItems: "center",
              }}
            >
              {marks.length === 0 ? (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: "var(--coal)",
                    opacity: 0.4,
                  }}
                  title={wk}
                />
              ) : (
                marks.map((m) => (
                  <Link
                    key={m.eventId}
                    to={`/events/${m.eventId}`}
                    title={`${m.title} · ${m.mark}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      fontSize: 15,
                      color: markColor(m.mark),
                      background: "var(--coal)",
                      textDecoration: "none",
                      border: m.mark === "won" ? "1.5px solid var(--coral)" : "1.5px solid transparent",
                    }}
                  >
                    {markSymbol(m.mark)}
                  </Link>
                ))
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 16, fontSize: 12, color: "var(--mute)" }}>
        <span>
          <span style={{ color: "var(--chalk)" }}>●</span> registered / submitted
        </span>
        <span>
          <span style={{ color: "var(--coral)" }}>★</span> won
        </span>
        {isOwn && (
          <span>
            <span style={{ color: "var(--mute)" }}>○</span> skipped
          </span>
        )}
      </div>
    </div>
  );
}

interface VisibilityToggleProps {
  handle: string;
  initialPublic: boolean;
}

function VisibilityToggle({ handle, initialPublic }: VisibilityToggleProps) {
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    try {
      const updated = await patchProfile({ profilePublic: !isPublic });
      setIsPublic(updated.profilePublic);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        borderRadius: 12,
        border: "1.5px solid var(--line-dark)",
        background: "var(--card)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontWeight: 600, color: "var(--chalk)" }}>
          Profile visibility
        </p>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--mute)" }}>
          {isPublic
            ? `Anyone can see /u/${handle}`
            : "Only you can see this profile"}
        </p>
      </div>
      <button
        type="button"
        className={`btn ${isPublic ? "solid" : "ghost"}`}
        style={{ fontSize: 14, opacity: saving ? 0.6 : 1 }}
        disabled={saving}
        onClick={toggle}
      >
        {saving ? "Saving…" : isPublic ? "Public" : "Private"}
      </button>
      <Link to="/settings" className="btn ghost" style={{ fontSize: 13 }}>
        Change handle
      </Link>
    </div>
  );
}

export default function Profile() {
  const { handle } = useParams<{ handle: string }>();
  const safeHandle = handle ?? "";

  const { data, error, isLoading } = useSWR(
    safeHandle ? `/api/profile/${encodeURIComponent(safeHandle)}` : null,
    fetchProfile,
  );

  // Secondary fetch for own profile visibility state — keyed only when isOwn is confirmed
  const { data: ownData, isLoading: ownLoading } = useSWR(
    data?.isOwn ? "/api/me/profile" : null,
    fetchOwnProfile,
  );

  const today = getIstToday();

  if (isLoading) return <SkeletonProfile />;

  const is404 =
    error &&
    typeof error === "object" &&
    (error as { status?: number }).status === 404;

  if (is404 || (!data && error)) {
    return <NotFound handle={safeHandle} />;
  }

  if (!data) return null;

  return (
    <div className="page fade-in" style={{ maxWidth: 860, margin: "0 auto 96px", padding: "0 16px" }}>
      {/* Header */}
      <header style={{ margin: "48px 0 32px" }}>
        <h1 className="h1" style={{ color: "var(--chalk)", margin: "0 0 6px" }}>
          {data.name}
        </h1>
        <p style={{ font: "18px/1.4 var(--hand)", color: "var(--coral-text)", margin: 0 }}>
          @{data.handle}
        </p>
      </header>

      {/* Counts */}
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 40 }}
        aria-label="Participation counts"
      >
        <CountBadge label="registered" count={data.counts.registered} />
        <CountBadge label="submitted" count={data.counts.submitted} />
        <CountBadge label="won" count={data.counts.won} />
      </div>

      {/* Owner controls — wait for ownData before rendering toggle */}
      {data.isOwn && (
        <div style={{ marginBottom: 32 }}>
          {ownLoading || ownData === undefined ? (
            <div
              style={{
                height: 64,
                borderRadius: 12,
                background: "var(--coal)",
                opacity: 0.4,
              }}
            />
          ) : (
            <VisibilityToggle handle={data.handle} initialPublic={ownData.profilePublic} />
          )}
        </div>
      )}

      {/* Activity grid */}
      <section aria-labelledby="activity-h">
        <h2 className="h3" id="activity-h" style={{ color: "var(--chalk)", margin: "0 0 16px" }}>
          Activity · last 52 weeks
        </h2>
        <ActivityGrid activity={data.activity} isOwn={data.isOwn} today={today} />
      </section>
    </div>
  );
}
