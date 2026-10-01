"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, FileDown, FileText } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type PreviewFormat = "markdown" | "pdf";

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

function inlineMarkdown(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function markdownToHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] = [];
  let inCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${paragraph.map(inlineMarkdown).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCode) {
        blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (!line.trim() || heading || !item) {
      flushParagraph();
      flushList();
    }
    if (!line.trim()) continue;
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (item) {
      list.push(item[1]);
    } else {
      paragraph.push(line);
    }
  }

  if (inCode) blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flushParagraph();
  flushList();
  return blocks.join("\n");
}

function createPdfPreview(title: string, markdown: string) {
  const safeTitle = escapeHtml(title);
  const content = markdownToHtml(markdown);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>
    :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#eef0f4;color:#202436;font:15px/1.65 "Segoe UI",Arial,sans-serif}.sheet{width:min(100% - 32px,820px);min-height:1056px;margin:24px auto;padding:64px 72px;background:#fff;box-shadow:0 18px 50px #20243618}h1,h2,h3,h4,h5,h6{color:#252943;line-height:1.25;break-after:avoid}h1{font-size:32px;margin:0 0 28px;border-bottom:2px solid #d9d9fa;padding-bottom:18px}h2{font-size:22px;margin:32px 0 12px}h3{font-size:17px;margin:24px 0 8px}p,ul{margin:8px 0 16px}li{margin:4px 0}strong{font-weight:700}code{font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;color:#34344c;background:#f2f3f8;border-radius:4px;padding:2px 4px}pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:14px 16px;border:1px solid #e4e6ee;border-radius:10px;background:#f7f8fb;break-inside:avoid}pre code{padding:0;background:transparent}.hint{position:fixed;right:14px;bottom:14px;padding:8px 12px;border-radius:99px;background:#272740;color:white;font:12px "Segoe UI",Arial,sans-serif}@media(max-width:640px){.sheet{width:100%;min-height:100vh;margin:0;padding:32px 24px;box-shadow:none}}@media print{body{background:#fff}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.hint{display:none}h2,h3{break-after:avoid}pre,li{break-inside:avoid}}
  </style></head><body><main class="sheet">${content}</main><div class="hint">Vista previa · Guardar como PDF desde Imprimir</div></body></html>`;
}

export function DocumentationExportDialog({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<PreviewFormat>("pdf");
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const pdfFrame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setPdfReady(false);
    fetch(`/projects/${projectId}/export?preview=1`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo cargar la documentación para la vista previa.");
        setMarkdown(await response.text());
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar la vista previa.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [open, projectId]);

  const pdfDocument = useMemo(() => markdown ? createPdfPreview(projectTitle, markdown) : "", [markdown, projectTitle]);

  const printPdf = () => {
    const frameWindow = pdfFrame.current?.contentWindow;
    if (!frameWindow || !pdfReady) return;
    frameWindow.focus();
    frameWindow.print();
  };

  return <>
    <Button variant="outline" onClick={() => setOpen(true)}>
      <Eye data-icon="inline-start" aria-hidden />
      Vista previa y exportar
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-6xl gap-5">
        <DialogHeader>
          <DialogTitle>Vista previa de la documentación</DialogTitle>
          <DialogDescription>Revisa el documento en Markdown o comprueba cómo quedará en PDF antes de exportarlo.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="flex items-center gap-2" role="tablist" aria-label="Formato de vista previa">
            <Button type="button" role="tab" aria-selected={format === "pdf"} variant={format === "pdf" ? "secondary" : "ghost"} size="sm" onClick={() => setFormat("pdf")}>
              <FileDown data-icon="inline-start" aria-hidden /> PDF
            </Button>
            <Button type="button" role="tab" aria-selected={format === "markdown"} variant={format === "markdown" ? "secondary" : "ghost"} size="sm" onClick={() => setFormat("markdown")}>
              <FileText data-icon="inline-start" aria-hidden /> Markdown
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={loading || Boolean(error)} onClick={printPdf}>
              <FileDown data-icon="inline-start" aria-hidden /> Exportar PDF
            </Button>
            <Button size="sm" render={<a href={`/projects/${projectId}/export`} download />} disabled={loading || Boolean(error)}>
              <Download data-icon="inline-start" aria-hidden /> Exportar .md
            </Button>
          </div>
        </div>

        {error ? <Alert variant="destructive"><AlertTitle>Error de vista previa</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : loading ? (
          <div className="flex min-h-96 items-center justify-center gap-3 rounded-2xl border bg-muted/30 text-sm text-muted-foreground">
            <Spinner /> Preparando vista previa…
          </div>
        ) : format === "markdown" ? (
          <pre role="tabpanel" className="max-h-[min(62svh,720px)] min-h-96 overflow-auto rounded-2xl border bg-muted/35 p-5 text-xs leading-6 text-foreground sm:text-sm"><code>{markdown}</code></pre>
        ) : (
          <iframe
            ref={pdfFrame}
            title={`Vista previa PDF: ${projectTitle}`}
            srcDoc={pdfDocument}
            onLoad={() => setPdfReady(true)}
            sandbox="allow-same-origin allow-modals"
            className="h-[min(62svh,720px)] min-h-96 w-full rounded-2xl border bg-muted/35"
            role="tabpanel"
          />
        )}
        {format === "pdf" && !error && !loading && <p className="-mt-2 text-xs text-muted-foreground">“Exportar PDF” abre el diálogo de impresión del navegador; selecciona «Guardar como PDF».</p>}
      </DialogContent>
    </Dialog>
  </>;
}
