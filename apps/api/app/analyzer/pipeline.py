from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from app.analyzer.document_builder import enrich_nodes
from app.analyzer.embeddings import LocalTfidfVectorizer, cosine
from app.analyzer.graph_builder import build_hard_edges, build_semantic_edges, summarize_packages
from app.analyzer.java_scanner import JavaScanner
from app.analyzer.scoring import compute_node_metrics
from app.analyzer.smells import detect_smells, smell_participation_counts
from app.models import GraphMeta, GraphPayload


LIMITATIONS = [
    "Java analysis is best-effort text parsing, not compiler-grade type resolution.",
    "Semantic similarity is deterministic local vector similarity, not true Transformer attention.",
    "Smell entries are review candidates and architecture hypotheses, not definitive errors.",
]


def analyze_project(repo_path: Path, display_repo_path: str, max_files: int = 1000) -> GraphPayload:
    scanner = JavaScanner()
    nodes = scanner.scan(repo_path, max_files=max_files)
    nodes = enrich_nodes(nodes)

    documents = [node.document for node in nodes]
    vectorizer = LocalTfidfVectorizer()
    vectors = vectorizer.fit_transform(documents)

    hard_edges = build_hard_edges(nodes)
    semantic_edges, pair_scores = build_semantic_edges(nodes, vectors, cosine)
    all_edges = hard_edges + semantic_edges
    packages = summarize_packages(nodes, all_edges, pair_scores)

    compute_node_metrics(nodes, all_edges)
    smells = detect_smells(nodes, all_edges, pair_scores, packages)
    compute_node_metrics(nodes, all_edges, smell_participation_counts(smells))

    created_at = datetime.now(timezone.utc).replace(microsecond=0)
    analysis_id = f"local-{created_at.strftime('%Y-%m-%dT%H-%M-%S')}"
    meta = GraphMeta(
        analysisId=analysis_id,
        repoPath=display_repo_path,
        provider=vectorizer.name,
        createdAt=created_at.isoformat().replace("+00:00", "Z"),
        javaFileCount=len(list(repo_path.rglob("*.java"))),
        classCount=len(nodes),
        edgeCount=len(all_edges),
        smellCount=len(smells),
        cached=False,
        limitations=LIMITATIONS,
    )
    return GraphPayload(meta=meta, nodes=nodes, edges=all_edges, packages=packages, smells=smells)

