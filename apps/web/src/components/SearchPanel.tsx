import { Search } from "lucide-react";
import type { SearchResult } from "../types";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  results: SearchResult[];
  loading: boolean;
  onSelectNode: (nodeId: string) => void;
};

const EXAMPLES = ["Security", "Payment", "Authentication", "Persistence"];

export function SearchPanel({ query, onQueryChange, onSearch, results, loading, onSelectNode }: Props) {
  return (
    <section className="panel search-panel">
      <div className="panel-heading">
        <div>
          <h2>Topic Search</h2>
          <p>Attention-inspired relevance, backed by local vectors and graph evidence.</p>
        </div>
      </div>
      <div className="search-row">
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onSearch();
            }
          }}
          placeholder="Search a topic"
        />
        <button type="button" onClick={onSearch} disabled={loading || !query.trim()} title="Search topic">
          <Search size={16} />
          <span>{loading ? "Searching" : "Search"}</span>
        </button>
      </div>
      <div className="chips" aria-label="Example topics">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              onQueryChange(example);
              window.setTimeout(onSearch, 0);
            }}
          >
            {example}
          </button>
        ))}
      </div>
      <div className="result-list">
        {results.map((result) => (
          <button key={result.nodeId} type="button" className="result-row" onClick={() => onSelectNode(result.nodeId)}>
            <span className="rank">{result.rank}</span>
            <span className="result-main">
              <strong>{result.label}</strong>
              <small>{result.evidence[0]}</small>
            </span>
            <span className="score">{Math.round(result.score * 100)}%</span>
          </button>
        ))}
      </div>
    </section>
  );
}

