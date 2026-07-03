from __future__ import annotations

from collections import defaultdict, deque

from app.analyzer.embeddings import LocalTfidfVectorizer, cosine, tokenize
from app.models import EdgeModel, GraphPayload, NodeModel, SearchResult


def compute_node_metrics(nodes: list[NodeModel], edges: list[EdgeModel], smell_counts: dict[str, int] | None = None) -> None:
    smell_counts = smell_counts or {}
    weighted_degree: dict[str, float] = defaultdict(float)
    cross_package: dict[str, int] = defaultdict(int)
    node_by_id = {node.id: node for node in nodes}

    for edge in edges:
        if edge.family == "soft":
            weight = edge.weight * 0.35
        else:
            weight = edge.weight
        weighted_degree[edge.source] += weight
        weighted_degree[edge.target] += weight
        source = node_by_id.get(edge.source)
        target = node_by_id.get(edge.target)
        if source and target and source.packageName != target.packageName:
            cross_package[edge.source] += 1
            cross_package[edge.target] += 1

    betweenness = _betweenness(nodes, edges)
    max_degree = max(weighted_degree.values() or [1.0])
    max_betweenness = max(betweenness.values() or [1.0])
    max_cross = max(cross_package.values() or [1])
    max_smells = max(smell_counts.values() or [1])

    for node in nodes:
        degree = round(weighted_degree[node.id], 4)
        between = round(betweenness.get(node.id, 0.0), 4)
        cross = cross_package[node.id]
        smell_count = smell_counts.get(node.id, 0)
        degree_norm = degree / max_degree if max_degree else 0.0
        between_norm = between / max_betweenness if max_betweenness else 0.0
        cross_norm = cross / max_cross if max_cross else 0.0
        smell_norm = smell_count / max_smells if max_smells else 0.0
        attention = 0.40 * degree_norm + 0.25 * between_norm + 0.20 * cross_norm + 0.15 * smell_norm
        node.metrics.weightedDegree = degree
        node.metrics.betweenness = between
        node.metrics.crossPackageEdges = cross
        node.metrics.smellParticipationCount = smell_count
        node.metrics.attentionPointScore = round(attention, 4)


def search_graph(payload: GraphPayload, query: str, top_k: int = 20, include_graph_propagation: bool = True) -> list[SearchResult]:
    documents = [node.document for node in payload.nodes]
    vectorizer = LocalTfidfVectorizer()
    node_vectors = vectorizer.fit_transform(documents)
    query_vector = vectorizer.transform(query)
    vector_scores = {
        node.id: cosine(query_vector, node_vectors[index])
        for index, node in enumerate(payload.nodes)
    }
    keyword_scores = {node.id: _keyword_score(query, node) for node in payload.nodes}
    tag_scores = {node.id: _tag_score(query, node) for node in payload.nodes}
    graph_scores = _graph_scores(payload.nodes, payload.edges, vector_scores) if include_graph_propagation else {}

    results: list[SearchResult] = []
    for node in payload.nodes:
        vector = vector_scores.get(node.id, 0.0)
        keyword = keyword_scores.get(node.id, 0.0)
        tag = tag_scores.get(node.id, 0.0)
        graph = graph_scores.get(node.id, 0.0)
        score = 0.60 * vector + 0.20 * keyword + 0.10 * tag + 0.10 * graph
        results.append(
            SearchResult(
                nodeId=node.id,
                label=node.label,
                score=round(score, 4),
                rank=0,
                scoreComponents={
                    "vector": round(vector, 4),
                    "keyword": round(keyword, 4),
                    "tag": round(tag, 4),
                    "graph": round(graph, 4),
                },
                evidence=_search_evidence(query, node, vector, keyword, tag, graph),
            )
        )

    results.sort(key=lambda item: (-item.score, item.label))
    for index, result in enumerate(results[:top_k], start=1):
        result.rank = index
    return results[:top_k]


def _keyword_score(query: str, node: NodeModel) -> float:
    query_tokens = set(tokenize(query, expand=True))
    if not query_tokens:
        return 0.0
    node_tokens = set(tokenize(" ".join([node.label, node.packageName, node.document]), expand=False))
    matches = query_tokens & node_tokens
    return min(1.0, len(matches) / max(1, min(len(query_tokens), 4)))


def _tag_score(query: str, node: NodeModel) -> float:
    query_tokens = set(tokenize(query, expand=True))
    tags = set(node.tags)
    if not query_tokens or not tags:
        return 0.0
    return min(1.0, len(query_tokens & tags) / max(1, min(len(query_tokens), 3)))


def _graph_scores(nodes: list[NodeModel], edges: list[EdgeModel], vector_scores: dict[str, float]) -> dict[str, float]:
    raw_scores = defaultdict(float)
    weight_totals = defaultdict(float)
    for edge in edges:
        if edge.family == "soft":
            continue
        raw_scores[edge.source] += vector_scores.get(edge.target, 0.0) * edge.weight
        raw_scores[edge.target] += vector_scores.get(edge.source, 0.0) * edge.weight
        weight_totals[edge.source] += edge.weight
        weight_totals[edge.target] += edge.weight
    scores = {
        node.id: (raw_scores[node.id] / weight_totals[node.id]) if weight_totals[node.id] else 0.0
        for node in nodes
    }
    max_score = max(scores.values() or [1.0])
    if max_score <= 0:
        return scores
    return {node_id: score / max_score for node_id, score in scores.items()}


def _search_evidence(query: str, node: NodeModel, vector: float, keyword: float, tag: float, graph: float) -> list[str]:
    evidence: list[str] = []
    query_tokens = set(tokenize(query, expand=True))
    tag_matches = sorted(query_tokens & set(node.tags))
    if tag_matches:
        evidence.append(f"tag match: {', '.join(tag_matches)}")
    method_matches = [
        method.name
        for method in node.methods
        if query_tokens & set(tokenize(method.name, expand=True))
    ]
    if method_matches:
        evidence.append(f"method names include {', '.join(method_matches[:3])}")
    if keyword > 0:
        evidence.append("class document contains related keywords")
    if vector >= 0.2:
        evidence.append(f"document vector similarity {vector:.2f}")
    if graph >= 0.2:
        evidence.append("near related classes in the hard dependency graph")
    if not evidence:
        evidence.append("low direct evidence for this topic")
    return evidence


def _betweenness(nodes: list[NodeModel], edges: list[EdgeModel]) -> dict[str, float]:
    node_ids = [node.id for node in nodes]
    adjacency: dict[str, set[str]] = {node_id: set() for node_id in node_ids}
    for edge in edges:
        if edge.family == "soft":
            continue
        adjacency.setdefault(edge.source, set()).add(edge.target)
        adjacency.setdefault(edge.target, set()).add(edge.source)

    scores = dict.fromkeys(node_ids, 0.0)
    for source in node_ids:
        stack: list[str] = []
        predecessors: dict[str, list[str]] = {node_id: [] for node_id in node_ids}
        sigma = dict.fromkeys(node_ids, 0.0)
        distance = dict.fromkeys(node_ids, -1)
        sigma[source] = 1.0
        distance[source] = 0
        queue: deque[str] = deque([source])

        while queue:
            vertex = queue.popleft()
            stack.append(vertex)
            for neighbor in adjacency.get(vertex, set()):
                if distance[neighbor] < 0:
                    queue.append(neighbor)
                    distance[neighbor] = distance[vertex] + 1
                if distance[neighbor] == distance[vertex] + 1:
                    sigma[neighbor] += sigma[vertex]
                    predecessors[neighbor].append(vertex)

        delta = dict.fromkeys(node_ids, 0.0)
        while stack:
            vertex = stack.pop()
            for predecessor in predecessors[vertex]:
                if sigma[vertex]:
                    delta[predecessor] += (sigma[predecessor] / sigma[vertex]) * (1 + delta[vertex])
            if vertex != source:
                scores[vertex] += delta[vertex]

    if len(node_ids) > 2:
        scale = 1 / ((len(node_ids) - 1) * (len(node_ids) - 2))
        scores = {node_id: value * scale for node_id, value in scores.items()}
    return scores

