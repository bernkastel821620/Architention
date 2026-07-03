import { AlertTriangle } from "lucide-react";
import type { SmellCandidate } from "../types";

type Props = {
  smells: SmellCandidate[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

export function SmellList({ smells, selectedNodeId, onSelectNode }: Props) {
  const visible = selectedNodeId
    ? smells.filter((smell) => smell.nodeIds.includes(selectedNodeId)).concat(smells.filter((smell) => !smell.nodeIds.includes(selectedNodeId))).slice(0, 8)
    : smells.slice(0, 8);

  return (
    <section className="panel smells-panel">
      <div className="panel-heading">
        <div>
          <h2>Review Candidates</h2>
          <p>Architecture hypotheses, not definitive errors.</p>
        </div>
      </div>
      <div className="smell-list">
        {visible.map((smell) => (
          <article key={smell.id} className={`smell ${smell.severity}`}>
            <h3><AlertTriangle size={16} /> {smell.title}</h3>
            <p>{smell.reason}</p>
            <small>{smell.evidence[0]}</small>
            <div className="node-links">
              {smell.nodeIds.map((nodeId) => (
                <button key={nodeId} type="button" onClick={() => onSelectNode(nodeId)}>
                  {nodeId.split(".").pop()}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
