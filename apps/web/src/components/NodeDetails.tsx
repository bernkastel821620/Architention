import { FileCode, Network } from "lucide-react";
import type { NodeDetail } from "../types";

type Props = {
  detail: NodeDetail | null;
  loading: boolean;
};

export function NodeDetails({ detail, loading }: Props) {
  if (loading) {
    return (
      <section className="panel details-panel">
        <h2>Node Details</h2>
        <div className="empty-state">Loading node evidence...</div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="panel details-panel">
        <h2>Node Details</h2>
        <div className="empty-state">Select a graph node to inspect evidence.</div>
      </section>
    );
  }

  const { node } = detail;

  return (
    <section className="panel details-panel">
      <div className="panel-heading">
        <div>
          <h2>{node.label}</h2>
          <p>{node.packageName}</p>
        </div>
      </div>
      <p className="summary">{node.summary}</p>
      <div className="metric-grid">
        <Metric label="attention" value={node.metrics.attentionPointScore} />
        <Metric label="degree" value={node.metrics.weightedDegree} />
        <Metric label="between" value={node.metrics.betweenness} />
        <Metric label="x-package" value={node.metrics.crossPackageEdges} />
      </div>
      <div className="tag-row">
        {node.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <div className="detail-block">
        <h3><Network size={16} /> Relations</h3>
        <ul>
          {[...detail.outgoingEdges, ...detail.incomingEdges].slice(0, 8).map((edge) => (
            <li key={edge.id}>{edge.type}: {edge.evidence}</li>
          ))}
        </ul>
      </div>
      <div className="detail-block">
        <h3><FileCode size={16} /> Source Preview</h3>
        <pre>{detail.sourcePreview}</pre>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const display = Number.isInteger(value) ? value.toString() : value.toFixed(2);
  return (
    <div>
      <span>{label}</span>
      <strong>{display}</strong>
    </div>
  );
}

