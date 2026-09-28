import { describe, expect, it } from "vitest";
import { decisionDocument, diagramDocument, documentSlug, requirementDocument } from "./document-publication";

describe("GitHub document publication", () => {
  it("crea rutas estables y seguras", () => {
    expect(documentSlug("Autenticación / sesión: móvil")).toBe("autenticacion-sesion-movil");
    expect(documentSlug("../../")).toBe("documento");
  });

  it("serializa requisitos, ADR y diagramas sin perder su contenido", () => {
    const requirement = requirementDocument({ id: "12345678-0000-0000-0000-000000000000", title: "Inicio de sesión", description: "Permitir acceso", acceptance_criteria: "Dado un usuario", kind: "functional", priority: "must", status: "active" });
    const decision = decisionDocument({ id: "abcdef12-0000-0000-0000-000000000000", title: "Elegir PostgreSQL", status: "accepted", context: "Datos relacionales", decision: "Usar PostgreSQL", consequences: "Migraciones", decided_at: "2026-09-28" });
    const diagram = diagramDocument({ id: "87654321-0000-0000-0000-000000000000", title: "Flujo principal", kind: "flow", source: "flowchart LR\nA-->B", status: "active" });
    expect(requirement.path).toBe("docs/requirements/inicio-de-sesion-12345678.md");
    expect(requirement.content).toContain("Dado un usuario");
    expect(decision.path).toContain("docs/adr/2026-09-28-elegir-postgresql-abcdef12.md");
    expect(decision.content).toContain("Usar PostgreSQL");
    expect(diagram.content).toContain("```mermaid\nflowchart LR");
  });
});

