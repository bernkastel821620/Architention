# AGENTS.md — Architecture Attention Map MVP

## Product mission

Build an MVP called **Architecture Attention Map**.

The product helps a developer understand a Java/Spring-style codebase when AI-generated code has increased volume and complexity. It does **not** train a new Transformer model. It implements an **attention-inspired architecture navigation tool**: parse code into class-level patches, build a static dependency graph, compute semantic relevance with embeddings or a deterministic local fallback, and visualize where the human developer should pay attention.

The core user story is:

> As a developer, I enter a topic such as `Security`, `Authentication`, `Payment`, or `Persistence`, and the UI immediately highlights the classes/modules most related to that topic, shows dependency evidence, and lists suspicious architecture relations such as high coupling, scattered responsibility, or possible duplicated behavior.

## Critical framing rules

Use precise language in UI labels, code comments, and docs.

- Say **attention-inspired score**, **architecture relevance score**, or **codebase attention map**.
- Do not claim that cosine similarity is the same as Transformer attention.
- Do not claim that semantic similarity proves duplicate behavior.
- Treat all findings as **review candidates** or **architecture hypotheses**, not automatic refactoring truth.
- Prefer evidence-backed wording: “possible duplicated responsibility”, “suspicious coupling”, “misplaced responsibility candidate”, “central attention point”.

## MVP scope

Implement an end-to-end local demo with these capabilities:

1. Analyze a Java project directory.
2. Extract class-level nodes from `.java` files.
3. Extract best-effort structural relationships:
   - package
   - imports
   - class/interface/enum name
   - annotations
   - extends / implements
   - fields and constructor dependencies where feasible
   - method names, parameters, return types where feasible
   - simple textual references to other known classes
4. Build a graph with class nodes and typed edges.
5. Build an embedding/search document for each class from structural evidence plus a short behavior-like static summary.
6. Compute semantic or lexical-similarity scores using a provider abstraction:
   - default: local deterministic vectorizer so the demo runs without external keys
   - optional: OpenAI embeddings if `OPENAI_API_KEY` and `ENABLE_OPENAI_EMBEDDINGS=1` are present
7. Compute graph metrics and architecture smell candidates.
8. Expose a backend API.
9. Provide a React-based frontend that visualizes the graph and topic search results.
10. Include a small sample Java project under `examples/java-spring-mini/` so the demo works without external setup.

## Non-goals for the MVP

Do not spend MVP time on these unless all required features are already working:

- Training an attention model.
- Implementing a full Java compiler, exact type resolver, or full call graph.
- Full Code Property Graph, control-flow graph, data-flow graph, or symbolic execution.
- Automatic refactoring patches.
- Multi-language analysis.
- Authentication, multi-user persistence, SaaS deployment, or production security hardening.
- A large database. JSON cache files are enough.
- Manim animations. This is an interactive tool, not a video-rendering project.
- Mermaid as the main visualization. Mermaid may be exported as a secondary text artifact, but the primary UX should be interactive graph visualization.

## Recommended repository layout

Create or maintain this structure:

```text
.
├── AGENTS.md
├── Makefile
├── apps/
│   ├── api/
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── models.py
│   │   │   ├── analyzer/
│   │   │   │   ├── java_scanner.py
│   │   │   │   ├── document_builder.py
│   │   │   │   ├── graph_builder.py
│   │   │   │   ├── embeddings.py
│   │   │   │   ├── scoring.py
│   │   │   │   └── smells.py
│   │   │   └── storage.py
│   │   ├── tests/
│   │   └── requirements.txt
│   └── web/
│       ├── src/
│       │   ├── App.tsx
│       │   ├── api.ts
│       │   ├── components/
│       │   │   ├── GraphCanvas.tsx
│       │   │   ├── SearchPanel.tsx
│       │   │   ├── NodeDetails.tsx
│       │   │   └── SmellList.tsx
│       │   └── types.ts
│       └── package.json
├── docs/
│   ├── MVP_IMPLEMENTATION_PLAN.md
│   ├── DATA_CONTRACT.md
│   ├── CODEX_PROMPT.md
│   ├── REVIEW_CHECKLIST.md
│   └── DEMO_SCRIPT.md
└── examples/
    └── java-spring-mini/
```

If the project already has a different layout, preserve it, but keep the same separation of concerns: API, frontend, analyzer, docs, sample project, tests.

## Suggested stack

Use simple, hackathon-safe defaults.

Backend:

- Python 3.11+
- FastAPI
- Pydantic
- NumPy
- NetworkX
- scikit-learn for deterministic local TF-IDF/vectorizer fallback
- optional Java parser dependency if reliable in the environment; otherwise implement a robust regex/text fallback

Frontend:

- React + TypeScript
- Vite is acceptable for speed; Next.js is acceptable if already scaffolded
- `react-force-graph-2d`, React Flow, or a similar interactive graph component
- A small UI state store is enough; avoid heavy app architecture

Do not block the MVP on remote LLM calls. Remote AI features must be optional.

## Backend API requirements

Implement these endpoints:

- `GET /health`
- `POST /api/analyze`
  - body: `{ "repoPath": "examples/java-spring-mini", "force": false }`
  - analyzes a trusted local path and writes/updates cache
- `GET /api/graph`
  - returns the latest graph JSON
- `POST /api/search`
  - body: `{ "query": "Security", "topK": 20 }`
  - returns node relevance scores and evidence
- `GET /api/nodes/{nodeId}`
  - returns node detail, source snippet, dependencies, tags, evidence
- `POST /api/explain`
  - optional for MVP; deterministic template is acceptable
  - body may reference a node or suspicious pair

Local path analysis is acceptable for a local developer tool MVP. Add a clear comment that `repoPath` is trusted local input and not suitable for public deployment without sandboxing.

## Data model requirements

Follow `docs/DATA_CONTRACT.md`. The graph payload must have:

- `nodes[]`
- `edges[]`
- `packages[]`
- `smells[]`
- `meta`

Each node must include:

- stable id
- class name
- package
- file path
- kind
- annotations
- methods
- fields/dependencies if available
- tags
- document text used for embedding/search
- metrics such as degree and attention point score

Each edge must include:

- source id
- target id
- edge type
- weight
- evidence string
- relation family: `hard`, `soft`, or `derived`

## Analysis pipeline

Implement the pipeline in this order:

1. Scan Java files.
2. Parse/extract class metadata.
3. Build class lookup by simple and fully-qualified name.
4. Build hard structural edges.
5. Build node documents for vectorization.
6. Fit/load embeddings or local vectors.
7. Compute semantic top-k edges.
8. Compute metrics and smells.
9. Persist `analysis.json` under `.arch-attention/cache/`.
10. Serve results through API.

The pipeline should be callable from Python code and from an API endpoint. Keep it deterministic when no external API is used.

## Scoring rules

Use transparent scoring. Prefer simple formulas over opaque heuristics.

Hard relation weights:

- `extends`: 1.00
- `implements`: 0.90
- constructor or field dependency: 0.80
- method parameter or return type reference: 0.65
- method body textual reference to another known class: 0.55
- annotation related to framework/security/persistence: 0.35
- import-only relation: 0.20

Semantic edges:

- compute pairwise cosine similarity between normalized node vectors
- keep only top `k=5` semantic neighbors per node by default
- ignore semantic edges below a configurable threshold, default `0.25` for local TF-IDF and `0.35` for true embedding providers

Topic search score:

```text
relevance(node, query) =
  0.60 * vector_similarity(query, node.document)
+ 0.20 * keyword_score(query, node)
+ 0.10 * tag_score(query, node)
+ 0.10 * graph_propagation_score(query, node)
```

Architecture attention point score:

```text
attention_point(node) =
  0.40 * normalized_weighted_degree
+ 0.25 * normalized_betweenness
+ 0.20 * normalized_cross_package_edge_count
+ 0.15 * normalized_smell_participation_count
```

Smell candidates:

- `possible_duplicate_or_scattered_responsibility`: high semantic score, low hard relation, different packages or sibling modules
- `suspicious_coupling`: high hard relation, low semantic score, cross-package relation
- `god_or_hub_class_candidate`: very high weighted degree or betweenness
- `low_package_cohesion_candidate`: package contains classes whose internal semantic density is lower than external semantic density
- `security_sensitive_attention_point`: class has security tags and high graph centrality

Never present smell candidates as definitive errors.

## Frontend requirements

The MVP UI should have four visible areas:

1. Repo analyze panel
   - input for local repo path
   - analyze button
   - status: number of files/classes/edges/smells
2. Topic search panel
   - query input, examples: `Security`, `Payment`, `Authentication`, `Persistence`
   - top-k result list with evidence
3. Graph visualization
   - node size: attention point score
   - node color: topic relevance when a query is active
   - edge thickness: relation weight
   - edge style or label: hard/soft/derived
   - clicking node opens details
4. Details/smell panel
   - selected node evidence
   - related classes
   - suspicious pairs
   - explanation template

Color semantics:

- Use green/high-saturation for high topic relevance.
- Use neutral gray/dark gray for low topic relevance.
- Reserve red/orange for architecture risk or smell overlays.
- Do not use red merely to mean “unrelated”, because red implies danger.

## Sample project requirement

Create a small Java sample under `examples/java-spring-mini/` if none exists. It should include about 10–15 classes across packages such as:

- `security`
- `user`
- `payment`
- `order`
- `notification`
- `common`

Include intentional architecture signals:

- a security-related hub class
- two validators with similar behavior but no direct relation
- a payment service that depends on a user/security class
- repository-like classes
- annotations such as `@Service`, `@Repository`, `@Controller`, `@Configuration`, `@PreAuthorize`, or comments that simulate Spring concepts

The sample does not need to compile as a real Spring app. It only needs to be realistic enough for static analysis.

## Testing and verification

Implement at least these checks:

Backend tests:

- scanner extracts classes from the sample Java project
- graph builder creates hard edges when a class references another class
- search for `Security` returns security/authentication/token-related classes above unrelated classes
- smell detector returns at least one candidate on the sample project

Frontend checks:

- app renders without crashing
- API types are consistent
- topic search updates node colors or result list

Root commands to create/maintain:

```bash
make install
make dev
make test
make lint
```

If full linting is too slow during the hackathon, `make test` must still run backend unit tests and a frontend type/build check.

## Implementation discipline for Codex

When implementing:

1. Inspect existing files before creating new structure.
2. Keep changes small and incremental.
3. Prefer working vertical slices over broad incomplete scaffolding.
4. After each major feature, run relevant tests or a smoke command.
5. Do not add expensive dependencies unless they directly support the MVP.
6. Do not require external API keys for the default demo path.
7. Add comments where heuristics are approximate.
8. Keep docs aligned with actual commands.

Definition of done:

- `make install` works or has clear instructions.
- `make dev` starts API and frontend, or separate commands are documented.
- `POST /api/analyze` can analyze the sample Java project.
- UI can search `Security` and highlights relevant nodes.
- UI shows at least one suspicious architecture candidate.
- `make test` passes or failures are documented with actionable reasons.
