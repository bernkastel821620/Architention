from __future__ import annotations

import json
from pathlib import Path

from app.analyzer.pipeline import analyze_project
from app.analyzer.scoring import search_graph
from app.models import (
    AnalyzeResponse,
    GraphPayload,
    NodeDetailResponse,
    SearchResult,
    SmellCandidate,
)


PROJECT_ROOT = Path(__file__).resolve().parents[3]
CACHE_DIR = PROJECT_ROOT / ".arch-attention" / "cache"
CACHE_FILE = CACHE_DIR / "analysis.json"


def analyze_repo(repo_path: str, force: bool = False, max_files: int = 1000) -> AnalyzeResponse:
    target = resolve_repo_path(repo_path)
    if not target.exists() or not target.is_dir():
        raise FileNotFoundError(f"Repository path does not exist: {repo_path}")

    if CACHE_FILE.exists() and not force:
        cached = load_graph()
        if cached.meta.repoPath == repo_path:
            cached.meta.cached = True
            return _analyze_response(cached)

    payload = analyze_project(target, repo_path, max_files=max_files)
    save_graph(payload)
    return _analyze_response(payload)


def resolve_repo_path(repo_path: str) -> Path:
    candidate = Path(repo_path)
    if not candidate.is_absolute():
        candidate = PROJECT_ROOT / candidate
    # Trusted local developer input for the MVP. A public deployment would need
    # sandboxed checkout/upload handling instead of direct local path access.
    return candidate.resolve()


def save_graph(payload: GraphPayload) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.write_text(payload.model_dump_json(indent=2), encoding="utf-8")


def load_graph() -> GraphPayload:
    if not CACHE_FILE.exists():
        sample = PROJECT_ROOT / "examples" / "java-spring-mini"
        if sample.exists():
            payload = analyze_project(sample, "examples/java-spring-mini")
            save_graph(payload)
            return payload
        raise FileNotFoundError("No analysis cache found. Run POST /api/analyze first.")
    data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return GraphPayload.model_validate(data)


def search_latest(query: str, top_k: int, include_graph_propagation: bool = True) -> list[SearchResult]:
    payload = load_graph()
    return search_graph(payload, query, top_k=top_k, include_graph_propagation=include_graph_propagation)


def get_node_detail(node_id: str) -> NodeDetailResponse:
    payload = load_graph()
    node = next((item for item in payload.nodes if item.id == node_id), None)
    if node is None:
        raise KeyError(node_id)
    incoming = [edge for edge in payload.edges if edge.target == node_id and edge.family == "hard"]
    outgoing = [edge for edge in payload.edges if edge.source == node_id and edge.family == "hard"]
    semantic = [
        edge
        for edge in payload.edges
        if edge.family == "soft" and (edge.source == node_id or edge.target == node_id)
    ]
    smells = [smell for smell in payload.smells if node_id in smell.nodeIds]
    source_preview = _read_source_text(node.filePath) or node.sourcePreview
    return NodeDetailResponse(
        node=node,
        incomingEdges=incoming,
        outgoingEdges=outgoing,
        semanticNeighbors=semantic,
        smells=smells,
        sourcePreview=source_preview,
    )


def explain_candidate(node_id: str | None = None, smell_id: str | None = None) -> dict[str, str | list[str]]:
    payload = load_graph()
    if smell_id:
        smell: SmellCandidate | None = next((item for item in payload.smells if item.id == smell_id), None)
        if smell:
            return {
                "title": smell.title,
                "explanation": f"{smell.reason} Treat this as an architecture review hypothesis and inspect the listed source evidence before changing code.",
                "evidence": smell.evidence,
            }
    if node_id:
        detail = get_node_detail(node_id)
        return {
            "title": f"Why {detail.node.label} is visible",
            "explanation": f"{detail.node.summary} Its attention-inspired score is based on dependency degree, package crossings, graph position, and smell participation.",
            "evidence": [
                f"tags: {', '.join(detail.node.tags) or 'none'}",
                f"weighted degree: {detail.node.metrics.weightedDegree:.2f}",
                f"attention point score: {detail.node.metrics.attentionPointScore:.2f}",
            ],
        }
    return {
        "title": "Architecture Attention Map",
        "explanation": "This MVP combines static dependency evidence and deterministic local vector similarity to suggest review attention points.",
        "evidence": [],
    }


def _analyze_response(payload: GraphPayload) -> AnalyzeResponse:
    return AnalyzeResponse(
        ok=True,
        analysisId=payload.meta.analysisId,
        meta={
            "repoPath": payload.meta.repoPath,
            "javaFileCount": payload.meta.javaFileCount,
            "classCount": payload.meta.classCount,
            "edgeCount": payload.meta.edgeCount,
            "smellCount": payload.meta.smellCount,
            "provider": payload.meta.provider,
            "cached": payload.meta.cached,
        },
    )


def _read_source_text(file_path: str) -> str:
    path = Path(file_path)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        try:
            return path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ""
