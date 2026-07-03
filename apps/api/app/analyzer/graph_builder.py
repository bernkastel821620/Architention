from __future__ import annotations

import re
from collections import defaultdict

from app.models import EdgeModel, NodeModel, PackageSummary


def build_hard_edges(nodes: list[NodeModel]) -> list[EdgeModel]:
    lookup = _class_lookup(nodes)
    edges: list[EdgeModel] = []
    seen: set[tuple[str, str, str, str]] = set()

    for node in nodes:
        for ref in node.references:
            target_id = lookup.get(ref.targetName)
            if not target_id or target_id == node.id:
                continue
            marker = (node.id, target_id, ref.relationType, ref.evidence)
            if marker in seen:
                continue
            seen.add(marker)
            edges.append(
                EdgeModel(
                    id=f"edge-{len(edges) + 1}",
                    source=node.id,
                    target=target_id,
                    type=ref.relationType,
                    family="hard",
                    weight=ref.weight,
                    evidence=ref.evidence,
                    scoreComponents={"hard": ref.weight},
                )
            )

    edges.extend(_text_reference_edges(nodes, lookup, edges))
    return edges


def build_semantic_edges(
    nodes: list[NodeModel],
    vectors: list[dict[str, float]],
    similarity_fn,
    top_k: int = 5,
    threshold: float = 0.25,
) -> tuple[list[EdgeModel], dict[tuple[str, str], float]]:
    pair_scores: dict[tuple[str, str], float] = {}
    semantic_edges: list[EdgeModel] = []
    existing: set[tuple[str, str]] = set()

    for i, source in enumerate(nodes):
        ranked: list[tuple[int, float]] = []
        for j, target in enumerate(nodes):
            if i == j:
                continue
            score = similarity_fn(vectors[i], vectors[j])
            pair_scores[_pair_key(source.id, target.id)] = score
            if score >= threshold:
                ranked.append((j, score))
        ranked.sort(key=lambda item: (-item[1], nodes[item[0]].id))
        for j, score in ranked[:top_k]:
            target = nodes[j]
            marker = _pair_key(source.id, target.id)
            if marker in existing:
                continue
            existing.add(marker)
            semantic_edges.append(
                EdgeModel(
                    id=f"semantic-{len(semantic_edges) + 1}",
                    source=source.id,
                    target=target.id,
                    type="semantic_similarity",
                    family="soft",
                    weight=round(score, 4),
                    evidence="semantic similarity over deterministic class document vectors",
                    scoreComponents={"semantic": round(score, 4)},
                )
            )

    return semantic_edges, pair_scores


def summarize_packages(
    nodes: list[NodeModel],
    edges: list[EdgeModel],
    pair_scores: dict[tuple[str, str], float],
) -> list[PackageSummary]:
    by_package: dict[str, list[NodeModel]] = defaultdict(list)
    for node in nodes:
        by_package[node.packageName].append(node)

    edge_counts = {
        package: {"internal": 0, "external": 0}
        for package in by_package
    }
    node_by_id = {node.id: node for node in nodes}
    for edge in edges:
        source = node_by_id.get(edge.source)
        target = node_by_id.get(edge.target)
        if not source or not target:
            continue
        if source.packageName == target.packageName:
            edge_counts[source.packageName]["internal"] += 1
        else:
            edge_counts[source.packageName]["external"] += 1
            edge_counts[target.packageName]["external"] += 1

    summaries: list[PackageSummary] = []
    for package, package_nodes in sorted(by_package.items()):
        internal_scores: list[float] = []
        external_scores: list[float] = []
        package_ids = {node.id for node in package_nodes}
        for node in package_nodes:
            for other in nodes:
                if node.id == other.id:
                    continue
                score = pair_scores.get(_pair_key(node.id, other.id), 0.0)
                if other.id in package_ids:
                    internal_scores.append(score)
                else:
                    external_scores.append(score)
        summaries.append(
            PackageSummary(
                name=package,
                classCount=len(package_nodes),
                internalEdgeCount=edge_counts[package]["internal"],
                externalEdgeCount=edge_counts[package]["external"],
                internalSemanticDensity=_avg(internal_scores),
                externalSemanticDensity=_avg(external_scores),
            )
        )
    return summaries


def _text_reference_edges(
    nodes: list[NodeModel],
    lookup: dict[str, str],
    existing_edges: list[EdgeModel],
) -> list[EdgeModel]:
    existing_pairs = {(edge.source, edge.target) for edge in existing_edges if edge.family == "hard"}
    extra_edges: list[EdgeModel] = []
    for node in nodes:
        for simple_name, target_id in lookup.items():
            if "." in simple_name or target_id == node.id or (node.id, target_id) in existing_pairs:
                continue
            if re.search(rf"\b{re.escape(simple_name)}\b", node.sourcePreview):
                extra_edges.append(
                    EdgeModel(
                        id=f"edge-text-{len(extra_edges) + 1}",
                        source=node.id,
                        target=target_id,
                        type="text_reference",
                        family="hard",
                        weight=0.55,
                        evidence=f"source text references {simple_name}",
                        scoreComponents={"hard": 0.55},
                    )
                )
    return extra_edges


def _class_lookup(nodes: list[NodeModel]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for node in nodes:
        lookup[node.label] = node.id
        lookup[node.qualifiedName] = node.id
    return lookup


def _pair_key(left: str, right: str) -> tuple[str, str]:
    return tuple(sorted((left, right)))


def _avg(values: list[float]) -> float:
    if not values:
        return 0.0
    return round(sum(values) / len(values), 4)

