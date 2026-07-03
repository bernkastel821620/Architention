from __future__ import annotations

from collections import defaultdict

from app.models import EdgeModel, NodeModel, PackageSummary, SmellCandidate


def detect_smells(
    nodes: list[NodeModel],
    edges: list[EdgeModel],
    pair_scores: dict[tuple[str, str], float],
    packages: list[PackageSummary],
) -> list[SmellCandidate]:
    node_by_id = {node.id: node for node in nodes}
    hard_pairs = {_pair_key(edge.source, edge.target): edge for edge in edges if edge.family == "hard"}
    smells: list[SmellCandidate] = []

    smells.extend(_possible_duplicate_or_scattered(nodes, pair_scores, hard_pairs, len(smells)))
    smells.extend(_suspicious_coupling(edges, pair_scores, node_by_id, len(smells)))
    smells.extend(_hub_candidates(nodes, len(smells)))
    smells.extend(_low_package_cohesion(packages, nodes, len(smells)))
    smells.extend(_security_attention_points(nodes, len(smells)))
    return smells


def smell_participation_counts(smells: list[SmellCandidate]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for smell in smells:
        for node_id in smell.nodeIds:
            counts[node_id] += 1
    return counts


def _possible_duplicate_or_scattered(
    nodes: list[NodeModel],
    pair_scores: dict[tuple[str, str], float],
    hard_pairs: dict[tuple[str, str], EdgeModel],
    offset: int,
) -> list[SmellCandidate]:
    node_by_id = {node.id: node for node in nodes}
    candidates: list[tuple[float, float, NodeModel, NodeModel]] = []
    for pair, score in pair_scores.items():
        if pair in hard_pairs:
            continue
        left = node_by_id[pair[0]]
        right = node_by_id[pair[1]]
        validator_pair = _is_validator(left) and _is_validator(right)
        if not validator_pair:
            continue
        if score < 0.28:
            continue
        if left.packageName == right.packageName:
            continue
        priority = score + 0.40
        candidates.append((priority, score, left, right))
    candidates.sort(key=lambda item: (-item[0], item[2].id, item[3].id))

    smells: list[SmellCandidate] = []
    for index, (_, score, left, right) in enumerate(candidates[:3], start=1):
        smells.append(
            SmellCandidate(
                id=f"smell-{offset + index}",
                type="possible_duplicate_or_scattered_responsibility",
                severity="medium",
                score=round(score, 4),
                nodeIds=[left.id, right.id],
                title=f"{left.label} and {right.label} may share responsibility patterns",
                reason="High document similarity without a direct hard relation. This is a review candidate, not proof of duplicated behavior.",
                evidence=[
                    f"semantic similarity: {score:.2f}",
                    "hard relation: none detected",
                    f"shared tags: {', '.join(sorted(set(left.tags) & set(right.tags))) or 'similar class document terms'}",
                ],
                recommendation="Review whether the overlap is intentional domain separation or a chance to extract a shared policy component.",
            )
        )
    return smells


def _suspicious_coupling(
    edges: list[EdgeModel],
    pair_scores: dict[tuple[str, str], float],
    node_by_id: dict[str, NodeModel],
    offset: int,
) -> list[SmellCandidate]:
    best_by_pair: dict[tuple[str, str], tuple[float, EdgeModel, float]] = {}
    for edge in edges:
        if edge.family != "hard" or edge.weight < 0.65:
            continue
        source = node_by_id.get(edge.source)
        target = node_by_id.get(edge.target)
        if not source or not target or source.packageName == target.packageName:
            continue
        semantic = pair_scores.get(_pair_key(edge.source, edge.target), 0.0)
        if semantic < 0.38:
            pair = _pair_key(edge.source, edge.target)
            candidate = (edge.weight - semantic, edge, semantic)
            if pair not in best_by_pair or candidate[0] > best_by_pair[pair][0]:
                best_by_pair[pair] = candidate
    candidates = list(best_by_pair.values())
    candidates.sort(key=lambda item: (-item[0], item[1].id))

    smells: list[SmellCandidate] = []
    for index, (_, edge, semantic) in enumerate(candidates[:3], start=1):
        source = node_by_id[edge.source]
        target = node_by_id[edge.target]
        smells.append(
            SmellCandidate(
                id=f"smell-{offset + index}",
                type="suspicious_coupling",
                severity="medium",
                score=round(edge.weight - semantic, 4),
                nodeIds=[source.id, target.id],
                title=f"{source.label} has a cross-package dependency on {target.label}",
                reason="A strong structural dependency crosses package boundaries while semantic similarity is modest.",
                evidence=[
                    edge.evidence,
                    f"hard relation weight: {edge.weight:.2f}",
                    f"semantic similarity: {semantic:.2f}",
                ],
                recommendation="Check whether this dependency belongs behind a smaller interface, event, or application service boundary.",
            )
        )
    return smells


def _hub_candidates(nodes: list[NodeModel], offset: int) -> list[SmellCandidate]:
    if not nodes:
        return []
    degrees = sorted(node.metrics.weightedDegree for node in nodes)
    threshold = max(2.5, degrees[int(0.8 * (len(degrees) - 1))])
    candidates = [
        node
        for node in nodes
        if node.metrics.weightedDegree >= threshold and node.metrics.weightedDegree > 0
    ]
    candidates.sort(key=lambda node: (-node.metrics.weightedDegree, node.id))
    smells: list[SmellCandidate] = []
    for index, node in enumerate(candidates[:2], start=1):
        smells.append(
            SmellCandidate(
                id=f"smell-{offset + index}",
                type="god_or_hub_class_candidate",
                severity="medium",
                score=round(min(1.0, node.metrics.weightedDegree / max(threshold, 1.0)), 4),
                nodeIds=[node.id],
                title=f"{node.label} is a central attention point",
                reason="This class has unusually high weighted graph degree for the sample.",
                evidence=[
                    f"weighted degree: {node.metrics.weightedDegree:.2f}",
                    f"cross-package edges: {node.metrics.crossPackageEdges}",
                ],
                recommendation="Review whether this centrality is expected orchestration or a sign that responsibilities are accumulating.",
            )
        )
    return smells


def _low_package_cohesion(
    packages: list[PackageSummary],
    nodes: list[NodeModel],
    offset: int,
) -> list[SmellCandidate]:
    smells: list[SmellCandidate] = []
    for package in packages:
        if package.classCount < 2:
            continue
        if package.externalSemanticDensity > package.internalSemanticDensity + 0.05:
            package_nodes = [node.id for node in nodes if node.packageName == package.name]
            smells.append(
                SmellCandidate(
                    id=f"smell-{offset + len(smells) + 1}",
                    type="low_package_cohesion_candidate",
                    severity="low",
                    score=round(package.externalSemanticDensity - package.internalSemanticDensity, 4),
                    nodeIds=package_nodes[:5],
                    title=f"{_last_package(package.name)} package may have low semantic cohesion",
                    reason="Classes in this package are, on average, more similar to outside classes than to each other.",
                    evidence=[
                        f"internal semantic density: {package.internalSemanticDensity:.2f}",
                        f"external semantic density: {package.externalSemanticDensity:.2f}",
                    ],
                    recommendation="Inspect package boundaries before moving code; this heuristic is approximate for small packages.",
                )
            )
    return smells[:2]


def _security_attention_points(nodes: list[NodeModel], offset: int) -> list[SmellCandidate]:
    security_nodes = [
        node
        for node in nodes
        if {"security", "authentication"} & set(node.tags) and node.metrics.weightedDegree >= 1.5
    ]
    security_nodes.sort(key=lambda node: (-node.metrics.weightedDegree, node.id))
    smells: list[SmellCandidate] = []
    for index, node in enumerate(security_nodes[:2], start=1):
        smells.append(
            SmellCandidate(
                id=f"smell-{offset + index}",
                type="security_sensitive_attention_point",
                severity="high",
                score=round(min(1.0, node.metrics.weightedDegree / 5.0), 4),
                nodeIds=[node.id],
                title=f"{node.label} is security-sensitive and central",
                reason="Security-tagged classes with central graph position deserve manual review attention.",
                evidence=[
                    f"tags: {', '.join(node.tags)}",
                    f"weighted degree: {node.metrics.weightedDegree:.2f}",
                    f"cross-package edges: {node.metrics.crossPackageEdges}",
                ],
                recommendation="Review authentication, authorization, and token handling assumptions carefully before changing this area.",
            )
        )
    return smells


def _is_validator(node: NodeModel) -> bool:
    return "validator" in node.label.lower()




def _pair_key(left: str, right: str) -> tuple[str, str]:
    return tuple(sorted((left, right)))


def _last_package(package_name: str) -> str:
    return package_name.split(".")[-1] if package_name else "default"
