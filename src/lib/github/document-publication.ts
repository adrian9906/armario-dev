export type PublishableDocument = {
  sourceType: "requirement" | "decision" | "diagram";
  sourceId: string;
  title: string;
  path: string;
  content: string;
};

const labels = {
  requirement: { functional: "Funcional", nonfunctional: "No funcional", must: "Debe", should: "Debería", could: "Podría" },
  decision: { proposed: "Propuesta", accepted: "Aceptada", rejected: "Rechazada", superseded: "Reemplazada" },
  diagram: { flow: "Flujo", context: "Contexto", container: "Contenedores", data_model: "Modelo de datos" },
};

export function documentSlug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "documento";
}

const text = (value: string | null | undefined, fallback: string) => value?.trim() || fallback;

export function requirementDocument(row: {
  id: string; title: string; description: string; acceptance_criteria: string; kind: string; priority: string; status: string;
}): PublishableDocument {
  const path = `docs/requirements/${documentSlug(row.title)}-${row.id.slice(0, 8)}.md`;
  return {
    sourceType: "requirement",
    sourceId: row.id,
    title: row.title,
    path,
    content: `# ${row.title}\n\n- Tipo: ${labels.requirement[row.kind as keyof typeof labels.requirement] ?? row.kind}\n- Prioridad: ${labels.requirement[row.priority as keyof typeof labels.requirement] ?? row.priority}\n- Estado: ${row.status}\n\n## Descripción\n\n${text(row.description, "Sin descripción.")}\n\n## Criterios de aceptación\n\n${text(row.acceptance_criteria, "Sin criterios de aceptación definidos.")}\n`,
  };
}

export function decisionDocument(row: {
  id: string; title: string; status: string; context: string; decision: string; consequences: string; decided_at: string;
}): PublishableDocument {
  const path = `docs/adr/${row.decided_at}-${documentSlug(row.title)}-${row.id.slice(0, 8)}.md`;
  return {
    sourceType: "decision",
    sourceId: row.id,
    title: row.title,
    path,
    content: `# ADR: ${row.title}\n\n- Fecha: ${row.decided_at}\n- Estado: ${labels.decision[row.status as keyof typeof labels.decision] ?? row.status}\n\n## Contexto\n\n${text(row.context, "Sin contexto documentado.")}\n\n## Decisión\n\n${text(row.decision, "Sin decisión documentada.")}\n\n## Consecuencias\n\n${text(row.consequences, "Sin consecuencias documentadas.")}\n`,
  };
}

export function diagramDocument(row: {
  id: string; title: string; kind: string; source: string; status: string;
}): PublishableDocument {
  const path = `docs/diagrams/${documentSlug(row.title)}-${row.id.slice(0, 8)}.md`;
  return {
    sourceType: "diagram",
    sourceId: row.id,
    title: row.title,
    path,
    content: `# ${row.title}\n\n- Tipo: ${labels.diagram[row.kind as keyof typeof labels.diagram] ?? row.kind}\n- Estado: ${row.status}\n\n\`\`\`mermaid\n${row.source.trim()}\n\`\`\`\n`,
  };
}

