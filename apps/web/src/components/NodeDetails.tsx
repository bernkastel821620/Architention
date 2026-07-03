import { useEffect, useState } from "react";
import { FileCode, Maximize2, Minimize2, Network } from "lucide-react";
import type { NodeDetail } from "../types";

type Props = {
  detail: NodeDetail | null;
  loading: boolean;
};

export function NodeDetails({ detail, loading }: Props) {
  const [sourceExpanded, setSourceExpanded] = useState(false);

  useEffect(() => {
    setSourceExpanded(false);
  }, [detail?.node.id]);

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
        <div className="source-heading">
          <h3><FileCode size={16} /> Source Preview</h3>
          <button
            type="button"
            className="source-toggle"
            onClick={() => setSourceExpanded((value) => !value)}
            title={sourceExpanded ? "Collapse source preview" : "Show full source preview"}
          >
            {sourceExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span>{sourceExpanded ? "접기" : "전체보기"}</span>
          </button>
        </div>
        <pre className={`source-preview ${sourceExpanded ? "expanded" : ""}`}>
          <code>{highlightJava(detail.sourcePreview)}</code>
        </pre>
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

const JAVA_KEYWORDS = new Set([
  "abstract",
  "assert",
  "boolean",
  "break",
  "byte",
  "case",
  "catch",
  "char",
  "class",
  "const",
  "continue",
  "default",
  "do",
  "double",
  "else",
  "enum",
  "extends",
  "false",
  "final",
  "finally",
  "float",
  "for",
  "if",
  "implements",
  "import",
  "instanceof",
  "int",
  "interface",
  "long",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "short",
  "static",
  "strictfp",
  "super",
  "switch",
  "synchronized",
  "this",
  "throw",
  "throws",
  "transient",
  "true",
  "try",
  "void",
  "volatile",
  "while"
]);

const JAVA_TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@[A-Za-z_][A-Za-z0-9_]*|\b\d[\d_]*(?:\.\d[\d_]*)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;

function highlightJava(source: string) {
  const nodes = [];
  let cursor = 0;
  for (const match of source.matchAll(JAVA_TOKEN_RE)) {
    const token = match[0];
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(source.slice(cursor, index));
    }
    const nextChar = source.slice(index + token.length).match(/^\s*(.)/)?.[1];
    const className = javaTokenClass(token, nextChar);
    nodes.push(
      <span className={className} key={`${index}-${token}`}>
        {token}
      </span>
    );
    cursor = index + token.length;
  }
  if (cursor < source.length) {
    nodes.push(source.slice(cursor));
  }
  return nodes;
}

function javaTokenClass(token: string, nextChar?: string) {
  if (token.startsWith("//") || token.startsWith("/*")) {
    return "java-comment";
  }
  if (token.startsWith("\"") || token.startsWith("'")) {
    return "java-string";
  }
  if (token.startsWith("@")) {
    return "java-annotation";
  }
  if (/^\d/.test(token)) {
    return "java-number";
  }
  if (JAVA_KEYWORDS.has(token)) {
    return "java-keyword";
  }
  if (nextChar === "(") {
    return "java-method";
  }
  if (/^[A-Z]/.test(token)) {
    return "java-type";
  }
  return "java-identifier";
}
