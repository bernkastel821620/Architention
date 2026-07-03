# Prompt to Paste into Codex

Use this prompt after placing `AGENTS.md`, `.agents/skills/architecture-attention-map/SKILL.md`, and the docs in the repository root.

```text
Read AGENTS.md and use the architecture-attention-map skill if available.

Implement the Architecture Attention Map MVP end-to-end.

Goal:
Create a local developer tool that analyzes a Java/Spring-style project, builds a class-level graph, computes attention-inspired relevance scores, and visualizes topic search results such as "Security".

First, inspect the repository. Then produce a short implementation plan before writing code. Keep the implementation MVP-focused and deterministic by default.

Required deliverables:
1. FastAPI backend under apps/api.
2. React TypeScript frontend under apps/web.
3. Sample Java project under examples/java-spring-mini with 10–15 classes.
4. Java scanner that extracts packages, classes, annotations, imports, methods, dependencies, and source previews.
5. Graph builder with hard structural edges.
6. Local vectorizer/embedding provider that works without external API keys.
7. Topic search endpoint for queries like Security, Payment, Authentication, Persistence.
8. Smell candidate detector for possible duplicate/scattered responsibility, suspicious coupling, hub class, low package cohesion, and security-sensitive attention points.
9. Interactive graph UI with search input, colored nodes, node details, and smell list.
10. Tests and root Makefile commands: make install, make dev, make test, make lint.

Important constraints:
- Do not train a model.
- Do not require OpenAI or any external API key for the default demo.
- Do not claim the result is true Transformer attention.
- Do not present smell candidates as definitive errors.
- Keep static Java analysis best-effort and document limitations.
- Prefer a working vertical slice over broad incomplete architecture.

After implementation, run the available tests or smoke checks and summarize what works, what is approximate, and how to demo the app.
```
