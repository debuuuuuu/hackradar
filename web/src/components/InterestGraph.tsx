import { useEffect, useRef, useState } from "react";
import * as d3 from "d3-force";
import type { GraphData, GraphNode, GraphEdge } from "../types/profile.js";

// SimNode extends GraphNode with d3-force simulation positions
interface SimNode extends GraphNode {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  index?: number;
}

// SimEdge extends GraphEdge with d3-force resolved source/target references
interface SimEdge {
  source: SimNode | string;
  target: SimNode | string;
}

const WIDTH = 500;
const HEIGHT = 400;

function nodeRadius(node: SimNode): number {
  if (node.type === "user") return 24;
  if (node.type === "theme") return Math.min(8 + node.weight * 2, 22);
  // event
  return 4 + node.weight * 2;
}

function nodeFill(node: SimNode): string {
  if (node.type === "user") return "var(--coral)";
  if (node.type === "theme") return "var(--ink)";
  // event: cream
  return "#f5f0e8";
}

function truncate(s: string, max = 15): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

interface InterestGraphProps {
  data: GraphData;
}

export default function InterestGraph({ data }: InterestGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<SimEdge[]>([]);

  useEffect(() => {
    if (data.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // Deep-copy nodes so d3 can mutate x/y/vx/vy
    const simNodes: SimNode[] = data.nodes.map((n) => ({ ...n }));

    // Build id→SimNode map for edge resolution
    const nodeById = new Map<string, SimNode>(simNodes.map((n) => [n.id, n]));

    // Map edges to objects referencing SimNode copies
    const simEdges: SimEdge[] = (data.edges as GraphEdge[])
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimEdge>(simEdges)
          .id((d) => d.id)
          .distance(80),
      )
      .force("charge", d3.forceManyBody<SimNode>().strength(-200))
      .force("center", d3.forceCenter<SimNode>(WIDTH / 2, HEIGHT / 2))
      .force(
        "collide",
        d3.forceCollide<SimNode>().radius((d) => nodeRadius(d) + 4),
      );

    simulation.on("tick", () => {
      setNodes([...simulation.nodes()]);
      setEdges([...(simulation.force<d3.ForceLink<SimNode, SimEdge>>("link")?.links() ?? [])]);
    });

    simulation.on("end", () => {
      setNodes([...simulation.nodes()]);
      setEdges([...(simulation.force<d3.ForceLink<SimNode, SimEdge>>("link")?.links() ?? [])]);
    });

    return () => {
      simulation.stop();
    };
  }, [data]);

  if (data.nodes.length === 0) return null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      style={{ width: "100%", maxHeight: HEIGHT }}
      aria-label="Interest graph"
    >
      {/* Edges */}
      {edges.map((e, i) => {
        const src = e.source as SimNode;
        const tgt = e.target as SimNode;
        if (src.x == null || src.y == null || tgt.x == null || tgt.y == null) return null;
        return (
          <line
            key={i}
            x1={src.x}
            y1={src.y}
            x2={tgt.x}
            y2={tgt.y}
            stroke="var(--chalk)"
            strokeOpacity={0.25}
            strokeWidth={1}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((n) => {
        if (n.x == null || n.y == null) return null;
        const r = nodeRadius(n);
        const showLabel = n.type === "user" || n.type === "theme";
        return (
          <g key={n.id} transform={`translate(${n.x},${n.y})`}>
            <circle
              r={r}
              fill={nodeFill(n)}
              {...(n.type === "theme" ? { stroke: "var(--chalk)", strokeWidth: 1.5 } : {})}
            />
            {/* Tooltip for all nodes; primary label for event nodes only */}
            <title>{n.label}</title>
            {showLabel && (
              <text
                textAnchor="middle"
                dy="0.35em"
                fontSize={11}
                fill={n.type === "user" ? "#fff" : "var(--chalk)"}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {truncate(n.label)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
