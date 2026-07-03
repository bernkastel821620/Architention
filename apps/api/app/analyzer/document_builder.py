from __future__ import annotations

import re

from app.models import NodeModel


TAG_RULES = {
    "security": ["security", "secure", "auth", "jwt", "token", "password", "credential", "role", "permission", "preauthorize"],
    "authentication": ["auth", "login", "token", "credential", "principal"],
    "payment": ["payment", "invoice", "fraud", "charge", "money", "amount", "card"],
    "persistence": ["repository", "entity", "database", "query", "jdbc", "jpa", "save", "find"],
    "api": ["controller", "request", "response", "endpoint", "mapping"],
    "validation": ["validator", "validate", "policy", "rule", "check"],
    "order": ["order", "checkout", "cart"],
    "notification": ["notification", "email", "message"],
}


def enrich_nodes(nodes: list[NodeModel]) -> list[NodeModel]:
    return [enrich_node(node) for node in nodes]


def enrich_node(node: NodeModel) -> NodeModel:
    tokens = _tokens(
        " ".join(
            [
                node.label,
                node.packageName,
                " ".join(node.annotations),
                " ".join(node.imports),
                " ".join(method.name for method in node.methods),
                " ".join(method.returnType for method in node.methods),
                " ".join(" ".join(method.parameters) for method in node.methods),
                " ".join(node.dependencies),
                " ".join(node.fields),
                node.sourcePreview[:1500],
            ]
        )
    )
    tags = _derive_tags(tokens, node)
    summary = _summary(node, tags)
    document_parts = [
        f"Class: {node.label}",
        f"Package: {node.packageName}",
        f"Kind: {node.kind}",
        f"Annotations: {', '.join(node.annotations) or 'none'}",
        f"Imports: {', '.join(_simple_name(item) for item in node.imports) or 'none'}",
        f"Methods: {', '.join(method.signature for method in node.methods) or 'none'}",
        f"Fields: {', '.join(node.fields) or 'none'}",
        f"Dependencies: {', '.join(node.dependencies) or 'none'}",
        f"Static behavior summary: {summary}",
        f"Tags: {', '.join(tags) or 'none'}",
    ]
    node.tags = tags
    node.summary = summary
    node.document = "\n".join(document_parts)
    return node


def _derive_tags(tokens: set[str], node: NodeModel) -> list[str]:
    tags: list[str] = []
    for tag, hints in TAG_RULES.items():
        if any(hint in tokens for hint in hints):
            tags.append(tag)

    for part in node.packageName.split("."):
        if part and part not in {"com", "example", "demo"}:
            tags.append(part.lower())

    for annotation in node.annotations:
        lowered = annotation.lower()
        if lowered in {"service", "controller", "repository", "configuration"}:
            tags.append(lowered)

    return _unique(tags)


def _summary(node: NodeModel, tags: list[str]) -> str:
    label_words = " ".join(_split_identifier(node.label))
    if "security" in tags or "authentication" in tags:
        return f"{node.label} handles security-related behavior such as {label_words}, token, credential, or authorization review points."
    if "payment" in tags:
        return f"{node.label} handles payment-related behavior such as {label_words}, fraud checks, amounts, or transactions."
    if "persistence" in tags:
        return f"{node.label} provides persistence-style access around {label_words} data."
    if "api" in tags:
        return f"{node.label} exposes request/response workflow around {label_words}."
    if "validation" in tags:
        return f"{node.label} validates policy and rule-like behavior around {label_words}."
    return f"{node.label} participates in the {node.packageName or 'default'} package with methods {', '.join(method.name for method in node.methods[:4]) or 'not extracted'}."


def _tokens(text: str) -> set[str]:
    expanded = []
    for piece in re.findall(r"[A-Za-z][A-Za-z0-9]*", text):
        expanded.extend(_split_identifier(piece))
    return {item.lower() for item in expanded}


def _split_identifier(value: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    return re.findall(r"[A-Za-z0-9]+", spaced.lower())


def _simple_name(value: str) -> str:
    return value.split(".")[-1]


def _unique(values: list[str]) -> list[str]:
    seen = set()
    result = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result

