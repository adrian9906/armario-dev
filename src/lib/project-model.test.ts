import { describe, expect, it } from "vitest";
import { projectProgress, requirementCoverage } from "./project-model";

describe("avance del proyecto", () => {
  it("ignora tareas archivadas y calcula el porcentaje de las activas", () => {
    expect(projectProgress([
      { status: "done" }, { status: "in_progress" }, { status: "todo" }, { status: "archived" },
    ])).toEqual({ completed: 1, total: 3, percent: 33 });
    expect(projectProgress([{ status: "archived" }])).toEqual({ completed: 0, total: 0, percent: 0 });
  });

  it("calcula cobertura solo con tareas vinculadas y activas", () => {
    const links = [
      { requirement_id: "r1", task_id: "a" }, { requirement_id: "r1", task_id: "b" },
      { requirement_id: "r1", task_id: "c" }, { requirement_id: "r2", task_id: "d" },
    ];
    const tasks = [
      { id: "a", status: "done" }, { id: "b", status: "todo" },
      { id: "c", status: "archived" }, { id: "d", status: "done" },
    ];
    expect(requirementCoverage("r1", links, tasks)).toEqual({ completed: 1, total: 2, percent: 50 });
    expect(requirementCoverage("r3", links, tasks)).toEqual({ completed: 0, total: 0, percent: 0 });
  });
});
