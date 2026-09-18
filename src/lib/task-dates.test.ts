import { describe, expect, it } from "vitest";
import { validTaskDates } from "./task-dates";

describe("rango de fechas de una tarea", () => {
  it("acepta rangos válidos, un solo día y tareas sin fechas", () => {
    expect(validTaskDates(null, null)).toBe(true);
    expect(validTaskDates("2026-09-18", "2026-09-18")).toBe(true);
    expect(validTaskDates("2026-09-18", "2026-09-25")).toBe(true);
    expect(validTaskDates(null, "2026-09-25")).toBe(true);
  });

  it("rechaza fin anterior al inicio, rango incompleto y fechas imposibles", () => {
    expect(validTaskDates("2026-09-25", "2026-09-18")).toBe(false);
    expect(validTaskDates("2026-09-18", null)).toBe(false);
    expect(validTaskDates("2026-02-30", "2026-03-02")).toBe(false);
  });
});
