import type { EventDetail, EventRow, Place } from "../../server/events.js";

export type { EventDetail, EventRow, Place };

export interface EventsQuery {
  q?: string;
  kind?: string;
  place?: string;
  radius?: number;
  limit?: number;
  offset?: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(res.status === 404 ? "not found" : "request failed");
  return (await res.json()) as T;
}

export function fetchEvents(q: EventsQuery): Promise<{ items: EventRow[]; total: number }> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") sp.set(k, String(v));
  return get(`/api/events?${sp}`);
}

export const fetchEvent = (id: string): Promise<EventDetail> => get(`/api/events/${encodeURIComponent(id)}`);
export const fetchPlaces = (): Promise<Place[]> => get("/api/places");

export interface BusyPeriod {
  id: number;
  startsOn: string;
  endsOn: string;
  label: string;
}

export interface Pick {
  id: number;
  title: string;
  score: number;
  why: string | null;
  clash: string | null;
}

export const fetchBusy = (): Promise<{ periods: BusyPeriod[] }> => get("/api/me/busy");
export const fetchPicks = (): Promise<{ picks: Pick[] }> => get("/api/me/picks");

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(res.status === 404 ? "not found" : "request failed");
  return (await res.json()) as T;
}

async function patch_<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(res.status === 404 ? "not found" : "request failed");
  return (await res.json()) as T;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE", headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(res.status === 404 ? "not found" : "request failed");
  return (await res.json()) as T;
}

export interface SavedEvent {
  eventId: number;
  title: string;
  status: string;
  won: boolean;
  projectUrl: string | null;
  startDate: string | null;
  regDeadline: string | null;
  sources: { url: string; source: string }[];
  gcalLink: string;
  createdAt: string;
}

export const fetchMyEvents = (): Promise<{ items: SavedEvent[] }> => get("/api/me/events");
export const saveEvent = (id: number): Promise<{ status: string }> => post(`/api/me/events/${id}`, {});
export const updateEventStatus = (id: number, patch: { status?: string; won?: boolean; project_url?: string }): Promise<{ status: string }> => patch_(`/api/me/events/${id}`, patch);
export const unsaveEvent = (id: number): Promise<{ ok: boolean }> => del(`/api/me/events/${id}`);
export const fetchCalToken = (): Promise<{ token: string; url: string }> => get("/api/me/calendar-token");
