"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

function removeOrphanedMermaidNodes() {
  document.querySelectorAll(
    'body > [id^="ddiagram-"], body > [id^="idiagram-"], body > svg[id^="diagram-"]',
  ).forEach((node) => node.remove());
}

function useMermaidSvg(source: string, delay = 350) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rawId = useId();

  useEffect(() => {
    removeOrphanedMermaidNodes();
    let active = true;
    const timer = window.setTimeout(async () => {
      const renderId = `diagram-${rawId.replace(/[^a-zA-Z0-9]/g, "")}-${Date.now()}`;
      const renderContainer = document.createElement("div");
      renderContainer.setAttribute("aria-hidden", "true");
      renderContainer.style.cssText = "position:fixed;inset:0;visibility:hidden;pointer-events:none;z-index:-1";
      document.body.appendChild(renderContainer);
      try {
        // La distribución ESM completa incluye su propio DOMPurify. Esto evita
        // el conflicto de interoperabilidad entre Mermaid 12 y Turbopack.
        const mermaid = (await import("mermaid/dist/mermaid.esm.mjs")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: "neutral",
        });
        const result = await mermaid.render(renderId, source, renderContainer);
        if (active) { setSvg(result.svg); setError(null); }
      } catch (renderError) {
        console.error("No se pudo renderizar el diagrama Mermaid.", renderError);
        if (active) { setSvg(""); setError("La sintaxis todavía no forma un diagrama válido."); }
      } finally {
        renderContainer.remove();
        removeOrphanedMermaidNodes();
      }
    }, delay);
    return () => { active = false; window.clearTimeout(timer); };
  }, [delay, rawId, source]);

  return { svg, error };
}

export function DiagramPreview({ source, className }: { source: string; className?: string }) {
  const { svg, error } = useMermaidSvg(source, 80);

  return <div className={cn("flex h-40 items-center justify-center overflow-hidden rounded-xl border bg-muted/25 p-3", className)}>
    {error
      ? <p className="text-center text-xs text-muted-foreground">Vista previa no disponible</p>
      : svg
        ? <div className="flex size-full items-center justify-center [&_svg]:max-h-full [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        : <p className="text-xs text-muted-foreground">Generando vista previa…</p>}
  </div>;
}

export function DiagramEditor({
  value,
  onChange,
  readOnly = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  const { svg, error } = useMermaidSvg(value);

  return <div className="grid gap-5 xl:grid-cols-2">
    <Field><FieldLabel htmlFor="diagram-source">{readOnly ? "Contenido" : "Contenido editable"}</FieldLabel><FieldDescription>{readOnly ? "Fuente Mermaid guardada en el proyecto." : "Usa sintaxis Mermaid. La vista previa se actualiza mientras escribes."}</FieldDescription><Textarea id="diagram-source" name="source" required maxLength={50000} rows={18} value={value} onChange={(event) => onChange?.(event.target.value)} readOnly={readOnly} className="font-mono text-sm" /></Field>
    <Field><FieldLabel>Vista previa</FieldLabel><div className="flex min-h-96 items-center justify-center overflow-auto rounded-xl border bg-card p-5">
      {error ? <Alert variant="destructive"><AlertTitle>Diagrama incompleto</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : svg ? <div className="w-full [&_svg]:mx-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : <p className="text-sm text-muted-foreground">Generando vista previa…</p>}
    </div></Field>
  </div>;
}
