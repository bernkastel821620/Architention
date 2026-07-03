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

const SCENE_SIZE = 9;
const DEFAULT_SPREAD = 1.5;
const MIN_SPREAD = 1.1;
const MAX_SPREAD = 2;

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
      addAstGuides(root, graph, layout);
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
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose());
        } else {
          material?.dispose();
        }
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
          <span>{layoutMode === "ast" ? "AST layout: package columns, class-role layers" : "Orbit layout: package clusters"}</span>
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
  const baseXSpacing = Math.min(2.1, (SCENE_SIZE * 1.2) / Math.max(packages.length - 1, 1));
  const xSpacing = baseXSpacing * spread;
  const left = -((packages.length - 1) * xSpacing) / 2;
  const roleOrder: ClassRole[] = ["config", "controller", "service", "validator", "repository", "model", "other"];
  const yScale = 1 + (spread - 1) * 0.78;
  const roleY: Record<ClassRole, number> = {
    config: 2.2,
    controller: 1.35,
    service: 0.42,
    validator: -0.38,
    repository: -1.18,
    model: -1.72,
    other: -0.82
  };

  return graph.nodes.map((node): PositionedNode => {
    const packageIndex = packages.indexOf(node.packageName);
    const packageNodes = graph.nodes
      .filter((item) => item.packageName === node.packageName)
      .sort((a, b) => {
        const roleDiff = roleOrder.indexOf(inferClassRole(a)) - roleOrder.indexOf(inferClassRole(b));
        return roleDiff || a.label.localeCompare(b.label);
      });
    const localIndex = Math.max(0, packageNodes.findIndex((item) => item.id === node.id));
    const role = inferClassRole(node);
    const rolePeers = packageNodes.filter((item) => inferClassRole(item) === role);
    const peerIndex = Math.max(0, rolePeers.findIndex((item) => item.id === node.id));
    const packageSuffixDepth = trimCommonPackagePrefix(node.packageName, packages).split(".").filter(Boolean).length;
    const relevance = searchScores[node.id]?.score ?? 0;

    return {
      ...node,
      x: left + packageIndex * xSpacing,
      y: roleY[role] * yScale,
      z: (peerIndex - (rolePeers.length - 1) / 2) * 1.08 * spread + (packageSuffixDepth - 1) * 0.22 * spread + (localIndex % 2) * 0.12 * spread,
      radius: 0.16 + node.metrics.attentionPointScore * 0.22,
      relevance,
      risk: riskByNode.get(node.id) ?? null,
      role
    };
  });
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

function addAstGuides(root: THREE.Group, graph: GraphPayload, layout: PositionedNode[]) {
  const packages = Array.from(new Set(graph.nodes.map((node) => node.packageName))).sort();
  const byPackage = new Map(packages.map((packageName) => [packageName, layout.filter((node) => node.packageName === packageName)]));
  for (const packageName of packages) {
    const nodes = byPackage.get(packageName) ?? [];
    if (!nodes.length) {
      continue;
    }
    const x = nodes[0].x;
    const rail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, 2.42, -1.55),
        new THREE.Vector3(x, -1.95, -1.55)
      ]),
      new THREE.LineBasicMaterial({ color: "#cfd8df", transparent: true, opacity: 0.58 })
    );
    root.add(rail);

    const label = createLabelSprite(trimCommonPackagePrefix(packageName, packages) || packageName, false);
    label.position.set(x, 2.72, -1.55);
    label.scale.set(1.35, 0.34, 1);
    root.add(label);
  }

  const roleLabels: Array<[ClassRole, number]> = [
    ["config", 2.2],
    ["controller", 1.35],
    ["service", 0.42],
    ["validator", -0.38],
    ["repository", -1.18]
  ];
  for (const [role, y] of roleLabels) {
    const label = createLabelSprite(role, false);
    label.position.set(-5.05, y, -1.4);
    label.scale.set(1.05, 0.28, 1);
    root.add(label);
  }
}

function createLabelSprite(label: string, selected: boolean) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const width = 256;
  const height = 64;
  canvas.width = width;
  canvas.height = height;
  if (context) {
    context.clearRect(0, 0, width, height);
    context.font = selected ? "700 24px Segoe UI, sans-serif" : "600 22px Segoe UI, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 6;
    context.strokeStyle = "rgba(248, 250, 251, 0.94)";
    context.fillStyle = "#26313c";
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
