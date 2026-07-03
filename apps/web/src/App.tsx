import { useEffect, useMemo, useState } from "react";
import { Activity, Play, RefreshCw } from "lucide-react";
import { analyzeRepo, getGraph, getNodeDetail, searchTopic } from "./api";
import { GraphCanvas } from "./components/GraphCanvas";
import { NodeDetails } from "./components/NodeDetails";
import { SearchPanel } from "./components/SearchPanel";
import { SmellList } from "./components/SmellList";
import type { GraphPayload, NodeDetail, SearchResult } from "./types";

const DEFAULT_REPO = "examples/java-spring-mini";

export default function App() {
  const [repoPath, setRepoPath] = useState(DEFAULT_REPO);
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [query, setQuery] = useState("Security");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detail, setDetail] = useState<NodeDetail | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const scoreByNode = useMemo(() => {
    return Object.fromEntries(results.map((result) => [result.nodeId, result]));
  }, [results]);

  useEffect(() => {
    getGraph()
      .then((payload) => {
        setGraph(payload);
        setStatus(`Loaded ${payload.meta.classCount} classes from cache`);
        return runSearch("Security");
      })
      .catch(() => {
        setStatus("Analyze the sample project to begin");
      });
  }, []);

  useEffect(() => {
    if (!selectedNodeId) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    getNodeDetail(selectedNodeId)
      .then(setDetail)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoadingDetail(false));
  }, [selectedNodeId]);

  async function runAnalyze() {
    setAnalyzing(true);
    setError(null);
    setStatus("Analyzing Java classes...");
    try {
      const response = await analyzeRepo(repoPath, true);
      const payload = await getGraph();
      setGraph(payload);
      setSelectedNodeId(payload.nodes[0]?.id ?? null);
      setStatus(`Analyzed ${response.meta.classCount} classes, ${response.meta.edgeCount} edges, ${response.meta.smellCount} candidates`);
      await runSearch(query);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analyze failed");
      setStatus("Analyze failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runSearch(nextQuery = query) {
    if (!nextQuery.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const response = await searchTopic(nextQuery, 20);
      setResults(response.results);
      setStatus(`Search "${nextQuery}" returned ${response.results.length} ranked classes`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Architecture Attention Map</h1>
          <p>Local, deterministic architecture relevance mapping for Java/Spring-style code.</p>
        </div>
        <div className="status-pill">
          <Activity size={16} />
          <span>{status}</span>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <section className="panel analyze-panel">
        <div className="panel-heading">
          <div>
            <h2>Analyze Repository</h2>
            <p>Trusted local path. Default demo uses no external API keys.</p>
          </div>
          <div className="stats">
            <span>{graph?.meta.classCount ?? 0} classes</span>
            <span>{graph?.meta.edgeCount ?? 0} edges</span>
            <span>{graph?.meta.smellCount ?? 0} candidates</span>
          </div>
        </div>
        <div className="analyze-row">
          <input value={repoPath} onChange={(event) => setRepoPath(event.target.value)} />
          <button type="button" onClick={runAnalyze} disabled={analyzing} title="Analyze local repository">
            {analyzing ? <RefreshCw size={16} className="spin" /> : <Play size={16} />}
            <span>{analyzing ? "Analyzing" : "Analyze"}</span>
          </button>
        </div>
      </section>

      <div className="workspace-grid">
        <div className="left-column">
          <SearchPanel
            query={query}
            onQueryChange={setQuery}
            onSearch={() => runSearch(query)}
            results={results}
            loading={searching}
            onSelectNode={setSelectedNodeId}
          />
          <SmellList smells={graph?.smells ?? []} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
        </div>
        <GraphCanvas
          graph={graph}
          searchScores={scoreByNode}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />
        <NodeDetails detail={detail} loading={loadingDetail} />
      </div>
    </main>
  );
}

