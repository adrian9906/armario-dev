"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  addEdge,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { Plus, RotateCcw, Workflow } from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ArchitectureNodeData = { label: string };
type ArchitectureNodeType = Node<ArchitectureNodeData, "architecture">;
type ArchitectureEdgeType = Omit<Edge, "label"> & { label?: string };
export type DiagramFlow = { direction: string; nodes: ArchitectureNodeType[]; edges: ArchitectureEdgeType[] };

function validNode(value: unknown): value is ArchitectureNodeType {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<ArchitectureNodeType>;
  return typeof node.id === "string" && typeof node.position?.x === "number" && typeof node.position?.y === "number"
    && typeof node.data?.label === "string";
}

function storedFlow(source: string): DiagramFlow | null {
  const match = source.match(/^%%\s*ARMARIO_FLOW_V1\s+(.+)$/m);
  if (!match) return null;
  try {
    const saved = JSON.parse(match[1]) as Partial<DiagramFlow>;
    if (!Array.isArray(saved.nodes) || !Array.isArray(saved.edges) || !saved.nodes.every(validNode)) return null;
    const edges = saved.edges.filter((edge): edge is ArchitectureEdgeType => Boolean(edge)
      && typeof edge.id === "string" && typeof edge.source === "string" && typeof edge.target === "string")
      .map((edge) => ({ ...edge, label: typeof edge.label === "string" ? edge.label : undefined }));
    return { direction: typeof saved.direction === "string" ? saved.direction : "LR", nodes: saved.nodes, edges };
  } catch {
    return null;
  }
}

function parseMermaidFlow(source: string): DiagramFlow | null {
  if (!/^\s*(?:flowchart|graph)\s+/m.test(source) || /^\s*erDiagram\b/m.test(source)) return null;
  const declarations = new Map<string, string>();
  const edges: ArchitectureEdgeType[] = [];
  const direction = source.match(/^\s*(?:flowchart|graph)\s+(LR|RL|TB|TD|BT)\b/m)?.[1] ?? "LR";
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("%%") || /^(?:flowchart|graph)\s+/i.test(line)) continue;
    const edge = line.match(/^(.+?)\s*(-->|-.->|==>|---)\s*(?:\|([^|]*)\|\s*)?(.+)$/);
    if (edge) {
      const sourceId = edge[1].trim().match(/^([\w-]+)/)?.[1];
      const targetId = edge[4].trim().match(/^([\w-]+)/)?.[1];
      if (sourceId && targetId) edges.push({ id: `e-${edges.length + 1}`, source: sourceId, target: targetId, type: "smoothstep", label: edge[3]?.trim() || undefined });
    }
    const declarationPattern = /([\w-]+)(?:\[\[(.*?)\]\]|\[\((.*?)\)\]|\[(.*?)\]|\(\((.*?)\)\)|\((.*?)\)|\{(.*?)\})/g;
    for (const declaration of line.matchAll(declarationPattern)) {
      declarations.set(declaration[1], declaration.slice(2).find((value) => value !== undefined) || declaration[1]);
    }
    const standalone = line.match(/^([\w-]+)$/);
    if (standalone && !declarations.has(standalone[1])) declarations.set(standalone[1], standalone[1]);
  }
  for (const edge of edges) {
    if (!declarations.has(edge.source)) declarations.set(edge.source, edge.source);
    if (!declarations.has(edge.target)) declarations.set(edge.target, edge.target);
  }
  if (!declarations.size) return null;
  const nodes = Array.from(declarations, ([id, label], index): ArchitectureNodeType => ({
    id,
    type: "architecture",
    position: direction === "LR" || direction === "RL"
      ? { x: 50 + index * 250, y: 100 + (index % 2) * 100 }
      : { x: 70 + (index % 2) * 280, y: 40 + Math.floor(index / 2) * 170 },
    data: { label },
  }));
  return { direction, nodes, edges };
}

export function parseDiagramFlow(source: string) {
  return storedFlow(source) ?? parseMermaidFlow(source);
}

export function serializeDiagramFlow(flow: DiagramFlow) {
  const direction = ["LR", "RL", "TB", "TD", "BT"].includes(flow.direction) ? flow.direction : "LR";
  const nodeLines = flow.nodes.map((node) => `${node.id}["${node.data.label.replaceAll("\"", "&quot;").replaceAll("\n", " ")}"]`);
  const edgeLines = flow.edges.map((edge) => `${edge.source} -->${edge.label ? `|${edge.label.replaceAll("|", " ")}|` : ""} ${edge.target}`);
  const metadata = JSON.stringify({ version: 1, direction, nodes: flow.nodes, edges: flow.edges });
  return [`flowchart ${direction}`, ...nodeLines, ...edgeLines, `%% ARMARIO_FLOW_V1 ${metadata}`].join("\n");
}

function ArchitectureNode({ data, selected }: NodeProps<ArchitectureNodeType>) {
  return <div className={cn("relative w-60 rounded-2xl border bg-card p-4 shadow-md shadow-slate-900/5 transition-shadow", selected ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary/50")}>
    <Handle type="target" position={Position.Left} className="!size-2.5 !border-2 !border-card !bg-primary" />
    <div className="mb-3 flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-xl bg-pastel-lavender text-primary"><Workflow aria-hidden /></span><span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Componente</span><span className="ml-auto size-2 rounded-full bg-emerald-500" aria-label="Activo" /></div>
    <p className="text-sm font-semibold leading-snug text-foreground">{data.label || "Componente sin título"}</p>
    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Parte de la arquitectura documentada del proyecto.</p>
    <Handle type="source" position={Position.Right} className="!size-2.5 !border-2 !border-card !bg-primary" />
  </div>;
}

const nodeTypes: NodeTypes = { architecture: ArchitectureNode };

function FlowCanvas({ graph, onChange, readOnly = false, compact = false }: {
  graph: DiagramFlow;
  onChange?: (flow: DiagramFlow) => void;
  readOnly?: boolean;
  compact?: boolean;
}) {
  const [nodes, setNodes] = useState(graph.nodes);
  const [edges, setEdges] = useState(graph.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const persist = useCallback((nextNodes: ArchitectureNodeType[], nextEdges: ArchitectureEdgeType[]) => {
    onChange?.({ direction: graph.direction, nodes: nextNodes, edges: nextEdges });
  }, [graph.direction, onChange]);

  const handleNodesChange = useCallback((changes: NodeChange<ArchitectureNodeType>[]) => {
    setNodes((current) => applyNodeChanges(changes, current) as ArchitectureNodeType[]);
  }, []);

  const connect = useCallback((connection: Connection) => {
    const next = addEdge({ ...connection, type: "smoothstep", style: { stroke: "var(--primary)", strokeWidth: 2 } }, edges) as ArchitectureEdgeType[];
    setEdges(next);
    persist(nodes, next);
  }, [edges, nodes, persist]);

  const addNode = () => {
    const id = `node-${crypto.randomUUID().slice(0, 8)}`;
    const node: ArchitectureNodeType = { id, type: "architecture", position: { x: 170 + (nodes.length % 3) * 70, y: 130 + nodes.length * 30 }, data: { label: "Nuevo componente" } };
    const next = [...nodes, node];
    setNodes(next);
    setSelectedId(id);
    persist(next, edges);
  };

  const updateSelected = (label: string) => {
    const next = nodes.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, label } } : node);
    setNodes(next);
    persist(next, edges);
  };

  const selected = nodes.find((node) => node.id === selectedId);
  const handleDeleteNodes = useCallback((deleted: ArchitectureNodeType[]) => {
    const removed = new Set(deleted.map((node) => node.id));
    const nextNodes = nodes.filter((node) => !removed.has(node.id));
    const nextEdges = edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target));
    setNodes(nextNodes);
    setEdges(nextEdges);
    persist(nextNodes, nextEdges);
  }, [edges, nodes, persist]);

  return <div className={cn("architecture-flow relative overflow-hidden rounded-2xl border border-border/70 bg-[#f7f8ff]", compact ? "h-52" : "h-[min(64vh,600px)] min-h-[440px]")}>
    {!readOnly && <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/95 p-2 shadow-sm backdrop-blur"><Button type="button" size="sm" onClick={addNode}><Plus data-icon="inline-start" />Añadir nodo</Button>{selected && <label className="flex items-center gap-2 text-xs text-muted-foreground"><span className="sr-only">Nombre del nodo seleccionado</span><Input value={selected.data.label} onChange={(event) => updateSelected(event.target.value)} className="h-9 w-48 bg-background" aria-label="Nombre del nodo seleccionado" /></label>}</div>}
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onConnect={connect}
      onNodeClick={(_, node) => setSelectedId(node.id)}
      onNodeDragStop={(_, __, currentNodes) => persist(currentNodes as ArchitectureNodeType[], edges)}
      onNodesDelete={handleDeleteNodes}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable={!readOnly}
      deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
      fitView
      fitViewOptions={{ padding: 0.18, maxZoom: 1.15 }}
      minZoom={0.25}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      className="text-foreground"
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.3} color="var(--border)" />
      {!compact && <MiniMap pannable zoomable className="!rounded-xl !border !border-border !bg-card/90" nodeColor="var(--primary)" maskColor="rgb(248 247 255 / 65%)" />}
      {!compact && <Controls position="bottom-right" showInteractive={false} className="!overflow-hidden !rounded-xl !border !border-border !bg-card !shadow-md" />}
    </ReactFlow>
    {readOnly && <span className="pointer-events-none absolute right-3 top-3 rounded-full border bg-card/90 px-2.5 py-1 text-[10px] text-muted-foreground">Vista interactiva</span>}
  </div>;
}

function removeOrphanedMermaidNodes() {
  document.querySelectorAll('body > [id^="ddiagram-"], body > [id^="idiagram-"], body > svg[id^="diagram-"]').forEach((node) => node.remove());
}

function useMermaidSvg(source: string, delay = 350) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rawId = useId();

  useEffect(() => {
    let active = true;
    if (source) removeOrphanedMermaidNodes();
    const timer = source ? window.setTimeout(async () => {
      const renderId = `diagram-${rawId.replace(/[^a-zA-Z0-9]/g, "")}-${Date.now()}`;
      const renderContainer = document.createElement("div");
      renderContainer.setAttribute("aria-hidden", "true");
      renderContainer.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1";
      document.body.appendChild(renderContainer);
      try {
        const mermaid = (await import("mermaid/dist/mermaid.esm.mjs")).default;
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, theme: "neutral" });
        const result = await mermaid.render(renderId, source, renderContainer);
        if (active) { setSvg(result.svg); setError(null); }
      } catch (renderError) {
        console.error("No se pudo renderizar el diagrama Mermaid.", renderError);
        if (active) { setSvg(""); setError("La sintaxis todavía no forma un diagrama válido."); }
      } finally {
        renderContainer.remove();
        removeOrphanedMermaidNodes();
      }
    }, delay) : undefined;
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [delay, rawId, source]);

  return { svg, error };
}

export function DiagramPreview({ source, className }: { source: string; className?: string }) {
  const graph = useMemo(() => parseDiagramFlow(source), [source]);
  const { svg, error } = useMermaidSvg(graph ? "" : source, 80);

  return <div className={cn("flex h-40 items-center justify-center overflow-hidden rounded-xl border bg-muted/25 p-3", className)}>
    {graph ? <FlowCanvas key={source} graph={graph} readOnly compact /> : error
      ? <p className="text-center text-xs text-muted-foreground">Vista previa no disponible</p>
      : svg
        ? <div className="flex size-full items-center justify-center [&_svg]:max-h-full [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        : <p className="text-xs text-muted-foreground">Generando vista previa…</p>}
  </div>;
}

export function DiagramEditor({ value, onChange, readOnly = false, resetKey = "default" }: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  resetKey?: string | number;
}) {
  const graph = useMemo(() => parseDiagramFlow(value), [value]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceRevision, setSourceRevision] = useState(0);
  const { svg, error } = useMermaidSvg(graph ? "" : value);

  const updateGraph = useCallback((next: DiagramFlow) => onChange?.(serializeDiagramFlow(next)), [onChange]);
  const resetLayout = () => {
    if (!graph) return;
    const reset = parseMermaidFlow(value);
    if (reset) { updateGraph(reset); setSourceRevision((revision) => revision + 1); }
  };

  return <div className="grid gap-5">
    <Field><FieldLabel>{readOnly ? "Vista del diagrama" : "Constructor de arquitectura"}</FieldLabel><FieldDescription>{readOnly ? "Explora los nodos y las conexiones con zoom y desplazamiento." : "Arrastra nodos, conéctalos desde sus puntos y ajusta su posición para modelar el sistema."}</FieldDescription>
      {graph ? <div className="space-y-3"><FlowCanvas key={`${resetKey}:${sourceRevision}`} graph={graph} onChange={updateGraph} readOnly={readOnly} /><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{graph.nodes.length} nodos · {graph.edges.length} conexiones · Mermaid compatible</p>{!readOnly && <Button type="button" size="sm" variant="outline" onClick={resetLayout}><RotateCcw data-icon="inline-start" />Restablecer diseño</Button>}</div></div>
        : error ? <Alert variant="destructive"><AlertTitle>Diagrama incompleto</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
          : svg ? <div className="flex min-h-96 items-center justify-center overflow-auto rounded-2xl border bg-card p-5"><div className="w-full [&_svg]:mx-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /></div>
            : <p className="text-sm text-muted-foreground">Generando vista previa…</p>}
    </Field>
    {!readOnly && <Field><Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => setSourceOpen((open) => !open)}><Workflow data-icon="inline-start" />{sourceOpen ? "Ocultar fuente Mermaid" : "Editar fuente Mermaid"}</Button>{sourceOpen && <><FieldDescription>La fuente exportada conserva compatibilidad con Mermaid y GitHub.</FieldDescription><Textarea id="diagram-source" maxLength={50000} rows={8} value={value} onChange={(event) => { onChange?.(event.target.value); setSourceRevision((revision) => revision + 1); }} className="font-mono text-xs" /></>}</Field>}
    {!readOnly && <input type="hidden" name="source" value={value} />}
  </div>;
}
