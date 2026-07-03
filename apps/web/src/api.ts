import type { AnalyzeResponse, GraphPayload, NodeDetail, SearchResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function analyzeRepo(repoPath: string, force = true): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>("/api/analyze", {
    method: "POST",
    body: JSON.stringify({ repoPath, force })
  });
}

export function getGraph(): Promise<GraphPayload> {
  return request<GraphPayload>("/api/graph");
}

export function searchTopic(query: string, topK = 20): Promise<SearchResponse> {
  return request<SearchResponse>("/api/search", {
    method: "POST",
    body: JSON.stringify({ query, topK, includeGraphPropagation: true })
  });
}

export function getNodeDetail(nodeId: string): Promise<NodeDetail> {
  return request<NodeDetail>(`/api/nodes/${encodeURIComponent(nodeId)}`);
}

