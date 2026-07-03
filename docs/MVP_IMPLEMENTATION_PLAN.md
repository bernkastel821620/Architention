# MVP Implementation Plan — Architecture Attention Map

## 0. Product definition

**One-sentence product:** A local developer tool that analyzes a Java project, builds a class-level architecture graph, and highlights where a human should pay attention when searching topics like `Security`, `Payment`, or `Authentication`.

**Correct technical framing:** This is an **attention-inspired code architecture navigation tool**, not a trained attention model.

**MVP outcome:** A live web demo where a user analyzes a sample Java project, enters `Security`, sees relevant classes turn green, clicks nodes for evidence, and sees suspicious architecture candidates.

## 1. MVP architecture

```text
Java project directory
        │
        ▼
Java scanner / metadata extractor
        │
        ├── class nodes
        ├── hard structural edges
        └── class search documents
        │
        ▼
Vectorization / embeddings
        │
        ├── local deterministic provider by default
        └── optional remote embedding provider
        │
        ▼
Graph + scoring engine
        │
        ├── semantic top-k edges
        ├── node attention scores
        ├── package cohesion metrics
        └── smell candidates
        │
        ▼
FastAPI backend
        │
        ▼
React graph UI
```

## 2. Implementation sequence for Codex

### Phase 1 — scaffold the repo

Create a monorepo with:

- `apps/api` for FastAPI
- `apps/web` for React/TypeScript
- `examples/java-spring-mini` for the demo target
- `docs` for plan and data contract
- root `Makefile`

Acceptance criteria:

- `make install` installs backend/frontend dependencies.
- `make dev` either starts both services or documents two commands.
- `GET /health` returns a JSON status.

### Phase 2 — create the sample Java project

Create about 10–15 classes:

```text
com.example.demo.security
  SecurityConfig
  JwtTokenProvider
  AuthenticationService
  PasswordPolicyValidator

com.example.demo.user
  UserController
  UserService
  UserRepository
  UserRegistrationValidator

com.example.demo.payment
  PaymentController
  PaymentService
  PaymentFraudValidator
  PaymentRepository

com.example.demo.order
  OrderController
  OrderService

com.example.demo.notification
  EmailNotificationService
```

Intentional signals:

- `AuthenticationService` depends on `UserRepository`, `PasswordPolicyValidator`, and `JwtTokenProvider`.
- `PaymentFraudValidator` and `UserRegistrationValidator` should have semantically similar validation responsibility but no direct hard edge.
- `PaymentService` should depend on security/user-like concepts so there is at least one cross-package attention point.
- Use annotations/comments that look like Spring but do not require actual Spring dependencies.

Acceptance criteria:

- Analyzer can extract every class.
- Query `Security` ranks `SecurityConfig`, `JwtTokenProvider`, and `AuthenticationService` near the top.

### Phase 3 — implement Java scanning

Implement `java_scanner.py` with a best-effort approach:

- recursively find `.java` files
- extract package
- extract imports
- extract annotations
- extract top-level class/interface/enum names
- extract extends/implements
- extract method names/signatures
- extract fields and constructor parameters if feasible
- preserve source snippet for details view

Use parser libraries only if they can be installed reliably. Always keep a regex/text fallback so the demo does not fail because one file has modern Java syntax.

Acceptance criteria:

- Unit test scans sample project and returns expected classes.
- Parser failure on one file does not crash the whole analysis.

### Phase 4 — build hard graph

Implement `graph_builder.py`:

- node id: stable hash or fully-qualified class name
- hard edges based on:
  - extends / implements
  - field or constructor dependency
  - method signature dependency
  - method body textual reference to known class names
  - import-only relation as low weight

Edge schema:

```json
{
  "source": "com.example.demo.security.AuthenticationService",
  "target": "com.example.demo.user.UserRepository",
  "type": "constructor_dependency",
  "family": "hard",
  "weight": 0.8,
  "evidence": "constructor parameter UserRepository userRepository"
}
```

Acceptance criteria:

- Edges are typed and weighted.
- Same pair may have multiple evidence items or a combined evidence string.
- Hard edges are visible in `/api/graph`.

### Phase 5 — build node documents and tags

Implement `document_builder.py`.

Node document should concatenate structured evidence:

```text
Class: AuthenticationService
Package: com.example.demo.security
Kind: class
Annotations: Service, Transactional
Imports: UserRepository, PasswordPolicyValidator, JwtTokenProvider
Methods: authenticate, refreshToken, validateCredentials
Dependencies: UserRepository, PasswordPolicyValidator, JwtTokenProvider
Static behavior summary: authenticates users, validates credentials, issues or refreshes JWT tokens
Tags: security, authentication, jwt, user, validation
```

Tag rules:

- security/auth tags from names and annotations: security, auth, jwt, token, password, credential, role, permission, preauthorize
- persistence tags: repository, entity, database, query, jdbc, jpa
- API tags: controller, request, response, endpoint
- domain tags from package/class names

Acceptance criteria:

- Documents are deterministic.
- Each node has tags and a readable document string.

### Phase 6 — vectorization and semantic edges

Implement `embeddings.py` with provider abstraction.

Default provider:

- local TF-IDF or hashing vectorizer
- deterministic
- no network
- must support fitting documents and transforming a query

Optional provider:

- enabled only when environment variable explicitly requests it
- uses external embedding API only if key exists
- failures fall back to local provider

Implement semantic edges:

- normalize vectors
- compute cosine similarity
- keep top-k neighbors per node
- do not create all possible edges in UI payload unless needed

Acceptance criteria:

- `/api/search` works without an API key.
- `Security` returns plausible ranking.
- Semantic edges have `family: "soft"` and evidence such as `semantic similarity over class document`.

### Phase 7 — scoring and smells

Implement `scoring.py` and `smells.py`.

Required metrics:

- weighted degree
- cross-package edge count
- betweenness centrality if NetworkX is available
- package-level internal/external density

Required smell candidates:

1. `possible_duplicate_or_scattered_responsibility`
   - high semantic similarity
   - low or no hard relation
   - different packages or sibling modules
2. `suspicious_coupling`
   - high hard relation
   - low semantic similarity
   - cross-package
3. `hub_class_candidate`
   - unusually high degree or betweenness
4. `low_package_cohesion_candidate`
   - package internal semantic density lower than external density
5. `security_sensitive_attention_point`
   - security tag + high centrality

Acceptance criteria:

- Sample project returns at least one smell candidate.
- Each smell includes reason, evidence, node ids, score, and cautionary wording.

### Phase 8 — API

Implement FastAPI endpoints:

- `GET /health`
- `POST /api/analyze`
- `GET /api/graph`
- `POST /api/search`
- `GET /api/nodes/{nodeId}`
- optional `POST /api/explain`

Acceptance criteria:

- OpenAPI docs load.
- Endpoints return schema-compatible JSON.
- Analyze result is cached.

### Phase 9 — frontend

Build the UI around the demo flow:

1. Analyze repo.
2. Show graph.
3. Enter topic.
4. Highlight nodes.
5. Inspect evidence.
6. Show smells.

Visual rules:

- node size = attention point score
- node color = active topic relevance
- red/orange overlay = smell/risk only
- edge thickness = weight
- edge label or tooltip = relation type

Acceptance criteria:

- Search input immediately updates result list and graph colors.
- Clicking a node shows details.
- Smell panel is visible.
- Demo works with `examples/java-spring-mini`.

### Phase 10 — tests and final polish

Minimum tests:

- scanner test
- graph builder test
- search ranking test
- smell detector test
- API smoke test

Final polish:

- README or demo script explains the framing.
- UI has example query chips.
- Scores are shown with evidence.
- Failure states are readable.

## 3. Suggested 2-day execution order

### Day 1 morning

- scaffold repo
- create sample Java project
- implement scanner
- return `/api/analyze` with raw nodes

### Day 1 afternoon

- implement hard graph
- implement document builder
- implement local vectorizer
- implement `/api/search`

### Day 1 evening

- implement graph UI
- connect analyze/search
- make `Security` demo work

### Day 2 morning

- implement smell candidates
- implement node detail panel
- improve evidence strings
- add tests

### Day 2 afternoon

- polish UI
- tune sample project
- prepare demo script
- cache analysis for reliable presentation

## 4. Cut lines if time is short

Cut in this order:

1. optional external embeddings
2. optional LLM explanations
3. package cohesion metric
4. exact method-level details
5. heatmap/matrix visualization
6. Mermaid export

Do not cut:

- sample project
- class nodes
- hard edges
- topic search
- graph UI
- evidence panel
