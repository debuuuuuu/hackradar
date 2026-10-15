import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router";
import type { AdminStats } from "../../server/stats.js";
import { barPct, niceMax, shortDay } from "../lib/chart.js";
import { formatIst } from "../lib/format.js";
import { signInHref, useMe } from "../lib/me.js";

type Load = { status: "loading" } | { status: "error" } | { status: "ok"; stats: AdminStats };

export default function Admin() {
  const { state } = useMe();
  const loc = useLocation();
  if (state.status === "loading") return <p>Loading</p>;
  if (state.status === "out") return <Navigate to={signInHref(loc.pathname, loc.search)} replace />;
  if (!state.me.isAdmin) return <p>This page is for the site owner.</p>;
  return <Dashboard />;
}

function Dashboard() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  useEffect(() => {
    let live = true;
    fetch("/api/admin/stats", { headers: { accept: "application/json" } })
      .then(async (res) => {
        if (!res.ok) throw new Error("request failed");
        return (await res.json()) as AdminStats;
      })
      .then(
        (stats) => live && setLoad({ status: "ok", stats }),
        () => live && setLoad({ status: "error" }),
      );
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="admin">
      <p className="eyebrow">Owner only</p>
      <h1>Users and sign-ins</h1>
      {load.status === "loading" && <p>Loading</p>}
      {load.status === "error" && <p>Could not load the stats. Reload to try again.</p>}
      {load.status === "ok" && <Stats s={load.stats} />}
    </div>
  );
}

function Stats({ s }: { s: AdminStats }) {
  const run = s.lastPipelineRun;
  const total = s.totalUsers;
  const channels = [
    ["Email", s.channelAdoption.email],
    ["Discord", s.channelAdoption.discord],
    ["WhatsApp", s.channelAdoption.whatsapp],
  ] as const;
  return (
    <>
      <div className="tiles">
        <Tile label="Total users" value={String(s.totalUsers)} />
        <Tile label="New in 7 days" value={String(s.newUsers7d)} />
        <Tile label="Active in 7 days" value={String(s.activeUsers7d)} />
        <Tile label="Onboarded" value={`${s.onboardedPct}%`} />
      </div>

      <section aria-labelledby="signins-h">
        <h2 id="signins-h">Sign-ins, last 30 days</h2>
        <SignInChart days={s.loginsByDay} />
      </section>

      <section aria-labelledby="signups-h">
        <h2 id="signups-h">New users, last 14 days</h2>
        <table className="stat-table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">New users</th>
            </tr>
          </thead>
          <tbody>
            {s.signupsByDay
              .slice(-14)
              .reverse()
              .map((d) => (
                <tr key={d.day}>
                  <th scope="row">{shortDay(d.day)}</th>
                  <td>{d.count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="channels-h">
        <h2 id="channels-h">Channels in use</h2>
        <p className="note">Users with the channel on for at least one of digest, pings or reminders.</p>
        <ul className="channel-list">
          {channels.map(([label, n]) => (
            <li key={label}>
              <span>{label}</span>
              <strong>{n}</strong>
              <span className="note">{total === 0 ? "of 0 users" : `of ${total} users (${Math.round((n / total) * 100)}%)`}</span>
              <span className="meter" aria-hidden="true">
                <span style={{ inlineSize: `${barPct(n, total)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="run-h">
        <h2 id="run-h">Last pipeline run</h2>
        {run ? (
          <p>
            {formatIst(run.startedAt) ?? run.startedAt}, status <strong>{run.status}</strong>, {run.notificationsSent}{" "}
            {run.notificationsSent === 1 ? "message" : "messages"} sent.
          </p>
        ) : (
          <p>No runs recorded</p>
        )}
      </section>

      <p className="note">Page views are not tracked here yet.</p>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="note">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SignInChart({ days }: { days: AdminStats["loginsByDay"] }) {
  const max = niceMax(Math.max(0, ...days.map((d) => d.discord + d.email)));
  const first = days[0]?.day;
  const last = days[days.length - 1]?.day;
  return (
    <figure className="chart">
      <ul className="legend">
        <li>
          <span className="swatch discord" aria-hidden="true" /> Discord (solid)
        </li>
        <li>
          <span className="swatch email" aria-hidden="true" /> Email (striped)
        </li>
      </ul>
      <div className="plot">
        <span className="ymax" aria-hidden="true">
          {max}
        </span>
        <span className="y0" aria-hidden="true">
          0
        </span>
        <div className="bars" aria-hidden="true">
          {days.map((d) => (
            <div key={d.day} className="bar" title={`${shortDay(d.day)}: ${d.discord} Discord, ${d.email} email`}>
              <span className="seg email" style={{ blockSize: `${barPct(d.email, max)}%` }} />
              <span className="seg discord" style={{ blockSize: `${barPct(d.discord, max)}%` }} />
            </div>
          ))}
        </div>
      </div>
      {first && last && (
        <div className="xaxis" aria-hidden="true">
          <span>{shortDay(first)}</span>
          <span>{shortDay(last)}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>Sign-ins per day, newest last</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Discord</th>
            <th scope="col">Email</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{shortDay(d.day)}</th>
              <td>{d.discord}</td>
              <td>{d.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
