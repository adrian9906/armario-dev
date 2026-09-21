import { describe, expect, it } from "vitest";
import {
  technologyByKey,
  technologyByName,
  technologyCatalog,
  technologyCategories,
} from "./documentation-model";

describe("catálogo de tecnologías", () => {
  it("mantiene claves y nombres únicos", () => {
    expect(new Set(technologyCatalog.map((item) => item.key)).size).toBe(technologyCatalog.length);
    expect(new Set(technologyCatalog.map((item) => item.name.toLocaleLowerCase())).size).toBe(technologyCatalog.length);
  });

  it("ofrece opciones en cada categoría", () => {
    for (const category of technologyCategories) {
      expect(technologyCatalog.some((item) => item.category === category.value)).toBe(true);
    }
  });

  it("usa únicamente SVG de la biblioteca oficial", () => {
    for (const technology of technologyCatalog) {
      expect(technology.icon).toMatch(/^https:\/\/svgl\.app\/library\/[\w.-]+\.svg$/);
    }
  });

  it("resuelve selecciones y registros existentes", () => {
    expect(technologyByKey("nextjs")?.name).toBe("Next.js");
    expect(technologyByName("next.js")?.key).toBe("nextjs");
  });
});
