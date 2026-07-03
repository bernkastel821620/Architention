# Demo Script — Architecture Attention Map MVP

## Demo title

Architecture Attention Map: finding human attention points in AI-generated codebases

## 60-second pitch

AI coding tools make code generation faster, but they also increase the risk that developers lose architectural control. This MVP analyzes a Java codebase as a graph of class-level patches. It combines static dependency evidence with semantic relevance scoring, then visualizes where a human developer should pay attention. The result is not an automatic refactoring engine; it is an evidence-based architecture review assistant.

## Live demo flow

1. Open the app.
2. Show the sample Java project path: `examples/java-spring-mini`.
3. Click **Analyze**.
4. Point out the graph:
   - nodes are Java classes
   - edges are structural or semantic relations
   - node size represents architecture attention point score
5. Type `Security` in the topic search box.
6. Show that classes like `SecurityConfig`, `JwtTokenProvider`, and `AuthenticationService` are highlighted.
7. Click `AuthenticationService`.
8. Show evidence:
   - package contains security
   - dependencies include user repository and token provider
   - methods imply authentication/token behavior
9. Open smell candidates.
10. Show one candidate such as:
    - high semantic similarity but no direct hard relation between validators
    - suspicious cross-package dependency
    - security-sensitive hub class
11. Close with the message:

> This tool does not replace the architect. It compresses the codebase into evidence-ranked attention points so the architect can decide where to inspect, discuss, and refactor.

## Questions and answers

### Is this real Transformer attention?

No. It is attention-inspired application-level scoring. We borrow the idea of query-to-key relevance and patch-level relationships, but we do not claim to expose or train model-internal attention.

### Why not ask an LLM to analyze the whole repo?

Because all-pairs class analysis becomes expensive and unreliable. The MVP uses cheap static analysis and vectorization for broad scanning, then can optionally use an LLM only for top-k suspicious cases.

### Does cosine similarity prove code duplication?

No. It only creates a hypothesis. The UI shows evidence so a developer can verify whether it is duplication, intentional separation, or a false positive.

### What is the technical novelty?

The value is in combining three signals:

1. hard dependency graph
2. semantic relevance index
3. evidence-backed architecture smell heuristics

The UI turns these into an interactive attention map for human review.

## Backup plan if external APIs fail

The demo must use the local vectorizer by default. Do not depend on remote LLM or embedding APIs during presentation.

## Good demo queries

- `Security`
- `Authentication`
- `JWT token`
- `Payment validation`
- `Persistence repository`
- `Notification`
