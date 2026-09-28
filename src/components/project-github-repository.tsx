"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, GitBranch, GitFork, Link2, LockKeyhole, Plus, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import {
  createAndLinkGitHubRepository,
  linkGitHubRepository,
  unlinkGitHubRepository,
  type GitHubRepositoryFormState,
} from "@/app/projects/github-actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type LinkedRepository = {
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  visibility: string;
  archived: boolean;
  last_synced_at: string;
};

type AvailableRepository = {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  visibility: string;
  archived: boolean;
  updatedAt: string;
};

const initialState: GitHubRepositoryFormState = { error: null, success: null };

function useActionFeedback(
  state: GitHubRepositoryFormState,
  onSuccess: () => void,
) {
  const handledState = useRef(state);
  useEffect(() => {
    if (handledState.current === state) return;
    handledState.current = state;
    if (state.error) toast.error(state.error);
    if (!state.success) return;
    toast.success(state.success);
    onSuccess();
  }, [onSuccess, state]);
}

export function ProjectGitHubRepository({
  projectId,
  workspaceId,
  projectTitle,
  accountLogin,
  connected,
  canManage,
  repository,
}: {
  projectId: string;
  workspaceId: string;
  projectTitle: string;
  accountLogin: string | null;
  connected: boolean;
  canManage: boolean;
  repository: LinkedRepository | null;
}) {
  if (!connected) return <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
    <div className="rounded-3xl border border-dashed p-8 sm:p-10">
      <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-pastel-sky"><GitFork aria-hidden /></span>
      <h2 className="font-heading text-2xl font-bold tracking-tight">Conecta GitHub al espacio</h2>
      <p className="mt-3 max-w-xl text-muted-foreground">Antes de vincular este proyecto, conecta una cuenta u organización desde la sección Personas del espacio.</p>
      <a className={buttonVariants({ className: "mt-6" })} href={`/dashboard?workspace=${workspaceId}&view=team`}><GitFork data-icon="inline-start" /> Ir a la conexión de GitHub</a>
    </div>
  </div>;

  if (!repository) return <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
    <div className="relative overflow-hidden rounded-3xl border-0 bg-pastel-sky p-8 sm:p-10">
      <div className="absolute -right-10 -top-10 size-40 rounded-full border-[28px] border-background/40" aria-hidden />
      <span className="relative mb-5 flex size-14 items-center justify-center rounded-2xl bg-background"><GitBranch aria-hidden /></span>
      <h2 className="relative font-heading text-2xl font-bold tracking-tight">Dale un hogar al código</h2>
      <p className="relative mt-3 max-w-xl text-foreground/70">Vincula un repositorio de @{accountLogin} o crea uno nuevo preparado para “{projectTitle}”.</p>
      {canManage && <div className="relative mt-7 flex flex-wrap gap-3"><LinkRepositoryDialog projectId={projectId} /><CreateRepositoryDialog projectId={projectId} suggestedName={projectTitle} /></div>}
      {!canManage && <p className="relative mt-6 text-sm font-medium">Un administrador del proyecto debe realizar la vinculación.</p>}
    </div>
    <RepositoryBenefits />
  </div>;

  return <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
    <div className="rounded-3xl border bg-card p-7 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-pastel-mint"><GitBranch aria-hidden /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-heading text-2xl font-bold tracking-tight">{repository.full_name}</h2>
              <Badge variant="secondary">Principal</Badge>
              <Badge variant="outline">{repository.visibility === "private" ? "Privado" : repository.visibility === "internal" ? "Interno" : "Público"}</Badge>
              {repository.archived && <Badge variant="outline">Archivado</Badge>}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{repository.description || "Repositorio vinculado a este proyecto."}</p>
          </div>
        </div>
        <a className={buttonVariants({ variant: "outline", size: "sm" })} href={repository.html_url} target="_blank" rel="noreferrer">Abrir en GitHub <ExternalLink data-icon="inline-end" /></a>
      </div>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <RepositoryFact label="Rama principal" value={repository.default_branch} />
        <RepositoryFact label="Conexión" value="GitHub App" />
        <RepositoryFact label="Última lectura" value={new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(repository.last_synced_at))} />
      </div>
      {canManage && <div className="mt-7 flex flex-wrap gap-3"><LinkRepositoryDialog projectId={projectId} changing /><UnlinkRepositoryDialog projectId={projectId} fullName={repository.full_name} /></div>}
    </div>
    <div className="flex flex-col gap-4">
      <RepositoryClone label="HTTPS" value={repository.clone_url} />
      <RepositoryClone label="SSH" value={repository.ssh_url} />
    </div>
  </div>;
}

function LinkRepositoryDialog({ projectId, changing = false }: { projectId: string; changing?: boolean }) {
  const [open, setOpen] = useState(false);
  const [repositories, setRepositories] = useState<AvailableRepository[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [state, action, pending] = useActionState(linkGitHubRepository, initialState);
  const router = useRouter();

  useActionFeedback(state, () => {
    setOpen(false);
    router.refresh();
  });

  async function loadRepositories() {
    if (repositories.length || loading) return;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/github/repositories?project=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      const body = await response.json() as { repositories?: AvailableRepository[]; error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudieron cargar los repositorios.");
      const available = (body.repositories ?? []).filter((repository) => !repository.archived);
      setRepositories(available);
      setSelected(available[0]?.id.toString() ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudieron cargar los repositorios.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) void loadRepositories();
  }

  return <Dialog open={open} onOpenChange={handleOpenChange}>
    <DialogTrigger render={<Button variant={changing ? "outline" : "default"} />}><Link2 data-icon="inline-start" />{changing ? "Cambiar repositorio" : "Vincular existente"}</DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-pastel-sky"><Link2 aria-hidden /></span>
        <DialogTitle>{changing ? "Cambiar repositorio principal" : "Vincular un repositorio"}</DialogTitle>
        <DialogDescription>Solo aparecen repositorios autorizados para esta instalación de GitHub.</DialogDescription>
      </DialogHeader>
      <form action={action}>
        <FieldGroup>
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="repository_id" value={selected} />
          {loading ? <div className="flex items-center gap-3 rounded-2xl bg-muted p-5 text-sm text-muted-foreground"><Spinner /> Cargando repositorios de GitHub…</div> : repositories.length ? <Field>
            <FieldLabel htmlFor="github-repository">Repositorio</FieldLabel>
            <Select items={repositories.map((repository) => ({ value: repository.id.toString(), label: repository.fullName }))} value={selected} onValueChange={(value) => setSelected(value ?? "")}>
              <SelectTrigger id="github-repository" className="w-full"><SelectValue placeholder="Elige un repositorio" /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}><SelectGroup>{repositories.map((repository) => <SelectItem key={repository.id} value={repository.id.toString()}>{repository.fullName} · {repository.visibility === "private" ? "privado" : "público"}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
            <FieldDescription>{repositories.length} repositorio{repositories.length === 1 ? "" : "s"} disponible{repositories.length === 1 ? "" : "s"}.</FieldDescription>
          </Field> : !loadError && !loading ? <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">La instalación no tiene repositorios disponibles. Puedes crear uno nuevo o ampliar el acceso desde GitHub.</p> : null}
          {(loadError || state.error) && <FieldError>{loadError || state.error}</FieldError>}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={pending || loading || !selected}>{pending ? <Spinner data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}{pending ? "Vinculando…" : changing ? "Guardar cambio" : "Vincular repositorio"}</Button>
          </DialogFooter>
        </FieldGroup>
      </form>
    </DialogContent>
  </Dialog>;
}

function CreateRepositoryDialog({ projectId, suggestedName }: { projectId: string; suggestedName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createAndLinkGitHubRepository, initialState);
  const router = useRouter();
  const normalizedName = useMemo(() => suggestedName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "nuevo-proyecto", [suggestedName]);

  useActionFeedback(state, () => {
    setOpen(false);
    router.refresh();
  });

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button variant="outline" />}><Plus data-icon="inline-start" /> Crear repositorio</DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-pastel-mint"><GitFork aria-hidden /></span>
        <DialogTitle>Crear repositorio en GitHub</DialogTitle>
        <DialogDescription>Se creará en la cuenta conectada y quedará vinculado inmediatamente a este proyecto.</DialogDescription>
      </DialogHeader>
      <form action={action}>
        <FieldGroup>
          <input type="hidden" name="project_id" value={projectId} />
          <Field><FieldLabel htmlFor="repository-name">Nombre</FieldLabel><Input id="repository-name" name="name" required maxLength={100} defaultValue={normalizedName} pattern="[A-Za-z0-9._-]+" /><FieldDescription>Letras, números, punto, guion y guion bajo.</FieldDescription></Field>
          <Field><FieldLabel htmlFor="repository-description">Descripción</FieldLabel><Textarea id="repository-description" name="description" rows={3} maxLength={1000} defaultValue={`Código fuente de ${suggestedName}`} /></Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="repository-visibility">Visibilidad</FieldLabel><Select name="visibility" defaultValue="private" items={[{ value: "private", label: "Privado" }, { value: "public", label: "Público" }]}><SelectTrigger id="repository-visibility" className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value="private"><LockKeyhole /> Privado</SelectItem><SelectItem value="public">Público</SelectItem></SelectGroup></SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="repository-gitignore">.gitignore</FieldLabel><Select name="gitignore" defaultValue="Node" items={[{ value: "none", label: "Ninguno" }, { value: "Node", label: "Node" }, { value: "Python", label: "Python" }, { value: "Java", label: "Java" }, { value: "VisualStudio", label: "Visual Studio" }, { value: "Go", label: "Go" }, { value: "Rust", label: "Rust" }]}><SelectTrigger id="repository-gitignore" className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value="none">Ninguno</SelectItem><SelectItem value="Node">Node</SelectItem><SelectItem value="Python">Python</SelectItem><SelectItem value="Java">Java</SelectItem><SelectItem value="VisualStudio">Visual Studio</SelectItem><SelectItem value="Go">Go</SelectItem><SelectItem value="Rust">Rust</SelectItem></SelectGroup></SelectContent></Select></Field>
          </div>
          <Field><FieldLabel htmlFor="repository-license">Licencia</FieldLabel><Select name="license" defaultValue="none" items={[{ value: "none", label: "Sin licencia" }, { value: "mit", label: "MIT" }, { value: "apache-2.0", label: "Apache 2.0" }, { value: "gpl-3.0", label: "GPL 3.0" }, { value: "mpl-2.0", label: "Mozilla Public License 2.0" }]}><SelectTrigger id="repository-license" className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value="none">Sin licencia</SelectItem><SelectItem value="mit">MIT</SelectItem><SelectItem value="apache-2.0">Apache 2.0</SelectItem><SelectItem value="gpl-3.0">GPL 3.0</SelectItem><SelectItem value="mpl-2.0">Mozilla Public License 2.0</SelectItem></SelectGroup></SelectContent></Select></Field>
          <Field orientation="horizontal"><Checkbox id="repository-readme" name="initialize_readme" defaultChecked /><FieldContent><FieldLabel htmlFor="repository-readme"><FieldTitle>Crear README inicial</FieldTitle></FieldLabel><FieldDescription>Deja el repositorio listo para recibir el primer commit.</FieldDescription></FieldContent></Field>
          {state.error && <FieldError>{state.error}</FieldError>}
          <DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}{pending ? "Creando repositorio…" : "Crear y vincular"}</Button></DialogFooter>
        </FieldGroup>
      </form>
    </DialogContent>
  </Dialog>;
}

function UnlinkRepositoryDialog({ projectId, fullName }: { projectId: string; fullName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(unlinkGitHubRepository, initialState);
  const router = useRouter();
  useActionFeedback(state, () => { setOpen(false); router.refresh(); });

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button variant="ghost" />}><Unlink data-icon="inline-start" /> Desvincular</DialogTrigger>
    <DialogContent className="max-w-md" showCloseButton={false}>
      <DialogHeader><span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-pastel-peach"><Unlink aria-hidden /></span><DialogTitle>¿Desvincular el repositorio?</DialogTitle><DialogDescription>Armario Dev dejará de usar {fullName}. El repositorio y todo su contenido permanecerán intactos en GitHub.</DialogDescription></DialogHeader>
      <form action={action}><input type="hidden" name="project_id" value={projectId} />{state.error && <FieldError className="mb-4">{state.error}</FieldError>}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose><Button type="submit" variant="destructive" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Unlink data-icon="inline-start" />}{pending ? "Desvinculando…" : "Sí, desvincular"}</Button></DialogFooter></form>
    </DialogContent>
  </Dialog>;
}

function RepositoryBenefits() {
  return <div className="rounded-3xl border bg-card p-7"><h3 className="font-heading text-lg font-bold">Qué habilita este vínculo</h3><div className="mt-5 flex flex-col gap-4"><Benefit icon={<GitBranch aria-hidden />} title="Historial y ramas" text="Commits y ramas aparecerán en las siguientes fases." /><Benefit icon={<RefreshCw aria-hidden />} title="Sincronización" text="Tareas, issues y pull requests podrán mantenerse conectados." /><Benefit icon={<LockKeyhole aria-hidden />} title="Acceso seguro" text="Los tokens temporales nunca se guardan en la base de datos." /></div></div>;
}

function Benefit({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">{icon}</span><div><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div></div>;
}

function RepositoryFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-semibold">{value}</p></div>;
}

function RepositoryClone({ label, value }: { label: string; value: string }) {
  async function copyCloneUrl() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`URL ${label} copiada.`);
    } catch {
      toast.error("No se pudo copiar la URL.");
    }
  }

  return <div className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">CLONAR POR {label}</p><Button type="button" size="xs" variant="ghost" onClick={copyCloneUrl}><Copy data-icon="inline-start" /> Copiar</Button></div><code className="mt-3 block overflow-x-auto text-xs leading-6">{value}</code></div>;
}
