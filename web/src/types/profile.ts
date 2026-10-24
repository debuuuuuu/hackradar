// Client-side copies of server interfaces from web/server/profile.ts
// Keep in sync manually -- do NOT import from server path in client code.

export interface GraphNode {
  id: string;       // "user" | "theme:<label>" | "event:<eventId>"
  label: string;
  type: "user" | "theme" | "event";
  weight: number;   // theme: count of events; event: 1=registered,2=submitted,3=won
}
export interface GraphEdge { source: string; target: string }
export interface GraphData { nodes: GraphNode[]; edges: GraphEdge[] }
