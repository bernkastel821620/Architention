# Data Contract — Architecture Attention Map MVP

This document defines the JSON payloads used between the FastAPI backend and the React frontend.

## Analyze request

`POST /api/analyze`

```json
{
  "repoPath": "examples/java-spring-mini",
  "force": false,
  "maxFiles": 1000
}
```

Notes:

- `repoPath` is trusted local input for an MVP developer tool.
- For a public deployment, this must be replaced with sandboxed upload/checkout handling.

## Analyze response

```json
{
  "ok": true,
  "analysisId": "local-2026-07-02T12-00-00",
  "meta": {
    "repoPath": "examples/java-spring-mini",
    "javaFileCount": 14,
    "classCount": 14,
    "edgeCount": 37,
    "smellCount": 5,
    "provider": "local-tfidf",
    "cached": false
  }
}
```

## Graph response

`GET /api/graph`

```json
{
  "meta": {
    "analysisId": "local-...",
    "repoPath": "examples/java-spring-mini",
    "provider": "local-tfidf",
    "createdAt": "2026-07-02T12:00:00Z",
    "classCount": 14,
    "edgeCount": 37
  },
  "nodes": [],
  "edges": [],
  "packages": [],
  "smells": []
}
```

## Node

```json
{
  "id": "com.example.demo.security.AuthenticationService",
  "label": "AuthenticationService",
  "qualifiedName": "com.example.demo.security.AuthenticationService",
  "packageName": "com.example.demo.security",
  "kind": "class",
  "filePath": "examples/java-spring-mini/src/main/java/com/example/demo/security/AuthenticationService.java",
  "annotations": ["Service", "Transactional"],
  "imports": ["com.example.demo.user.UserRepository"],
  "methods": [
    {
      "name": "authenticate",
      "signature": "authenticate(String username, String password)",
      "returnType": "AuthToken"
    }
  ],
  "dependencies": ["UserRepository", "PasswordPolicyValidator", "JwtTokenProvider"],
  "tags": ["security", "authentication", "jwt", "user", "validation"],
  "document": "Class: AuthenticationService ...",
  "summary": "Authenticates users, validates credentials, and issues JWT tokens.",
  "metrics": {
    "weightedDegree": 2.7,
    "betweenness": 0.18,
    "crossPackageEdges": 2,
    "attentionPointScore": 0.76
  }
}
```

## Edge

```json
{
  "id": "edge-1",
  "source": "com.example.demo.security.AuthenticationService",
  "target": "com.example.demo.user.UserRepository",
  "type": "constructor_dependency",
  "family": "hard",
  "weight": 0.8,
  "evidence": "constructor parameter UserRepository userRepository",
  "scoreComponents": {
    "hard": 0.8,
    "semantic": 0.42
  }
}
```

Families:

- `hard`: static structural relation
- `soft`: semantic/vector relation
- `derived`: computed relation such as package cohesion or graph propagation

## Search request

`POST /api/search`

```json
{
  "query": "Security",
  "topK": 20,
  "includeGraphPropagation": true
}
```

## Search response

```json
{
  "query": "Security",
  "results": [
    {
      "nodeId": "com.example.demo.security.JwtTokenProvider",
      "label": "JwtTokenProvider",
      "score": 0.92,
      "rank": 1,
      "scoreComponents": {
        "vector": 0.84,
        "keyword": 1.0,
        "tag": 1.0,
        "graph": 0.72
      },
      "evidence": [
        "tag match: jwt, token, security",
        "method names include createToken and validateToken",
        "package contains security"
      ]
    }
  ]
}
```

## Smell candidate

```json
{
  "id": "smell-possible-duplicate-1",
  "type": "possible_duplicate_or_scattered_responsibility",
  "severity": "medium",
  "score": 0.78,
  "nodeIds": [
    "com.example.demo.user.UserRegistrationValidator",
    "com.example.demo.payment.PaymentFraudValidator"
  ],
  "title": "Two validators may share responsibility patterns",
  "reason": "High semantic similarity but no direct structural relation. This may indicate duplicated validation responsibility or an intentional domain split.",
  "evidence": [
    "semantic similarity: 0.81",
    "hard relation: none",
    "both contain validation-related methods and policy checks"
  ],
  "recommendation": "Review whether a shared validation abstraction or policy component would reduce duplication. Do not refactor automatically; confirm domain rules first."
}
```

## Node detail response

`GET /api/nodes/{nodeId}` returns the full node plus adjacent edges and smell candidates.

```json
{
  "node": {},
  "incomingEdges": [],
  "outgoingEdges": [],
  "semanticNeighbors": [],
  "smells": [],
  "sourcePreview": "public class AuthenticationService { ... }"
}
```
