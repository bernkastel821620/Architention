from pathlib import Path

from app.analyzer.graph_builder import build_hard_edges
from app.analyzer.java_scanner import JavaScanner
from app.analyzer.pipeline import analyze_project
from app.analyzer.scoring import search_graph


ROOT = Path(__file__).resolve().parents[3]
SAMPLE = ROOT / "examples" / "java-spring-mini"


def test_scanner_extracts_sample_classes():
    nodes = JavaScanner().scan(SAMPLE)
    labels = {node.label for node in nodes}

    assert len(nodes) == 15
    assert {"AuthenticationService", "JwtTokenProvider", "PaymentService", "UserRepository"} <= labels
    auth = next(node for node in nodes if node.label == "AuthenticationService")
    assert "Service" in auth.annotations
    assert "UserRepository" in auth.dependencies
    assert any(method.name == "authenticate" for method in auth.methods)


def test_graph_builder_creates_hard_edges():
    nodes = JavaScanner().scan(SAMPLE)
    edges = build_hard_edges(nodes)
    edge_pairs = {(edge.source, edge.target, edge.type) for edge in edges}

    assert (
        "com.example.demo.security.AuthenticationService",
        "com.example.demo.user.UserRepository",
        "constructor_dependency",
    ) in edge_pairs
    assert any(edge.family == "hard" and edge.weight >= 0.8 for edge in edges)


def test_security_search_ranks_security_classes():
    payload = analyze_project(SAMPLE, "examples/java-spring-mini")
    results = search_graph(payload, "Security", top_k=5)
    top_labels = [result.label for result in results[:4]]

    assert "AuthenticationService" in top_labels
    assert "JwtTokenProvider" in top_labels or "SecurityConfig" in top_labels
    assert results[0].score > 0


def test_smell_detector_returns_review_candidates():
    payload = analyze_project(SAMPLE, "examples/java-spring-mini")
    smell_types = {smell.type for smell in payload.smells}

    assert payload.smells
    assert "possible_duplicate_or_scattered_responsibility" in smell_types
    assert "security_sensitive_attention_point" in smell_types

