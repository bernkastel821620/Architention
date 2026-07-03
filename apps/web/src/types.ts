export type MethodInfo = {
  name: string;
  signature: string;
  returnType: string;
  parameters: string[];
};

export type NodeMetrics = {
  weightedDegree: number;
  betweenness: number;
  crossPackageEdges: number;
  smellParticipationCount: number;
  attentionPointScore: number;
};

export type GraphNode = {
  id: string;
  label: string;
  qualifiedName: string;
  packageName: string;
  kind: string;
  filePath: string;
  annotations: string[];
  imports: string[];
  methods: MethodInfo[];
  fields: string[];
  dependencies: string[];
  extends: string[];
  implements: string[];
  tags: string[];
  document: string;
  summary: string;
  metrics: NodeMetrics;
  sourcePreview: string;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  family: "hard" | "soft" | "derived";
  weight: number;
  evidence: string;
  scoreComponents: Record<string, number>;
};

export type SmellCandidate = {
  id: string;
  type: string;
  severity: "low" | "medium" | "high";
  score: number;
  nodeIds: string[];
  title: string;
  reason: string;
  evidence: string[];
  recommendation: string;
};

export type PackageSummary = {
  name: string;
  classCount: number;
  internalEdgeCount: number;
  externalEdgeCount: number;
  internalSemanticDensity: number;
  externalSemanticDensity: number;
};

export type GraphPayload = {
  meta: {
    analysisId: string;
    repoPath: string;
    provider: string;
    createdAt: string;
    javaFileCount: number;
    classCount: number;
    edgeCount: number;
    smellCount: number;
    cached: boolean;
    limitations: string[];
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
  packages: PackageSummary[];
  smells: SmellCandidate[];
};

export type AnalyzeResponse = {
  ok: boolean;
  analysisId: string;
  meta: Record<string, string | number | boolean>;
};

export type SearchResult = {
  nodeId: string;
  label: string;
  score: number;
  rank: number;
  scoreComponents: {
    vector: number;
    keyword: number;
    tag: number;
    graph: number;
  };
  evidence: string[];
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
};

export type NodeDetail = {
  node: GraphNode;
  incomingEdges: GraphEdge[];
  outgoingEdges: GraphEdge[];
  semanticNeighbors: GraphEdge[];
  smells: SmellCandidate[];
  sourcePreview: string;
};

