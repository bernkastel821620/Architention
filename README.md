# Architecture Attention Map

Architecture Attention Map is a local developer MVP for exploring Java/Spring-style projects. It scans Java classes, builds a class-level dependency graph, computes deterministic attention-inspired relevance scores, and shows architecture review candidates.

The default demo does not train a model and does not require OpenAI or any external API key. The local vectorizer is a transparent TF-IDF-style implementation over class documents.

## Layout

- `apps/api`: FastAPI backend and analyzer pipeline.
- `apps/web`: React TypeScript frontend.
- `examples/java-spring-mini`: 15-class Spring-like sample project.
- `docs`: data contract, demo script, and implementation notes.

## Commands

```bash
make install
make dev
make test
make lint
```

`make dev` starts the API on `http://127.0.0.1:8000` and the web app on `http://127.0.0.1:5173`.

If your shell does not support parallel Make jobs on Windows, run these in two terminals:

```bash
python -m uvicorn app.main:app --app-dir apps/api --reload --host 127.0.0.1 --port 8000
cd apps/web && npm run dev
```

If `make` is not installed, the direct verification commands are:

```bash
cd apps/api && python -m pytest
cd apps/web && npm run build
python -m compileall apps/api/app
cd apps/web && npm run lint
```

## Demo

1. Start the app with `make dev`.
2. Open `http://127.0.0.1:5173`.
3. Keep the repo path as `examples/java-spring-mini`.
4. Click Analyze.
5. Search for `Security`, `Payment`, `Authentication`, or `Persistence`.
6. Click nodes to inspect dependency evidence and source previews.

## API

- `GET /health`
- `POST /api/analyze`
- `GET /api/graph`
- `POST /api/search`
- `GET /api/nodes/{nodeId}`
- `POST /api/explain`

## Limitations

The Java scanner is best-effort static text analysis, not compiler-grade type resolution. Semantic scores are local vector similarities, not true Transformer attention. Smell entries are review candidates and architecture hypotheses, not definitive errors.
