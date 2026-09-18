export const projectKinds = [
  { value: "web", label: "Web" }, { value: "mobile", label: "Móvil" },
  { value: "frontend", label: "Frontend" }, { value: "backend", label: "Backend" },
  { value: "mixed", label: "Frontend y backend" }, { value: "other", label: "Otro" },
] as const;

export const projectStages = [
  { value: "definition", label: "Definición" }, { value: "planning", label: "Planificación" },
  { value: "development", label: "Desarrollo" }, { value: "published", label: "Publicado" },
  { value: "archived", label: "Archivado" },
] as const;

export const moduleOptions = [
  { value: "frontend", label: "Frontend", description: "Interfaz y experiencia" },
  { value: "backend", label: "Backend", description: "Lógica y API" },
  { value: "database", label: "Base de datos", description: "Persistencia" },
  { value: "auth", label: "Autenticación", description: "Cuentas y acceso" },
] as const;

export type ProjectModules = Record<(typeof moduleOptions)[number]["value"], boolean>;
export const taskStatuses = [
  { value: "todo", label: "Por hacer" }, { value: "in_progress", label: "En curso" },
  { value: "done", label: "Hecho" },
] as const;
export const taskPriorities = [
  { value: "low", label: "Baja" }, { value: "medium", label: "Media" }, { value: "high", label: "Alta" },
] as const;
export const requirementKinds = [
  { value: "functional", label: "Funcional" }, { value: "nonfunctional", label: "No funcional" },
] as const;
export const requirementPriorities = [
  { value: "must", label: "Imprescindible" }, { value: "should", label: "Importante" },
  { value: "could", label: "Deseable" },
] as const;

export function projectProgress(tasks: { status: string }[]) {
  const active = tasks.filter((task) => task.status !== "archived");
  const completed = active.filter((task) => task.status === "done").length;
  return { completed, total: active.length, percent: active.length ? Math.round(completed / active.length * 100) : 0 };
}

export function requirementCoverage(requirementId: string, links: { requirement_id: string; task_id: string }[], tasks: { id: string; status: string }[]) {
  const taskIds = new Set(links.filter((link) => link.requirement_id === requirementId).map((link) => link.task_id));
  const linked = tasks.filter((task) => taskIds.has(task.id) && task.status !== "archived");
  const completed = linked.filter((task) => task.status === "done").length;
  return { completed, total: linked.length, percent: linked.length ? Math.round(completed / linked.length * 100) : 0 };
}
