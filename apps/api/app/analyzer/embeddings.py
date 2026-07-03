from __future__ import annotations

import math
import re
from collections import Counter


SYNONYMS = {
    "security": ["auth", "authentication", "authorization", "jwt", "token", "password", "credential", "role", "permission"],
    "authentication": ["auth", "login", "credential", "jwt", "token", "security"],
    "payment": ["billing", "charge", "fraud", "transaction", "amount", "money"],
    "persistence": ["repository", "database", "entity", "query", "store", "save", "find"],
    "validation": ["validator", "policy", "rule", "check"],
}

STOPWORDS = {
    "a",
    "an",
    "and",
    "as",
    "class",
    "for",
    "from",
    "in",
    "is",
    "kind",
    "none",
    "of",
    "or",
    "package",
    "public",
    "static",
    "the",
    "to",
    "with",
}


class LocalTfidfVectorizer:
    name = "local-tfidf"

    def __init__(self) -> None:
        self.idf: dict[str, float] = {}

    def fit(self, documents: list[str]) -> None:
        doc_count = max(len(documents), 1)
        document_frequency: Counter[str] = Counter()
        for document in documents:
            document_frequency.update(set(tokenize(document)))
        self.idf = {
            token: math.log((1 + doc_count) / (1 + frequency)) + 1
            for token, frequency in sorted(document_frequency.items())
        }

    def transform(self, text: str) -> dict[str, float]:
        counts = Counter(tokenize(text, expand=True))
        if not counts:
            return {}
        total = sum(counts.values())
        vector: dict[str, float] = {}
        for token, count in counts.items():
            if token in STOPWORDS:
                continue
            tf = count / total
            vector[token] = tf * self.idf.get(token, 1.0)
        return normalize(vector)

    def fit_transform(self, documents: list[str]) -> list[dict[str, float]]:
        self.fit(documents)
        return [self.transform(document) for document in documents]


def tokenize(text: str, expand: bool = False) -> list[str]:
    tokens: list[str] = []
    for raw in re.findall(r"[A-Za-z][A-Za-z0-9]*", text):
        tokens.extend(split_identifier(raw))
    normalized = [token.lower() for token in tokens if token.lower() not in STOPWORDS]
    if not expand:
        return normalized
    expanded = list(normalized)
    for token in normalized:
        expanded.extend(SYNONYMS.get(token, []))
    return expanded


def split_identifier(value: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    return re.findall(r"[A-Za-z0-9]+", spaced)


def normalize(vector: dict[str, float]) -> dict[str, float]:
    length = math.sqrt(sum(value * value for value in vector.values()))
    if length == 0:
        return vector
    return {token: value / length for token, value in vector.items()}


def cosine(left: dict[str, float], right: dict[str, float]) -> float:
    if not left or not right:
        return 0.0
    if len(left) > len(right):
        left, right = right, left
    return sum(value * right.get(token, 0.0) for token, value in left.items())

