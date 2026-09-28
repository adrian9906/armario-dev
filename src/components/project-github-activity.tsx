"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Clock3, ExternalLink, FileDiff, GitBranch, GitCommitHorizontal, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createGitHubBranch,
  deleteGitHubBranch,
  type GitHubRepositoryFormState,
} from "@/app/projects/github-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

type Snapshot = {
  summary: {
    fullName: string;
    description: string | null;
    htmlUrl: string;
    defaultBranch: string;
    visibility: string;
    archived: boolean;
    fork: boolean;
    language: string | null;
    stars: number;
    forks: number;
    openIssues: number;
    size: number;
    updatedAt: string;
    pushedAt: string | null;
  };
  branches: Array<{ name: string; sha: string; protected: boolean }>;
  commits: Array<{
    sha: string;
    htmlUrl: string;
    message: string;
    authoredAt: string | null;
    authorName: string;
    authorAvatarUrl: string | null;
  }>;
  syncedAt: string;
};

type CommitDetail = {
  sha: string;
  htmlUrl: string;
  message: string;
  authorName: string;
  authoredAt: string | null;
  stats: { total: number; additions: number; deletions: number };
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    blobUrl: string;
    patch: string | null;
  }>;
};

const initialState: GitHubRepositoryFormState = { error: null, success: null };
const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Sin actividad todavía";
const firstLine = (message: string) => message.split("\n", 1)[0];

function useActionFeedback(state: GitHubRepositoryFormState, onSuccess: () => void) {
  const handled = useRef(state);
  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      onSuccess();
    }
  }, [onSuccess, state]);
}

export function ProjectGitHubActivity({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchSnapshot = useCallback(async () => {
    const response = await fetch(`/api/github/projects/${encodeURIComponent(projectId)}/repository`, { cache: "no-store" });
    const body = await response.json() as Snapshot & { error?: string };
    if (!response.ok) throw new Error(body.error || "No se pudo sincronizar GitHub.");
    return body;
  }, [projectId]);

  const loadSnapshot = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      setSnapshot(await fetchSnapshot());
      if (manual) toast.success("Actividad de GitHub actualizada.");
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "No se pudo sincronizar GitHub.";
      setError(message);
      if (manual) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchSnapshot]);

  useEffect(() => {
    let ignore = false;
    fetchSnapshot()
      .then((body) => { if (!ignore) setSnapshot(body); })
      .catch((loadError: unknown) => {
        if (!ignore) setError(loadError instanceof Error ? loadError.message : "No se pudo sincronizar GitHub.");
      })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [fetchSnapshot]);

  if (loading) return <GitHubActivitySkeleton />;
  if (error || !snapshot) return <Alert variant="destructive"><AlertCircle aria-hidden /><AlertTitle>No pudimos leer la actividad</AlertTitle><AlertDescription>{error || "GitHub no devolvió datos."}<Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void loadSnapshot()}><RefreshCw data-icon="inline-start" /> Reintentar</Button></AlertDescription></Alert>;

  return <div className="flex flex-col gap-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Tecnología principal" value={snapshot.summary.language || "Sin detectar"} tone="bg-pastel-lavender" />
      <MetricCard label="Ramas" value={snapshot.branches.length.toLocaleString("es")} tone="bg-pastel-sky" />
      <MetricCard label="Issues abiertas" value={snapshot.summary.openIssues.toLocaleString("es")} tone="bg-pastel-peach" />
      <MetricCard label="Último push" value={formatDate(snapshot.summary.pushedAt)} tone="bg-pastel-mint" small />
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
      <span className="flex items-center gap-2"><Clock3 className="size-4" aria-hidden /> Sincronizado {formatDate(snapshot.syncedAt)}</span>
      <Button type="button" size="sm" variant="ghost" disabled={refreshing} onClick={() => void loadSnapshot(true)}>{refreshing ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}{refreshing ? "Actualizando…" : "Actualizar"}</Button>
    </div>

    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div><CardTitle className="flex items-center gap-2"><GitBranch className="size-5" aria-hidden /> Ramas</CardTitle><CardDescription>Organiza trabajo paralelo sin tocar la rama principal.</CardDescription></div>
          {canManage && snapshot.branches.length > 0 && <CreateBranchDialog projectId={projectId} branches={snapshot.branches} defaultBranch={snapshot.summary.defaultBranch} onChanged={() => void loadSnapshot()} />}
        </CardHeader>
        <CardContent className="space-y-2">
          {snapshot.branches.map((branch) => <div key={branch.name} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 p-4">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold">{branch.name}</p>{branch.name === snapshot.summary.defaultBranch && <Badge variant="secondary">Principal</Badge>}{branch.protected && <Badge variant="outline">Protegida</Badge>}</div><code className="mt-1 block text-xs text-muted-foreground">{branch.sha.slice(0, 7)}</code></div>
            {canManage && branch.name !== snapshot.summary.defaultBranch && !branch.protected && <DeleteBranchDialog projectId={projectId} branch={branch.name} onChanged={() => void loadSnapshot()} />}
          </div>)}
          {!snapshot.branches.length && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">El repositorio está vacío. Crea el primer commit en GitHub para habilitar ramas.</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><GitCommitHorizontal className="size-5" aria-hidden /> Commits recientes</CardTitle><CardDescription>Los últimos cambios publicados en el repositorio.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {snapshot.commits.map((commit) => <CommitDialog key={commit.sha} projectId={projectId} commit={commit} />)}
          {!snapshot.commits.length && <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Todavía no hay commits para mostrar.</div>}
        </CardContent>
      </Card>
    </div>
  </div>;
}

function MetricCard({ label, value, tone, small = false }: { label: string; value: string; tone: string; small?: boolean }) {
  return <div className={`${tone} rounded-3xl p-5`}><p className="text-xs font-semibold text-foreground/60">{label}</p><p className={`mt-3 font-heading font-bold tracking-tight ${small ? "text-base" : "text-2xl"}`}>{value}</p></div>;
}

function CreateBranchDialog({ projectId, branches, defaultBranch, onChanged }: { projectId: string; branches: Snapshot["branches"]; defaultBranch: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [baseBranch, setBaseBranch] = useState(defaultBranch);
  const [state, action, pending] = useActionState(createGitHubBranch, initialState);
  const success = useCallback(() => { setOpen(false); onChanged(); }, [onChanged]);
  useActionFeedback(state, success);

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button size="sm" />}><Plus data-icon="inline-start" /> Nueva rama</DialogTrigger>
    <DialogContent>
      <DialogHeader><span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-pastel-sky"><GitBranch aria-hidden /></span><DialogTitle>Crear una rama</DialogTitle><DialogDescription>La nueva rama comenzará exactamente en el último commit de la rama base.</DialogDescription></DialogHeader>
      <form action={action}><FieldGroup>
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="base_branch" value={baseBranch} />
        <Field><FieldLabel htmlFor="github-branch-name">Nombre</FieldLabel><Input id="github-branch-name" name="branch" required maxLength={255} placeholder="feature/nueva-funcionalidad" autoComplete="off" /><FieldDescription>Usa nombres breves, por ejemplo feature/login o fix/menu-movil.</FieldDescription></Field>
        <Field><FieldLabel htmlFor="github-base-branch">Crear desde</FieldLabel><Select value={baseBranch} onValueChange={(value) => setBaseBranch(value ?? defaultBranch)} items={branches.map((branch) => ({ value: branch.name, label: branch.name }))}><SelectTrigger id="github-base-branch" className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup>{branches.map((branch) => <SelectItem key={branch.name} value={branch.name}>{branch.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        {state.error && <FieldError>{state.error}</FieldError>}
        <DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Plus data-icon="inline-start" />}{pending ? "Creando…" : "Crear rama"}</Button></DialogFooter>
      </FieldGroup></form>
    </DialogContent>
  </Dialog>;
}

function DeleteBranchDialog({ projectId, branch, onChanged }: { projectId: string; branch: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteGitHubBranch, initialState);
  const success = useCallback(() => { setOpen(false); onChanged(); }, [onChanged]);
  useActionFeedback(state, success);

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button type="button" size="icon-sm" variant="ghost" aria-label={`Eliminar la rama ${branch}`} />}><Trash2 aria-hidden /></DialogTrigger>
    <DialogContent className="max-w-md" showCloseButton={false}>
      <DialogHeader><span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-pastel-peach"><Trash2 aria-hidden /></span><DialogTitle>¿Eliminar la rama?</DialogTitle><DialogDescription>Se eliminará <strong>{branch}</strong> de GitHub. Los commits que no estén en otra rama podrían dejar de ser accesibles.</DialogDescription></DialogHeader>
      <form action={action}><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="branch" value={branch} />{state.error && <FieldError className="mb-4">{state.error}</FieldError>}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose><Button type="submit" variant="destructive" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Trash2 data-icon="inline-start" />}{pending ? "Eliminando…" : "Eliminar rama"}</Button></DialogFooter></form>
    </DialogContent>
  </Dialog>;
}

function CommitDialog({ projectId, commit }: { projectId: string; commit: Snapshot["commits"][number] }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen || detail || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/github/projects/${encodeURIComponent(projectId)}/commits/${commit.sha}`, { cache: "no-store" });
      const body = await response.json() as CommitDetail & { error?: string };
      if (!response.ok) throw new Error(body.error || "No se pudo cargar el commit.");
      setDetail(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el commit.");
    } finally {
      setLoading(false);
    }
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => void handleOpenChange(nextOpen)}>
    <DialogTrigger render={<button type="button" className="w-full rounded-2xl border border-border/70 p-4 text-left transition-colors hover:bg-accent" />}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">{firstLine(commit.message)}</p><p className="mt-1 text-xs text-muted-foreground">{commit.authorName} · {formatDate(commit.authoredAt)}</p></div><code className="shrink-0 rounded-lg bg-muted px-2 py-1 text-xs">{commit.sha.slice(0, 7)}</code></div></DialogTrigger>
    <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-pastel-mint"><GitCommitHorizontal aria-hidden /></span><DialogTitle className="pr-8">{firstLine(commit.message)}</DialogTitle><DialogDescription>{commit.authorName} · {formatDate(commit.authoredAt)} · {commit.sha.slice(0, 12)}</DialogDescription></DialogHeader>
      {loading && <div className="flex items-center gap-3 rounded-2xl bg-muted p-6 text-sm text-muted-foreground"><Spinner /> Cargando detalle del commit…</div>}
      {error && <Alert variant="destructive"><AlertCircle aria-hidden /><AlertTitle>No se pudo cargar</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {detail && <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3"><Metric label="Archivos" value={detail.files.length} /><Metric label="Añadidas" value={`+${detail.stats.additions}`} positive /><Metric label="Eliminadas" value={`−${detail.stats.deletions}`} negative /></div>
        <div className="space-y-2"><h3 className="text-sm font-semibold">Archivos modificados</h3>{detail.files.map((file) => <a key={file.filename} href={file.blobUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 rounded-xl border p-3 text-sm hover:bg-accent"><span className="flex min-w-0 items-center gap-2"><FileDiff className="size-4 shrink-0" aria-hidden /><span className="truncate">{file.filename}</span></span><span className="shrink-0 text-xs"><span className="text-emerald-700">+{file.additions}</span> <span className="text-red-700">−{file.deletions}</span></span></a>)}</div>
      </div>}
      <DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cerrar</DialogClose><a className={buttonVariants()} href={commit.htmlUrl} target="_blank" rel="noreferrer">Ver en GitHub <ExternalLink data-icon="inline-end" /></a></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Metric({ label, value, positive, negative }: { label: string; value: string | number; positive?: boolean; negative?: boolean }) {
  return <div className="rounded-2xl bg-muted/60 p-4 text-center"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-lg font-bold ${positive ? "text-emerald-700" : negative ? "text-red-700" : ""}`}>{value}</p></div>;
}

function GitHubActivitySkeleton() {
  return <div className="space-y-6" aria-label="Cargando actividad de GitHub"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-28 rounded-3xl" />)}</div><div className="grid gap-6 xl:grid-cols-2"><Skeleton className="h-96 rounded-3xl" /><Skeleton className="h-96 rounded-3xl" /></div></div>;
}
