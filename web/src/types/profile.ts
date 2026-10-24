// Shared types for the public profile API response.
// These mirror the server-side interfaces in web/server/profile.ts.
// Do NOT import from server files in client code — use this file instead.

export interface GraphNode {
  id: string; // "user" | "theme:<label>" | "event:<eventId>"
  label: string;
  type: "user" | "theme" | "event";
  weight: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
