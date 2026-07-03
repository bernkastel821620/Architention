# Review Checklist — Architecture Attention Map MVP

Use this checklist before accepting Codex-generated code.

## Product framing

- [ ] UI and docs say “attention-inspired”, not “true Transformer attention”.
- [ ] Findings are phrased as candidates/hypotheses.
- [ ] The app explains why a node or smell was shown.
- [ ] Red/orange colors are reserved for risk, not low query relevance.

## Demo path

- [ ] `examples/java-spring-mini` exists.
- [ ] Demo can run without external API keys.
- [ ] `Security` search returns security/auth/token classes near the top.
- [ ] At least one smell candidate appears.
- [ ] Node click shows evidence.

## Backend

- [ ] `GET /health` works.
- [ ] `POST /api/analyze` works on the sample project.
- [ ] `GET /api/graph` returns nodes/edges/smells.
- [ ] `POST /api/search` returns ranked results with score components.
- [ ] Parser failure on one file does not crash the whole analysis.
- [ ] Cache path is local and documented.

## Analyzer quality

- [ ] Nodes have stable ids.
- [ ] Hard edges have relation type, family, weight, and evidence.
- [ ] Semantic edges are top-k filtered.
- [ ] Score weights are visible in code and docs.
- [ ] Smell candidates include evidence and cautionary recommendations.

## Frontend

- [ ] Graph renders with nodes and edges.
- [ ] Topic search updates node color or result list.
- [ ] Node size reflects attention point score or centrality.
- [ ] Details panel shows tags, dependencies, metrics, and related smells.
- [ ] Loading and error states are readable.

## Tests and commands

- [ ] `make install` works or the README has exact alternative commands.
- [ ] `make test` runs backend tests and frontend type/build check where feasible.
- [ ] `make lint` exists, even if minimal.
- [ ] Codex reports any command it could not run and why.

## Anti-overengineering check

Reject or defer changes that introduce these before the MVP works:

- full Java compiler integration
- full call graph/type solver
- model training
- automatic refactoring
- database migration stack
- auth/multi-user system
- complex deployment infra
