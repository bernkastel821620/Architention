from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.models import AnalyzeRequest, ExplainRequest, SearchRequest, SearchResponse
from app.storage import analyze_repo, explain_candidate, get_node_detail, load_graph, search_latest


app = FastAPI(
    title="Architecture Attention Map API",
    description="Local MVP API for attention-inspired Java architecture relevance maps.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "service": "architecture-attention-map-api"}


@app.post("/api/analyze")
def analyze(request: AnalyzeRequest):
    try:
        return analyze_repo(request.repoPath, force=request.force, max_files=request.maxFiles)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/graph")
def graph():
    try:
        return load_graph()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/search", response_model=SearchResponse)
def search(request: SearchRequest) -> SearchResponse:
    try:
        results = search_latest(
            request.query,
            top_k=request.topK,
            include_graph_propagation=request.includeGraphPropagation,
        )
        return SearchResponse(query=request.query, results=results)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/nodes/{node_id:path}")
def node_detail(node_id: str):
    try:
        return get_node_detail(node_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Node not found: {node_id}") from exc


@app.post("/api/explain")
def explain(request: ExplainRequest):
    try:
        return explain_candidate(node_id=request.nodeId, smell_id=request.smellId)
    except (FileNotFoundError, KeyError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

