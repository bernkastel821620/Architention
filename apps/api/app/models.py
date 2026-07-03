from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    repoPath: str = "examples/java-spring-mini"
    force: bool = False
    maxFiles: int = 1000


class SearchRequest(BaseModel):
    query: str
    topK: int = 20
    includeGraphPropagation: bool = True


class ExplainRequest(BaseModel):
    nodeId: str | None = None
    smellId: str | None = None


class MethodInfo(BaseModel):
    name: str
    signature: str
    returnType: str = ""
    parameters: list[str] = Field(default_factory=list)


class StructuralReference(BaseModel):
    targetName: str
    relationType: str
    evidence: str
    weight: float


class NodeMetrics(BaseModel):
    weightedDegree: float = 0.0
    betweenness: float = 0.0
    crossPackageEdges: int = 0
    smellParticipationCount: int = 0
    attentionPointScore: float = 0.0


class NodeModel(BaseModel):
    id: str
    label: str
    qualifiedName: str
    packageName: str
    kind: str
    filePath: str
    annotations: list[str] = Field(default_factory=list)
    imports: list[str] = Field(default_factory=list)
    methods: list[MethodInfo] = Field(default_factory=list)
    fields: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    extends: list[str] = Field(default_factory=list)
    implements: list[str] = Field(default_factory=list)
    references: list[StructuralReference] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    document: str = ""
    summary: str = ""
    metrics: NodeMetrics = Field(default_factory=NodeMetrics)
    sourcePreview: str = ""


class EdgeModel(BaseModel):
    id: str
    source: str
    target: str
    type: str
    family: str
    weight: float
    evidence: str
    scoreComponents: dict[str, float] = Field(default_factory=dict)


class SmellCandidate(BaseModel):
    id: str
    type: str
    severity: str
    score: float
    nodeIds: list[str] = Field(default_factory=list)
    title: str
    reason: str
    evidence: list[str] = Field(default_factory=list)
    recommendation: str


class PackageSummary(BaseModel):
    name: str
    classCount: int
    internalEdgeCount: int = 0
    externalEdgeCount: int = 0
    internalSemanticDensity: float = 0.0
    externalSemanticDensity: float = 0.0


class GraphMeta(BaseModel):
    analysisId: str
    repoPath: str
    provider: str
    createdAt: str
    javaFileCount: int = 0
    classCount: int = 0
    edgeCount: int = 0
    smellCount: int = 0
    cached: bool = False
    limitations: list[str] = Field(default_factory=list)


class GraphPayload(BaseModel):
    meta: GraphMeta
    nodes: list[NodeModel] = Field(default_factory=list)
    edges: list[EdgeModel] = Field(default_factory=list)
    packages: list[PackageSummary] = Field(default_factory=list)
    smells: list[SmellCandidate] = Field(default_factory=list)


class AnalyzeResponse(BaseModel):
    ok: bool
    analysisId: str
    meta: dict[str, Any]


class SearchResult(BaseModel):
    nodeId: str
    label: str
    score: float
    rank: int
    scoreComponents: dict[str, float]
    evidence: list[str] = Field(default_factory=list)


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]


class NodeDetailResponse(BaseModel):
    node: NodeModel
    incomingEdges: list[EdgeModel]
    outgoingEdges: list[EdgeModel]
    semanticNeighbors: list[EdgeModel]
    smells: list[SmellCandidate]
    sourcePreview: str

