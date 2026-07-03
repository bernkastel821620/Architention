---
name: architecture-attention-map
description: Use this skill when implementing, reviewing, or extending the Architecture Attention Map MVP: a Java codebase analysis tool that builds class-level dependency graphs, computes attention-inspired semantic relevance scores, and visualizes architecture attention points for topic search and refactoring review.
---

# Architecture Attention Map Skill

## Purpose

This skill guides work on an MVP that analyzes Java/Spring-style projects and visualizes architecture attention points. It is intended for implementation tasks, reviews, refactors, tests, and feature additions related to:

- Java static analysis
- class-level graph construction
- coupling/cohesion heuristics
- embedding or vector-based topic search
- architecture smell candidates
- interactive graph visualization

## Core mental model

Treat each Java class as a code patch. Build two complementary views:

1. **Hard structure**: explicit static relations such as imports, inheritance, fields, constructor dependencies, method signatures, annotations, and textual references to known classes.
2. **Soft semantics**: similarity between class search documents generated from names, package, annotations, methods, dependencies, tags, and optional summaries.

The output is not a proof. It is an evidence-ranked set of review candidates.

## Required pipeline

When asked to implement or modify the analyzer, preserve this pipeline:

1. Scan `.java` files.
2. Extract class-level metadata.
3. Build a class lookup table.
4. Create hard edges with evidence.
5. Build a compact node document for each class.
6. Vectorize documents with the configured provider.
7. Compute pairwise semantic top-k edges.
8. Compute graph metrics.
9. Detect smell candidates.
10. Persist and serve the graph JSON.

## Provider rules

The MVP must work without external API keys.

- Default provider: local deterministic vectorization, e.g. TF-IDF or hashing vectorizer.
- Optional provider: OpenAI embeddings only when enabled by environment variables.
- Optional LLM summaries/explanations must gracefully fall back to deterministic static summaries/templates.

Never make remote AI calls by default during tests.

## Evidence rules

Every node and edge should carry evidence:

- file path
- line number if cheaply available; otherwise omit rather than fabricating
- relation type
- relevant annotation/import/method/dependency snippet
- score components when useful

Never invent source facts or exact line numbers.

## Scoring rules

Use transparent weighted scoring. Avoid opaque magic.

Topic relevance:

```text
0.60 vector similarity + 0.20 keyword + 0.10 tag + 0.10 graph propagation
```

Attention point:

```text
0.40 weighted degree + 0.25 betweenness + 0.20 cross-package edges + 0.15 smell participation
```

If changing weights, update docs and tests.

## Architecture smell interpretation

Use cautious labels:

- possible duplicate or scattered responsibility
- suspicious coupling
- god/hub class candidate
- low package cohesion candidate
- security-sensitive attention point

Do not label findings as “bug”, “bad code”, or “must refactor” unless there is explicit source evidence.

## UI rules

The UI must make uncertainty visible.

- Green means related to the active query.
- Gray/dark means unrelated or low relevance.
- Red/orange means risk/smell, not merely unrelated.
- Show evidence next to scores.
- Allow the user to click a node and inspect why it was highlighted.

## Testing checklist

For any meaningful change, try to keep or add tests for:

- Java scanner output on the sample project
- hard edge extraction
- topic search ranking
- smell detection
- graph JSON schema compatibility
- frontend rendering or type checks

## Do not overbuild

Avoid these unless explicitly requested:

- full compiler-grade Java type resolution
- full call graph
- symbolic execution
- model training
- auto-refactoring
- production auth/multi-tenancy
- large database integration
