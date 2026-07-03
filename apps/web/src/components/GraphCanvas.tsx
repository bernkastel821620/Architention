import { useMemo } from "react";
import type { GraphPayload, SearchResult, SmellCandidate } from "../types";

type Props = {
  graph: GraphPayload | null;
  searchScores: Record<string, SearchResult>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

type PositionedNode = GraphPayload["nodes"][number] & {
  x: number;
  y: number;
  radius: number;
  relevance: number;
  risk: SmellCandidate["severity"] | null;
};

const WIDTH = 860;
const HEIGHT = 560;

export function GraphCanvas({ graph, searchScores, selectedNodeId, onSelectNode }: Props) {
  const layout = useMemo(() => {
    if (!graph) {
      return [];
    }
    const packages = Array.from(new Set(graph.nodes.map((node) => node.packageName))).sort();
    const riskByNode = new Map<string, SmellCandidate["severity"]>();
    for (const smell of graph.smells) {
      for (const nodeId of smell.nodeIds) {
        if (smell.severity === "high" || riskByNode.get(nodeId) !== "high") {
          riskByNode.set(nodeId, smell.severity);
        }
      }
    }

    return graph.nodes.map((node, index): PositionedNode => {
      const packageIndex = packages.indexOf(node.packageName);
      const packageNodes = graph.nodes
        .filter((item) => item.packageName === node.packageName)
        .sort((left, right) => left.label.localeCompare(right.label));
      const localIndex = Math.max(0, packageNodes.findIndex((item) => item.id === node.id));
      const angle = (2 * Math.PI * packageIndex) / Math.max(packages.length, 1) - Math.PI / 2;
      const ring = 172 + (localIndex % 3) * 46;
      const jitter = (localIndex - (packageNodes.length - 1) / 2) * 0.16;
      const relevance = searchScores[node.id]?.score ?? 0;
      return {
        ...node,
        x: WIDTH / 2 + Math.cos(angle + jitter) * ring,
        y: HEIGHT / 2 + Math.sin(angle + jitter) * ring,
        radius: 10 + node.metrics.attentionPointScore * 18,
        relevance,
        risk: riskByNode.get(node.id) ?? null
      };
    });
  }, [graph, searchScores]);

  const nodeById = useMemo(() => new Map(layout.map((node) => [node.id, node])), [layout]);

  if (!graph) {
    return (
      <section className="panel graph-panel empty-graph">
        <div className="empty-state">Analyze the sample project to render the class graph.</div>
      </section>
    );
  }

  return (
    <section className="panel graph-panel" aria-label="Class graph visualization">
      <div className="panel-heading">
        <div>
          <h2>Class Graph</h2>
          <p>{graph.nodes.length} classes, {graph.edges.length} edges</p>
        </div>
        <div className="legend">
          <span><i className="legend-dot high" />topic relevance</span>
          <span><i className="legend-line" />hard</span>
          <span><i className="legend-line soft" />semantic</span>
          <span><i className="legend-ring" />review candidate</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" className="graph-svg">
        <g className="edges">
          {graph.edges.map((edge) => {
            const source = nodeById.get(edge.source);
            const target = nodeById.get(edge.target);
            if (!source || !target) {
              return null;
            }
            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                className={`edge ${edge.family}`}
                strokeWidth={Math.max(1, edge.weight * 3)}
              >
                <title>{edge.type}: {edge.evidence}</title>
              </line>
            );
          })}
        </g>
        <g className="nodes">
          {layout.map((node) => (
            <g
              key={node.id}
              className={`node ${selectedNodeId === node.id ? "selected" : ""}`}
              transform={`translate(${node.x} ${node.y})`}
              onClick={() => onSelectNode(node.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  onSelectNode(node.id);
                }
              }}
            >
              <circle
                r={node.radius + (node.risk ? 4 : 0)}
                className={`risk-ring ${node.risk ?? ""}`}
              />
              <circle r={node.radius} fill={nodeFill(node.relevance)} />
              <text y={node.radius + 15} textAnchor="middle">{node.label}</text>
              <title>{node.qualifiedName} | attention {node.metrics.attentionPointScore.toFixed(2)}</title>
            </g>
          ))}
        </g>
      </svg>
    </section>
  );
}

function nodeFill(score: number): string {
  if (score <= 0.01) {
    return "#737982";
  }
  if (score < 0.2) {
    return "#5f8f79";
  }
  if (score < 0.45) {
    return "#2faf70";
  }
  return "#1fd16f";
}

