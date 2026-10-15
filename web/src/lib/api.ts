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
