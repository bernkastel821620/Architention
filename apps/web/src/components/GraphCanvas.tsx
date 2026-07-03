import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { GraphEdge, GraphPayload, SearchResult, SmellCandidate } from "../types";

type Props = {
  graph: GraphPayload | null;
  searchScores: Record<string, SearchResult>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
};

type PositionedNode = GraphPayload["nodes"][number] & {
  x: number;
  y: number;
  z: number;
  radius: number;
  relevance: number;
  risk: SmellCandidate["severity"] | null;
  role: ClassRole;
};

type ClassRole = "config" | "controller" | "service" | "validator" | "repository" | "model" | "other";
type LayoutMode = "ast" | "orbit";
type PackageMarkerVariant = "domain" | "branch";
type LabelStyle = {
  fillStyle?: string;
  strokeStyle?: string;
  backgroundStyle?: string;
  borderStyle?: string;
  fontSize?: number;
  fontWeight?: number;
  width?: number;
  height?: number;
};
type PackageBranchInfo = {
  packageName: string;
  domain: string;
  branch: string;
  branchLabel: string;
  pathParts: string[];
  x: number;
  z: number;
  domainX: number;
  domainZ: number;
  branchIndex: number;
  branchCount: number;
};
type RoleLayerGuide = {
  role: ClassRole;
  label: string;
  y: number;
  color: string;
};

const SCENE_SIZE = 9;
const DEFAULT_SPREAD = 1.65;
const MIN_SPREAD = 1.1;
const MAX_SPREAD = 2.4;
const AST_ROLE_ORDER: ClassRole[] = ["config", "controller", "service", "validator", "repository", "model", "other"];
const AST_ROLE_LAYER_ORDER: ClassRole[] = ["config", "controller", "service", "validator", "other", "repository", "model"];
const AST_ROLE_BASE_Y: Record<ClassRole, number> = {
  config: 2.2,
  controller: 1.35,
  service: 0.42,
  validator: -0.38,
  repository: -1.18,
  model: -1.72,
  other: -0.82
};
const AST_ROLE_COLORS: Record<ClassRole, string> = {
  config: "#f59e0b",
  controller: "#3b82f6",
  service: "#10b981",
  validator: "#ec4899",
  repository: "#8b5cf6",
  model: "#14b8a6",
  other: "#64748b"
};

export function GraphCanvas({ graph, searchScores, selectedNodeId, onSelectNode }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("ast");
  const [spread, setSpread] = useState(DEFAULT_SPREAD);
  const handleSpreadChange = (value: string) => {
    setSpread(Number(value));
  };

  const layout = useMemo(() => {
    if (!graph) {
      return [];
    }

    const packages = Array.from(new Set(graph.nodes.map((node) => node.packageName))).sort();
    const riskByNode = new Map<string, SmellCandidate["severity"]>();
    for (const smell of graph.smells) {
      for (const nodeId of smell.nodeIds) {
        if (smell.severity === "high" || riskByNode.get(nodeId) !== "high") {
          riskByNode.set(nodeId, smell.severity);
        }
      }
    }

    if (layoutMode === "orbit") {
      return buildOrbitLayout(graph, packages, riskByNode, searchScores, spread);
    }

    return buildAstLayout(graph, packages, riskByNode, searchScores, spread);
  }, [graph, layoutMode, searchScores, spread]);

  useEffect(() => {
    if (!graph || !mountRef.current) {
      return;
    }

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f8fafb");
    scene.fog = new THREE.Fog("#f8fafb", 24, 72);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120);
    const bounds = measureLayout(layout);
    const focus = measureFocus(layout, bounds, selectedNodeId);
    camera.position.set(focus.x, focus.y + 5, focus.z + 16);
    camera.lookAt(focus.x, focus.y, focus.z);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight("#ffffff", 1.7);
    const key = new THREE.DirectionalLight("#ffffff", 2.3);
    key.position.set(4, 7, 6);
    scene.add(ambient, key);

    const root = new THREE.Group();
    scene.add(root);

    const gridSize = Math.max(12, Math.ceil(Math.max(bounds.width, bounds.depth) + 4));
    const grid = new THREE.GridHelper(gridSize, Math.max(12, Math.round(gridSize)), "#d9e0e6", "#edf1f4");
    grid.position.y = bounds.minY - 0.5;
    root.add(grid);

    if (layoutMode === "ast") {
      addAstGuides(root, graph, layout, spread);
    }

    const nodeById = new Map(layout.map((node) => [node.id, node]));
    const nodeMeshes: THREE.Mesh[] = [];

    for (const edge of graph.edges) {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) {
        continue;
      }
      root.add(createEdgeObject(source, target, edge, isSelectedEdge(edge, selectedNodeId)));
    }

    for (const node of layout) {
      const material = new THREE.MeshStandardMaterial({
        color: nodeFill(node.relevance),
        roughness: 0.58,
        metalness: 0.12,
        emissive: node.relevance > 0.35 ? new THREE.Color("#0b4a2e") : new THREE.Color("#111820"),
        emissiveIntensity: node.relevance > 0.35 ? 0.22 : 0.03
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(node.radius, 32, 24), material);
      mesh.position.set(node.x, node.y, node.z);
      mesh.userData.nodeId = node.id;
      mesh.userData.label = `${node.label} (${node.role})`;
      nodeMeshes.push(mesh);
      root.add(mesh);

      if (node.risk) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(node.radius + 0.055, 0.015, 10, 48),
          new THREE.MeshBasicMaterial({ color: riskColor(node.risk) })
        );
        ring.position.copy(mesh.position);
        ring.rotation.x = Math.PI / 2;
        root.add(ring);
      }

      if (node.id === selectedNodeId) {
        const selected = new THREE.Mesh(
          new THREE.TorusGeometry(node.radius + 0.105, 0.022, 10, 56),
          new THREE.MeshBasicMaterial({ color: "#22577a" })
        );
        selected.position.copy(mesh.position);
        selected.rotation.x = Math.PI / 2;
        root.add(selected);
      }

      const label = createLabelSprite(node.label, node.id === selectedNodeId);
      label.position.set(node.x, node.y + node.radius + 0.24, node.z);
      root.add(label);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const drag = {
      active: false,
      moved: false,
      x: 0,
      y: 0,
      rotationY: 0,
      rotationX: layoutMode === "ast" ? -0.04 : -0.18
    };
    root.rotation.x = drag.rotationX;

    const resize = () => {
      const rect = mount.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(420, rect.height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      fitCameraToLayout(camera, bounds, focus, width / height, layoutMode);
      renderer.setSize(width, height, false);
    };

    const pickNode = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(nodeMeshes, false)[0];
      return hit?.object.userData as { nodeId?: string; label?: string } | undefined;
    };

    const onPointerDown = (event: PointerEvent) => {
      drag.active = true;
      drag.moved = false;
      drag.x = event.clientX;
      drag.y = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const hit = pickNode(event);
      setHoverLabel(hit?.label ?? null);
      if (!drag.active) {
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        drag.moved = true;
      }
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.rotationY += dx * 0.006;
      drag.rotationX = THREE.MathUtils.clamp(drag.rotationX + dy * 0.004, -0.72, 0.42);
      root.rotation.y = drag.rotationY;
      root.rotation.x = drag.rotationX;
    };

    const onPointerUp = (event: PointerEvent) => {
      renderer.domElement.releasePointerCapture(event.pointerId);
      drag.active = false;
      if (!drag.moved) {
        const hit = pickNode(event);
        if (hit?.nodeId) {
          onSelectNode(hit.nodeId);
        }
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.01, 7, 52);
      camera.position.y = THREE.MathUtils.clamp(camera.position.y + event.deltaY * 0.003, 3.2, 18);
      camera.lookAt(focus.x, focus.y, focus.z);
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      if (!drag.active) {
        root.rotation.y += layoutMode === "ast" ? 0.00055 : 0.0018;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.dispose();
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }
        disposeMaterial(mesh.material as THREE.Material | THREE.Material[] | undefined);
      });
      mount.removeChild(renderer.domElement);
    };
  }, [graph, layout, layoutMode, onSelectNode, selectedNodeId]);

  if (!graph) {
    return (
      <section className="panel graph-panel empty-graph">
        <div className="empty-state">Analyze the sample project to render the class graph.</div>
      </section>
    );
  }

  const selected = layout.find((node) => node.id === selectedNodeId);

  return (
    <section className="panel graph-panel graph-panel-3d" aria-label="3D class graph visualization">
      <div className="panel-heading graph-heading">
        <div>
          <h2>Class Graph</h2>
          <p>{graph.nodes.length} classes, {graph.edges.length} edges</p>
        </div>
        <div className="graph-heading-tools">
          <div className="graph-mode-switch" aria-label="Graph layout mode">
            <button
              type="button"
              className={layoutMode === "ast" ? "active" : ""}
              onClick={() => setLayoutMode("ast")}
            >
              AST
            </button>
            <button
              type="button"
              className={layoutMode === "orbit" ? "active" : ""}
              onClick={() => setLayoutMode("orbit")}
            >
              Orbit
            </button>
          </div>
          <label className="graph-spread-control">
            <span>Spread</span>
            <input
              type="range"
              min={MIN_SPREAD}
              max={MAX_SPREAD}
              step="0.05"
              value={spread}
              onInput={(event) => handleSpreadChange(event.currentTarget.value)}
              onChange={(event) => handleSpreadChange(event.currentTarget.value)}
              aria-label="Graph node spacing"
            />
            <output>{(Math.round(spread * 10) / 10).toFixed(1)}x</output>
          </label>
          <div className="legend">
            <span><i className="legend-dot high" />topic relevance</span>
            <span><i className="legend-line" />hard</span>
            <span><i className="legend-line soft" />semantic</span>
            <span><i className="legend-ring" />review candidate</span>
          </div>
        </div>
      </div>
      <div className="graph-viewport" ref={mountRef}>
        <div className="graph-overlay">
          <strong>{hoverLabel ?? selected?.label ?? "Drag to rotate"}</strong>
          <span>{layoutMode === "ast" ? "AST layout: package branches, class-role layers" : "Orbit layout: package clusters"}</span>
        </div>
      </div>
    </section>
  );
}

function buildOrbitLayout(
  graph: GraphPayload,
  packages: string[],
  riskByNode: Map<string, SmellCandidate["severity"]>,
  searchScores: Record<string, SearchResult>,
  spread: number
) {
    return graph.nodes.map((node): PositionedNode => {
      const packageIndex = packages.indexOf(node.packageName);
      const packageNodes = graph.nodes
        .filter((item) => item.packageName === node.packageName)
        .sort((left, right) => left.label.localeCompare(right.label));
      const localIndex = Math.max(0, packageNodes.findIndex((item) => item.id === node.id));
      const angle = (2 * Math.PI * packageIndex) / Math.max(packages.length, 1);
      const localAngle = (2 * Math.PI * localIndex) / Math.max(packageNodes.length, 1);
      const packageRadius = SCENE_SIZE * 0.42 * spread;
      const localRadius = (1.05 + (localIndex % 2) * 0.5) * spread;
      const relevance = searchScores[node.id]?.score ?? 0;

      return {
        ...node,
        x: Math.cos(angle) * packageRadius + Math.cos(localAngle) * localRadius,
        y: (localIndex - (packageNodes.length - 1) / 2) * 0.62 * spread,
        z: Math.sin(angle) * packageRadius + Math.sin(localAngle) * localRadius,
        radius: 0.16 + node.metrics.attentionPointScore * 0.22,
        relevance,
        risk: riskByNode.get(node.id) ?? null,
        role: inferClassRole(node)
      };
    });
}

function buildAstLayout(
  graph: GraphPayload,
  packages: string[],
  riskByNode: Map<string, SmellCandidate["severity"]>,
  searchScores: Record<string, SearchResult>,
  spread: number
) {
  const packageBranches = buildPackageBranchLayout(packages, spread);
  const roleY = getAstRoleYMap(spread);

  return graph.nodes.map((node): PositionedNode => {
    const branch = packageBranches.byPackage.get(node.packageName);
    const packageNodes = graph.nodes
      .filter((item) => item.packageName === node.packageName)
      .sort((a, b) => {
        const roleDiff = AST_ROLE_ORDER.indexOf(inferClassRole(a)) - AST_ROLE_ORDER.indexOf(inferClassRole(b));
        return roleDiff || a.label.localeCompare(b.label);
      });
    const role = inferClassRole(node);
    const rolePeers = packageNodes.filter((item) => inferClassRole(item) === role);
    const peerIndex = Math.max(0, rolePeers.findIndex((item) => item.id === node.id));
    const peerOffset = peerIndex - (rolePeers.length - 1) / 2;
    const relevance = searchScores[node.id]?.score ?? 0;

    return {
      ...node,
      x: (branch?.x ?? 0) + peerOffset * getAstPeerSpacing(spread),
      y: roleY[role],
      z: branch?.z ?? 0,
      radius: 0.16 + node.metrics.attentionPointScore * 0.22,
      relevance,
      risk: riskByNode.get(node.id) ?? null,
      role
    };
  });
}

function buildPackageBranchLayout(packages: string[], spread: number) {
  const packagePaths = packages.map((packageName) => {
    const trimmed = trimCommonPackagePrefix(packageName, packages);
    const fallback = packageName.split(".").filter(Boolean).slice(-1).join(".");
    const pathParts = (trimmed || fallback || packageName).split(".").filter(Boolean);
    return {
      packageName,
      pathParts: pathParts.length ? pathParts : [packageName]
    };
  });
  const domains = Array.from(new Set(packagePaths.map((item) => item.pathParts[0]))).sort();
  const domainSpacing = Math.min(3.35, (SCENE_SIZE * 1.45) / Math.max(domains.length - 1, 1)) * spread;
  const left = -((domains.length - 1) * domainSpacing) / 2;
  const branchesByDomain = new Map<string, string[]>();

  for (const item of packagePaths) {
    const domain = item.pathParts[0];
    const branch = item.pathParts.slice(1).join(".") || "(root)";
    const branches = branchesByDomain.get(domain) ?? [];
    if (!branches.includes(branch)) {
      branches.push(branch);
    }
    branchesByDomain.set(domain, branches);
  }

  for (const [domain, branches] of branchesByDomain) {
    branches.sort((leftBranch, rightBranch) => {
      if (leftBranch === "(root)") {
        return -1;
      }
      if (rightBranch === "(root)") {
        return 1;
      }
      return leftBranch.localeCompare(rightBranch);
    });
    branchesByDomain.set(domain, branches);
  }

  const byPackage = new Map<string, PackageBranchInfo>();
  const branchSpacing = 1.46 * spread;
  const branchForwardGap = 2.35 * spread;
  const maxBranchCount = Math.max(1, ...Array.from(branchesByDomain.values()).map((branches) => branches.length));
  const wallZ = -((maxBranchCount - 1) * branchSpacing + branchForwardGap) / 2;

  for (const item of packagePaths) {
    const domain = item.pathParts[0];
    const branch = item.pathParts.slice(1).join(".") || "(root)";
    const branches = branchesByDomain.get(domain) ?? [branch];
    const domainIndex = Math.max(0, domains.indexOf(domain));
    const branchIndex = Math.max(0, branches.indexOf(branch));
    const branchCount = branches.length;
    const domainX = left + domainIndex * domainSpacing;
    const depthOffset = Math.min(Math.max(item.pathParts.length - 1, 0), 3) * 0.3 * spread;
    const nestedForwardOffset = Math.min(Math.max(item.pathParts.length - 2, 0), 3) * 0.28 * spread;
    const branchZ = wallZ + branchForwardGap + branchIndex * branchSpacing + nestedForwardOffset;

    byPackage.set(item.packageName, {
      packageName: item.packageName,
      domain,
      branch,
      branchLabel: branch === "(root)" ? "root" : formatPackagePath(branch),
      pathParts: item.pathParts,
      x: domainX + depthOffset,
      z: branchZ,
      domainX,
      domainZ: wallZ,
      branchIndex,
      branchCount
    });
  }

  return {
    wallZ,
    domains: domains.map((domain, index) => ({
      name: domain,
      label: formatPackageSegment(domain),
      x: left + index * domainSpacing,
      z: wallZ,
      branches: Array.from(byPackage.values())
        .filter((branch) => branch.domain === domain)
        .sort((leftBranch, rightBranch) => leftBranch.branchIndex - rightBranch.branchIndex)
    })),
    byPackage
  };
}

function measureLayout(layout: PositionedNode[]) {
  const xs = layout.flatMap((node) => [node.x - node.radius, node.x + node.radius]);
  const ys = layout.flatMap((node) => [node.y - node.radius, node.y + node.radius]);
  const zs = layout.flatMap((node) => [node.z - node.radius, node.z + node.radius]);
  const minX = Math.min(...xs, -1);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, -1);
  const maxY = Math.max(...ys, 1);
  const minZ = Math.min(...zs, -1);
  const maxZ = Math.max(...zs, 1);

  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: maxX - minX,
    height: maxY - minY,
    depth: maxZ - minZ
  };
}

function measureFocus(
  layout: PositionedNode[],
  bounds: ReturnType<typeof measureLayout>,
  selectedNodeId: string | null
) {
  const selected = layout.find((node) => node.id === selectedNodeId);
  if (!selected) {
    return {
      x: bounds.centerX,
      y: bounds.centerY,
      z: bounds.centerZ
    };
  }

  return {
    x: THREE.MathUtils.lerp(bounds.centerX, selected.x, 0.72),
    y: THREE.MathUtils.lerp(bounds.centerY, selected.y, 0.24),
    z: THREE.MathUtils.lerp(bounds.centerZ, selected.z, 0.72)
  };
}

function fitCameraToLayout(
  camera: THREE.PerspectiveCamera,
  bounds: ReturnType<typeof measureLayout>,
  focus: ReturnType<typeof measureFocus>,
  aspect: number,
  layoutMode: LayoutMode
) {
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.1));
  const halfWidth = Math.max(bounds.width / 2, bounds.depth * 0.42) + 1.5;
  const halfHeight = bounds.height / 2 + 1.4;
  const distanceForWidth = halfWidth / Math.tan(horizontalFov / 2);
  const distanceForHeight = halfHeight / Math.tan(verticalFov / 2);
  const distance = Math.max(distanceForWidth, distanceForHeight, layoutMode === "ast" ? 13.5 : 12) * 1.35;
  const yLift = layoutMode === "ast" ? distance * 0.16 : distance * 0.38;

  camera.position.set(focus.x, focus.y + yLift, focus.z + distance);
  camera.lookAt(focus.x, focus.y, focus.z);
}

function createEdgeObject(source: PositionedNode, target: PositionedNode, edge: GraphEdge, highlighted: boolean) {
  if (highlighted) {
    return createHighlightedEdge(source, target, edge);
  }
  return createEdgeLine(source, target, edge);
}

function createEdgeLine(source: PositionedNode, target: PositionedNode, edge: GraphEdge) {
  const points = [
    new THREE.Vector3(source.x, source.y, source.z),
    new THREE.Vector3(target.x, target.y, target.z)
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: edge.family === "soft" ? "#6ea0bf" : "#7f8d9a",
    transparent: true,
    opacity: edge.family === "soft" ? 0.22 : Math.min(0.68, 0.28 + edge.weight * 0.38)
  });
  const line = new THREE.Line(geometry, material);
  line.userData.edgeId = edge.id;
  return line;
}

function createHighlightedEdge(source: PositionedNode, target: PositionedNode, edge: GraphEdge) {
  const start = new THREE.Vector3(source.x, source.y, source.z);
  const end = new THREE.Vector3(target.x, target.y, target.z);
  const midpoint = start.clone().lerp(end, 0.5);
  const curve = new THREE.CatmullRomCurve3([
    start,
    midpoint.add(new THREE.Vector3(0, 0.05, 0)),
    end
  ]);
  const group = new THREE.Group();

  const halo = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 10, 0.095, 12, false),
    new THREE.MeshBasicMaterial({
      color: "#f0abfc",
      transparent: true,
      opacity: 0.34,
      depthTest: false,
      depthWrite: false
    })
  );
  const core = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 10, edge.family === "soft" ? 0.042 : 0.055, 10, false),
    new THREE.MeshStandardMaterial({
      color: "#d946ef",
      emissive: "#c026d3",
      emissiveIntensity: 1.15,
      metalness: 0.04,
      roughness: 0.22,
      depthTest: false,
      depthWrite: false
    })
  );

  group.add(halo, core);
  group.userData.edgeId = edge.id;
  return group;
}

function isSelectedEdge(edge: GraphEdge, selectedNodeId: string | null) {
  return Boolean(selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId));
}

function addAstGuides(root: THREE.Group, graph: GraphPayload, layout: PositionedNode[], spread: number) {
  const packages = Array.from(new Set(graph.nodes.map((node) => node.packageName))).sort();
  const packageBranches = buildPackageBranchLayout(packages, spread);
  const branches = Array.from(packageBranches.byPackage.values());
  const roleLayers = getAstRoleLayers(spread);
  const wallMetrics = measurePackageWall(packageBranches.domains, spread, roleLayers);
  const topRoleY = Math.max(...roleLayers.map((layer) => layer.y));
  const bottomRoleY = Math.min(...roleLayers.map((layer) => layer.y));
  const packageY = topRoleY + 0.78;
  const branchTopY = topRoleY + 0.28;
  const branchBottomY = bottomRoleY - 0.36;
  root.add(createPackageBackWall(packageBranches.domains, packageBranches.wallZ, spread, roleLayers));

  for (const domain of packageBranches.domains) {
    const rail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(domain.x, packageY - 0.2, domain.z),
        new THREE.Vector3(domain.x, branchTopY, domain.z)
      ]),
      new THREE.LineBasicMaterial({ color: "#aebbc5", transparent: true, opacity: 0.68 })
    );
    root.add(rail);

    const domainFolder = createPackageFolderMarker(domain.label, "domain");
    domainFolder.position.set(domain.x, packageY, domain.z);
    root.add(domainFolder);
  }

  for (const branch of branches) {
    const x = branch.x;
    const z = branch.z;
    root.add(createPackageBranchAxis(x, z, branchTopY, branchBottomY));

    if (branch.branch !== "(root)" || branch.branchCount > 1) {
      const branchLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(branch.domainX, branchTopY + 0.16, branch.domainZ),
          new THREE.Vector3(x, branchTopY, z)
        ]),
        new THREE.LineBasicMaterial({ color: "#92a6b4", transparent: true, opacity: 0.68 })
      );
      root.add(branchLine);

      const branchFolder = createPackageFolderMarker(branch.branchLabel, "branch");
      branchFolder.position.set(x, branchTopY + 0.2, z);
      root.add(branchFolder);
    }
  }

  for (const node of layout) {
    const branch = packageBranches.byPackage.get(node.packageName);
    if (!branch) {
      continue;
    }
    root.add(createPackageMembershipConnector(node, branch, spread));
  }

  const roleLabelX = wallMetrics.minX + 0.72 * spread;
  for (const layer of roleLayers) {
    const label = createRoleLayerLabel(layer);
    label.position.set(roleLabelX, layer.y, packageBranches.wallZ + 0.1);
    root.add(label);
  }
}

function createPackageBackWall(
  domains: Array<{ x: number }>,
  wallZ: number,
  spread: number,
  roleLayers: RoleLayerGuide[]
) {
  const group = new THREE.Group();
  const wall = measurePackageWall(domains, spread, roleLayers);
  const z = wallZ - 0.08;

  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(wall.width, wall.height),
    new THREE.MeshBasicMaterial({
      color: "#e7eef4",
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  panel.position.set(wall.centerX, wall.centerY, z);
  group.add(panel);

  for (const band of buildRoleLayerBands(roleLayers, wall.topY, wall.bottomY)) {
    const bandPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(wall.width, band.height),
      new THREE.MeshBasicMaterial({
        color: band.color,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    bandPanel.position.set(wall.centerX, band.y, z + 0.02);
    group.add(bandPanel);

    const separator = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(wall.minX, band.bottom, z + 0.035),
        new THREE.Vector3(wall.maxX, band.bottom, z + 0.035)
      ]),
      new THREE.LineBasicMaterial({
        color: band.color,
        transparent: true,
        opacity: 0.24
      })
    );
    group.add(separator);
  }

  const framePoints = [
    new THREE.Vector3(wall.minX, wall.bottomY, z + 0.05),
    new THREE.Vector3(wall.maxX, wall.bottomY, z + 0.05),
    new THREE.Vector3(wall.maxX, wall.topY, z + 0.05),
    new THREE.Vector3(wall.minX, wall.topY, z + 0.05),
    new THREE.Vector3(wall.minX, wall.bottomY, z + 0.05)
  ];
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(framePoints),
    new THREE.LineBasicMaterial({ color: "#bccbd6", transparent: true, opacity: 0.74 })
  ));

  return group;
}

function createPackageMembershipConnector(node: PositionedNode, branch: PackageBranchInfo, spread: number) {
  const group = new THREE.Group();
  const anchor = new THREE.Vector3(branch.x, node.y, branch.z - 0.34 * spread);
  const target = new THREE.Vector3(node.x, node.y, node.z);
  const distance = anchor.distanceTo(target);
  const lift = Math.min(0.18 * spread, Math.max(0.05, distance * 0.22));
  const midpoint = anchor.clone().lerp(target, 0.5).add(new THREE.Vector3(0, lift, 0));
  const curve = new THREE.CatmullRomCurve3([anchor, midpoint, target]);

  const halo = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 8, 0.024, 8, false),
    new THREE.MeshBasicMaterial({
      color: "#cffafe",
      transparent: true,
      opacity: 0.08,
      depthWrite: false
    })
  );
  const core = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 8, 0.013, 8, false),
    new THREE.MeshStandardMaterial({
      color: "#a5f3fc",
      emissive: "#67e8f9",
      emissiveIntensity: 0.12,
      metalness: 0.02,
      roughness: 0.34,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    })
  );

  group.add(halo, core);
  return group;
}

function createPackageBranchAxis(x: number, z: number, topY: number, bottomY: number) {
  const group = new THREE.Group();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, topY, z),
    new THREE.Vector3(x, bottomY, z)
  ]);

  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 8, 0.034, 10, false),
    new THREE.MeshBasicMaterial({
      color: "#bae6fd",
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    })
  );
  const axis = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 8, 0.011, 8, false),
    new THREE.MeshBasicMaterial({
      color: "#7dd3fc",
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    })
  );

  group.add(glow, axis);
  return group;
}

function measurePackageWall(
  domains: Array<{ x: number }>,
  spread: number,
  roleLayers: RoleLayerGuide[]
) {
  const xs = domains.map((domain) => domain.x);
  const minDomainX = xs.length ? Math.min(...xs) : -1;
  const maxDomainX = xs.length ? Math.max(...xs) : 1;
  const roleYs = roleLayers.map((layer) => layer.y);
  const topRoleY = roleYs.length ? Math.max(...roleYs) : 2;
  const bottomRoleY = roleYs.length ? Math.min(...roleYs) : -2;
  const minX = minDomainX - 0.95 * spread;
  const maxX = maxDomainX + 1.1 * spread;
  const topY = topRoleY + 1.12;
  const bottomY = bottomRoleY - 0.62;
  const width = Math.max(2.8, maxX - minX);
  const height = Math.max(4.8, topY - bottomY);

  return {
    minX,
    maxX,
    topY,
    bottomY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (topY + bottomY) / 2
  };
}

function buildRoleLayerBands(roleLayers: RoleLayerGuide[], topY: number, bottomY: number) {
  return roleLayers.map((layer, index) => {
    const upper = index === 0 ? topY - 0.58 : (roleLayers[index - 1].y + layer.y) / 2;
    const lower = index === roleLayers.length - 1 ? bottomY + 0.42 : (layer.y + roleLayers[index + 1].y) / 2;
    const height = Math.max(0.28, upper - lower);

    return {
      color: layer.color,
      y: (upper + lower) / 2,
      height,
      bottom: lower
    };
  });
}

function createRoleLayerLabel(layer: RoleLayerGuide) {
  const label = createLabelSprite(layer.label, false, {
    fillStyle: "#101820",
    strokeStyle: "rgba(255, 255, 255, 0.96)",
    backgroundStyle: colorToRgba(layer.color, 0.26),
    borderStyle: colorToRgba(layer.color, 0.72),
    fontSize: 32,
    fontWeight: 850,
    width: 360,
    height: 84
  });
  label.scale.set(1.48, 0.42, 1);
  return label;
}

function createPackageFolderMarker(label: string, variant: PackageMarkerVariant) {
  const group = new THREE.Group();
  const isDomain = variant === "domain";
  const bodyWidth = isDomain ? 0.86 : 0.72;
  const bodyHeight = isDomain ? 0.42 : 0.34;
  const bodyDepth = isDomain ? 0.12 : 0.1;
  const tabWidth = isDomain ? 0.34 : 0.28;
  const tabHeight = isDomain ? 0.16 : 0.13;
  const bodyColor = isDomain ? "#ffd166" : "#8bd7e5";
  const tabColor = isDomain ? "#f4b942" : "#58bfd3";
  const outlineColor = isDomain ? "#9a6812" : "#1f6978";
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    emissive: bodyColor,
    emissiveIntensity: isDomain ? 0.12 : 0.08,
    roughness: 0.42,
    metalness: 0.04
  });
  const tabMaterial = new THREE.MeshStandardMaterial({
    color: tabColor,
    emissive: tabColor,
    emissiveIntensity: 0.1,
    roughness: 0.38,
    metalness: 0.04
  });
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: outlineColor,
    transparent: true,
    opacity: 0.86
  });

  const bodyGeometry = new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.set(0, -bodyHeight * 0.08, 0);
  group.add(body);
  group.add(createBoxOutline(bodyGeometry, outlineMaterial, body.position));

  const tabGeometry = new THREE.BoxGeometry(tabWidth, tabHeight, bodyDepth + 0.01);
  const tab = new THREE.Mesh(tabGeometry, tabMaterial);
  tab.position.set(-bodyWidth * 0.24, bodyHeight * 0.42, 0.005);
  group.add(tab);
  group.add(createBoxOutline(tabGeometry, outlineMaterial, tab.position));

  const labelSprite = createLabelSprite(label, false, {
    fillStyle: isDomain ? "#331f04" : "#073642",
    strokeStyle: isDomain ? "rgba(255, 250, 235, 0.96)" : "rgba(238, 251, 255, 0.96)",
    backgroundStyle: isDomain ? "rgba(255, 244, 204, 0.68)" : "rgba(226, 250, 255, 0.68)",
    borderStyle: isDomain ? "rgba(154, 104, 18, 0.55)" : "rgba(31, 105, 120, 0.55)",
    fontSize: isDomain ? 25 : 22,
    fontWeight: isDomain ? 800 : 750,
    width: 320,
    height: 72
  });
  labelSprite.position.set(0, -0.02, bodyDepth * 0.5 + 0.07);
  labelSprite.scale.set(isDomain ? 1.18 : 1, isDomain ? 0.3 : 0.26, 1);
  group.add(labelSprite);

  return group;
}

function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined) {
  if (!material) {
    return;
  }
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    const textured = item as THREE.Material & { map?: THREE.Texture | null };
    textured.map?.dispose();
    item.dispose();
  }
}

function createBoxOutline(geometry: THREE.BoxGeometry, material: THREE.LineBasicMaterial, position: THREE.Vector3) {
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), material);
  outline.position.copy(position);
  return outline;
}

function createLabelSprite(label: string, selected: boolean, style: LabelStyle = {}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const width = style.width ?? 256;
  const height = style.height ?? 64;
  canvas.width = width;
  canvas.height = height;
  if (context) {
    context.clearRect(0, 0, width, height);
    const baseFontSize = style.fontSize ?? (selected ? 24 : 22);
    const fontWeight = style.fontWeight ?? (selected ? 700 : 600);
    const maxTextWidth = width - 28;
    let fontSize = baseFontSize;
    context.font = `${fontWeight} ${fontSize}px Segoe UI, sans-serif`;
    while (fontSize > 13 && context.measureText(label).width > maxTextWidth) {
      fontSize -= 1;
      context.font = `${fontWeight} ${fontSize}px Segoe UI, sans-serif`;
    }
    if (style.backgroundStyle) {
      drawRoundRect(context, 8, 8, width - 16, height - 16, 18);
      context.fillStyle = style.backgroundStyle;
      context.fill();
      if (style.borderStyle) {
        context.lineWidth = 3;
        context.strokeStyle = style.borderStyle;
        context.stroke();
      }
    }
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 6;
    context.strokeStyle = style.strokeStyle ?? "rgba(248, 250, 251, 0.94)";
    context.fillStyle = style.fillStyle ?? "#26313c";
    context.strokeText(label, width / 2, height / 2);
    context.fillText(label, width / 2, height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.52, 0.38, 1);
  return sprite;
}

function drawRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function nodeFill(score: number): THREE.Color {
  if (score <= 0.01) {
    return new THREE.Color("#737982");
  }
  if (score < 0.2) {
    return new THREE.Color("#5f8f79");
  }
  if (score < 0.45) {
    return new THREE.Color("#2faf70");
  }
  return new THREE.Color("#1fd16f");
}

function riskColor(severity: SmellCandidate["severity"]) {
  if (severity === "high") {
    return "#d85b4a";
  }
  if (severity === "medium") {
    return "#e8893c";
  }
  return "#e3b54a";
}

function getAstRoleLayers(spread: number): RoleLayerGuide[] {
  const yScale = 1 + (spread - 1) * 0.78;
  return AST_ROLE_LAYER_ORDER.map((role) => ({
    role,
    label: formatRoleLabel(role),
    y: AST_ROLE_BASE_Y[role] * yScale,
    color: AST_ROLE_COLORS[role]
  }));
}

function getAstRoleYMap(spread: number): Record<ClassRole, number> {
  return getAstRoleLayers(spread).reduce((roles, layer) => {
    roles[layer.role] = layer.y;
    return roles;
  }, {} as Record<ClassRole, number>);
}

function getAstPeerSpacing(spread: number) {
  return 0.82 * spread;
}

function inferClassRole(node: GraphPayload["nodes"][number]): ClassRole {
  const haystack = [
    node.label,
    node.kind,
    node.packageName,
    ...node.annotations,
    ...node.tags
  ].join(" ").toLowerCase();

  if (haystack.includes("configuration") || haystack.includes("config")) {
    return "config";
  }
  if (haystack.includes("controller") || haystack.includes("restcontroller")) {
    return "controller";
  }
  if (haystack.includes("validator") || haystack.includes("validation")) {
    return "validator";
  }
  if (haystack.includes("repository") || haystack.includes("persistence")) {
    return "repository";
  }
  if (haystack.includes("entity") || haystack.includes("model") || node.kind === "enum") {
    return "model";
  }
  if (haystack.includes("service")) {
    return "service";
  }
  return "other";
}

function trimCommonPackagePrefix(packageName: string, packages: string[]) {
  const splitPackages = packages.map((item) => item.split("."));
  const parts = packageName.split(".");
  let prefixLength = 0;
  while (
    prefixLength < parts.length &&
    splitPackages.every((item) => item[prefixLength] === parts[prefixLength])
  ) {
    prefixLength += 1;
  }
  return parts.slice(prefixLength).join(".");
}

function formatPackageSegment(segment: string) {
  if (!segment) {
    return "Package";
  }
  return segment.slice(0, 1).toUpperCase() + segment.slice(1);
}

function formatPackagePath(path: string) {
  return path
    .split(".")
    .filter(Boolean)
    .map(formatPackageSegment)
    .join(" / ");
}

function formatRoleLabel(role: ClassRole) {
  return role.toUpperCase();
}

function colorToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
