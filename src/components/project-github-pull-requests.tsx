"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, FileDiff, GitMerge, GitPullRequest, MessageSquare, Pencil, Plus, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  createGitHubPullRequest,
  editGitHubPullRequest,
  mergeGitHubPullRequest,
  reviewGitHubPullRequest,
  setGitHubPullRequestState,
  type GitHubPullRequestFormState,
} from "@/app/projects/github-pull-request-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type Branch = { name: string; sha: string; protected: boolean };
type PullRequest = {
  number: number; title: string; body: string | null; state: "open" | "closed"; draft: boolean; merged: boolean;
  mergedAt: string | null; htmlUrl: string; createdAt: string; updatedAt: string; author: string; authorAvatarUrl: string;
  head: { ref: string; sha: string; repository: string | null }; base: { ref: string; sha: string };
};
type PullRequestList = { repository: string; defaultBranch: string; branches: Branch[]; pullRequests: PullRequest[] };
type PullRequestDetail = {
  pullRequest: PullRequest & { mergeable: boolean | null; mergeableState: string; additions: number; deletions: number; changedFiles: number; commitCount: number; canDeleteHead: boolean };
  commits: Array<{ sha: string; htmlUrl: string; message: string; author: string; authoredAt: string | null }>;
  files: Array<{ sha: string; filename: string; status: string; additions: number; deletions: number; changes: number; blobUrl: string; patch: string | null }>;
  reviews: Array<{ id: number; author: string; body: string | null; state: string; htmlUrl: string; submittedAt: string | null }>;
};

const initialState: GitHubPullRequestFormState = { error: null, success: null };
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Sin fecha";
const firstLine = (value: string) => value.split("\n", 1)[0];

function useFeedback(state: GitHubPullRequestFormState, onSuccess: () => void) {
  const handled = useRef(state);
  useEffect(() => {
    if (handled.current === state) return;
    handled.current = state;
    if (state.error) toast.error(state.error);
    if (state.success) { toast.success(state.success); onSuccess(); }
  }, [onSuccess, state]);
}

export function ProjectGitHubPullRequests({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [data, setData] = useState<PullRequestList | null>(null);
  const [filter, setFilter] = useState("open");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchPullRequests = useCallback(async () => {
    const response = await fetch(`/api/github/projects/${encodeURIComponent(projectId)}/pull-requests`, { cache: "no-store" });
    const body = await response.json() as PullRequestList & { error?: string };
    if (!response.ok) throw new Error(body.error || "No se pudieron cargar los pull requests.");
    return body;
  }, [projectId]);
  const refresh = useCallback(async (notify = false) => {
    setRefreshing(true); setError("");
    try { setData(await fetchPullRequests()); if (notify) toast.success("Pull requests actualizados."); }
    catch (loadError) { const message = loadError instanceof Error ? loadError.message : "No se pudieron cargar los pull requests."; setError(message); if (notify) toast.error(message); }
    finally { setRefreshing(false); setLoading(false); }
  }, [fetchPullRequests]);

  useEffect(() => {
    let ignore = false;
    fetchPullRequests().then((result) => { if (!ignore) setData(result); }).catch((loadError: unknown) => { if (!ignore) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los pull requests."); }).finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [fetchPullRequests]);

  const visible = useMemo(() => data?.pullRequests.filter((pullRequest) => filter === "all" || (filter === "merged" ? pullRequest.merged : filter === "closed" ? pullRequest.state === "closed" && !pullRequest.merged : pullRequest.state === filter)) ?? [], [data, filter]);

  if (loading) return <Skeleton className="h-80 rounded-3xl" />;
  if (error || !data) return <Alert variant="destructive"><AlertCircle aria-hidden /><AlertTitle>No pudimos cargar los pull requests</AlertTitle><AlertDescription>{error}<Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}><RefreshCw data-icon="inline-start" /> Reintentar</Button></AlertDescription></Alert>;

  return <Card>
    <CardHeader className="flex-row items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><GitPullRequest className="size-5" aria-hidden /> Pull requests</CardTitle><CardDescription>Revisa cambios, conversa y decide cómo llegan a {data.defaultBranch}.</CardDescription></div>{canManage && <CreatePullRequestDialog projectId={projectId} branches={data.branches} defaultBranch={data.defaultBranch} onChanged={() => void refresh()} />}</CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><Select value={filter} onValueChange={(value) => setFilter(value ?? "open")} items={[{ value: "open", label: "Abiertos" }, { value: "merged", label: "Fusionados" }, { value: "closed", label: "Cerrados" }, { value: "all", label: "Todos" }]}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value="open">Abiertos</SelectItem><SelectItem value="merged">Fusionados</SelectItem><SelectItem value="closed">Cerrados</SelectItem><SelectItem value="all">Todos</SelectItem></SelectGroup></SelectContent></Select><Button type="button" variant="ghost" size="sm" disabled={refreshing} onClick={() => void refresh(true)}>{refreshing ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}{refreshing ? "Actualizando…" : "Actualizar"}</Button></div>
      <div className="grid gap-3 lg:grid-cols-2">{visible.map((pullRequest) => <PullRequestDialog key={pullRequest.number} projectId={projectId} pullRequest={pullRequest} branches={data.branches} repository={data.repository} canManage={canManage} onChanged={() => void refresh()} />)}</div>
      {!visible.length && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No hay pull requests en este estado.</p>}
    </CardContent>
  </Card>;
}

function PullRequestCard({ pullRequest }: { pullRequest: PullRequest }) {
  return <div className="flex h-full flex-col gap-3 text-left"><div className="flex items-start justify-between gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-pastel-lavender"><GitPullRequest aria-hidden /></span><PullStatus pullRequest={pullRequest} /></div><div><p className="line-clamp-2 font-semibold">{pullRequest.title}</p><p className="mt-1 text-xs text-muted-foreground">#{pullRequest.number} por {pullRequest.author} · {formatDate(pullRequest.updatedAt)}</p></div><p className="mt-auto truncate text-xs text-muted-foreground">{pullRequest.head.ref} → {pullRequest.base.ref}</p></div>;
}

function PullStatus({ pullRequest }: { pullRequest: PullRequest }) {
  if (pullRequest.merged) return <Badge variant="secondary">Fusionado</Badge>;
  if (pullRequest.draft) return <Badge variant="outline">Borrador</Badge>;
  return <Badge variant={pullRequest.state === "open" ? "default" : "destructive"}>{pullRequest.state === "open" ? "Abierto" : "Cerrado"}</Badge>;
}

function CreatePullRequestDialog({ projectId, branches, defaultBranch, onChanged }: { projectId: string; branches: Branch[]; defaultBranch: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false); const [head, setHead] = useState(branches.find((branch) => branch.name !== defaultBranch)?.name ?? ""); const [base, setBase] = useState(defaultBranch);
  const [state, action, pending] = useActionState(createGitHubPullRequest, initialState);
  const success = useCallback(() => { setOpen(false); onChanged(); }, [onChanged]); useFeedback(state, success);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size="sm" disabled={branches.length < 2} />}><Plus data-icon="inline-start" /> Nuevo PR</DialogTrigger><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>Crear pull request</DialogTitle><DialogDescription>Compara una rama de trabajo con la rama de destino. También puedes comenzar como borrador.</DialogDescription></DialogHeader><form action={action}><FieldGroup><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="head" value={head} /><input type="hidden" name="base" value={base} /><Field><FieldLabel htmlFor="pr-title">Título</FieldLabel><Input id="pr-title" name="title" required maxLength={256} /></Field><Field><FieldLabel htmlFor="pr-body">Descripción</FieldLabel><Textarea id="pr-body" name="body" rows={6} maxLength={65000} placeholder="Qué cambia, por qué y cómo comprobarlo…" /></Field><div className="grid gap-4 sm:grid-cols-2"><BranchSelect id="pr-head" label="Rama con cambios" value={head} onChange={setHead} branches={branches} /><BranchSelect id="pr-base" label="Rama de destino" value={base} onChange={setBase} branches={branches} /></div><Field orientation="horizontal"><Checkbox id="pr-draft" name="draft" /><FieldContent><FieldLabel htmlFor="pr-draft"><FieldTitle>Crear como borrador</FieldTitle></FieldLabel><FieldDescription>No podrá fusionarse hasta marcarse listo desde GitHub.</FieldDescription></FieldContent></Field>{state.error && <FieldError>{state.error}</FieldError>}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose><Button type="submit" disabled={pending || !head || head === base}>{pending ? <Spinner data-icon="inline-start" /> : <GitPullRequest data-icon="inline-start" />}{pending ? "Creando…" : "Crear pull request"}</Button></DialogFooter></FieldGroup></form></DialogContent></Dialog>;
}

function BranchSelect({ id, label, value, onChange, branches }: { id: string; label: string; value: string; onChange: (value: string) => void; branches: Branch[] }) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Select value={value} onValueChange={(next) => onChange(next ?? "")} items={branches.map((branch) => ({ value: branch.name, label: branch.name }))}><SelectTrigger id={id} className="w-full"><SelectValue placeholder="Elige una rama" /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup>{branches.map((branch) => <SelectItem key={branch.name} value={branch.name}>{branch.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;
}

function PullRequestDialog({ projectId, pullRequest, branches, repository, canManage, onChanged }: { projectId: string; pullRequest: PullRequest; branches: Branch[]; repository: string; canManage: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false); const [detail, setDetail] = useState<PullRequestDetail | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const loadDetail = useCallback(async () => { setLoading(true); setError(""); try { const response = await fetch(`/api/github/projects/${encodeURIComponent(projectId)}/pull-requests/${pullRequest.number}`, { cache: "no-store" }); const body = await response.json() as PullRequestDetail & { error?: string }; if (!response.ok) throw new Error(body.error || "No se pudo cargar el pull request."); setDetail(body); } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el pull request."); } finally { setLoading(false); } }, [projectId, pullRequest.number]);
  function handleOpen(next: boolean) { setOpen(next); if (next && !detail && !loading) void loadDetail(); }
  const changed = useCallback(() => { void loadDetail(); onChanged(); }, [loadDetail, onChanged]);
  return <Dialog open={open} onOpenChange={handleOpen}><DialogTrigger render={<button type="button" className="rounded-2xl border border-border/70 p-4 transition-colors hover:bg-accent" />}><PullRequestCard pullRequest={pullRequest} /></DialogTrigger><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{pullRequest.title}</DialogTitle><DialogDescription>#{pullRequest.number} · {pullRequest.head.ref} → {pullRequest.base.ref}</DialogDescription></DialogHeader>{loading && <div className="flex items-center gap-3 rounded-2xl bg-muted p-6 text-sm text-muted-foreground"><Spinner /> Cargando revisión completa…</div>}{error && <Alert variant="destructive"><AlertCircle aria-hidden /><AlertTitle>No se pudo cargar</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}{detail && <PullRequestDetailView projectId={projectId} detail={detail} branches={branches} repository={repository} canManage={canManage} onChanged={changed} />}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cerrar</DialogClose><a className={buttonVariants()} href={pullRequest.htmlUrl} target="_blank" rel="noreferrer">Abrir en GitHub <ExternalLink data-icon="inline-end" /></a></DialogFooter></DialogContent></Dialog>;
}

function PullRequestDetailView({ projectId, detail, branches, repository, canManage, onChanged }: { projectId: string; detail: PullRequestDetail; branches: Branch[]; repository: string; canManage: boolean; onChanged: () => void }) {
  const pr = detail.pullRequest;
  return <div className="flex flex-col gap-6"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Commits" value={pr.commitCount} /><Metric label="Archivos" value={pr.changedFiles} /><Metric label="Añadidas" value={`+${pr.additions}`} /><Metric label="Eliminadas" value={`−${pr.deletions}`} /></div><div className="rounded-2xl bg-muted/60 p-5"><div className="mb-3 flex flex-wrap items-center gap-2"><PullStatus pullRequest={pr} /><Badge variant="outline">{pr.mergeable === false ? "Con conflictos" : pr.mergeable === true ? "Fusionable" : "Calculando merge"}</Badge></div><p className="whitespace-pre-wrap text-sm leading-6">{pr.body || "Sin descripción."}</p></div>{canManage && <div className="flex flex-wrap gap-2"><EditPullRequestDialog projectId={projectId} pullRequest={pr} branches={branches} onChanged={onChanged} />{pr.state === "open" && !pr.merged && <><ReviewDialog projectId={projectId} number={pr.number} event="APPROVE" onChanged={onChanged} /><ReviewDialog projectId={projectId} number={pr.number} event="REQUEST_CHANGES" onChanged={onChanged} /><ReviewDialog projectId={projectId} number={pr.number} event="COMMENT" onChanged={onChanged} />{!pr.draft && <MergeDialog projectId={projectId} pullRequest={pr} repository={repository} onChanged={onChanged} />}<StateDialog projectId={projectId} number={pr.number} state="closed" onChanged={onChanged} /></>}{pr.state === "closed" && !pr.merged && <StateDialog projectId={projectId} number={pr.number} state="open" onChanged={onChanged} />}</div>}<section><h3 className="mb-3 text-sm font-semibold">Archivos modificados</h3><div className="flex flex-col gap-2">{detail.files.map((file) => <details key={file.filename} className="rounded-2xl border border-border/70 p-4"><summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2"><FileDiff className="size-4 shrink-0" aria-hidden /><span className="truncate text-sm font-medium">{file.filename}</span></span><span className="shrink-0 text-xs text-muted-foreground">+{file.additions} −{file.deletions}</span></div></summary>{file.patch ? <pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-muted p-4 text-xs whitespace-pre-wrap">{file.patch}</pre> : <p className="mt-3 text-xs text-muted-foreground">GitHub no proporcionó un diff textual para este archivo.</p>}</details>)}</div></section><div className="grid gap-6 lg:grid-cols-2"><section><h3 className="mb-3 text-sm font-semibold">Commits</h3><div className="flex flex-col gap-2">{detail.commits.map((commit) => <a key={commit.sha} href={commit.htmlUrl} target="_blank" rel="noreferrer" className="rounded-xl border p-3 text-sm hover:bg-accent"><p className="font-medium">{firstLine(commit.message)}</p><p className="mt-1 text-xs text-muted-foreground">{commit.author} · {commit.sha.slice(0, 7)}</p></a>)}</div></section><section><h3 className="mb-3 text-sm font-semibold">Revisiones</h3><div className="flex flex-col gap-2">{detail.reviews.map((review) => <a key={review.id} href={review.htmlUrl} target="_blank" rel="noreferrer" className="rounded-xl border p-3 text-sm hover:bg-accent"><div className="flex items-center justify-between gap-2"><strong>{review.author}</strong><Badge variant="outline">{review.state}</Badge></div>{review.body && <p className="mt-2 text-muted-foreground">{review.body}</p>}</a>)}{!detail.reviews.length && <p className="text-sm text-muted-foreground">Todavía no hay revisiones.</p>}</div></section></div></div>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl bg-muted/60 p-4 text-center"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>; }

function EditPullRequestDialog({ projectId, pullRequest, branches, onChanged }: { projectId: string; pullRequest: PullRequest; branches: Branch[]; onChanged: () => void }) {
  const [open, setOpen] = useState(false); const [base, setBase] = useState(pullRequest.base.ref); const [state, action, pending] = useActionState(editGitHubPullRequest, initialState); const success = useCallback(() => { setOpen(false); onChanged(); }, [onChanged]); useFeedback(state, success);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size="sm" variant="outline" />}><Pencil data-icon="inline-start" /> Editar</DialogTrigger><DialogContent><DialogHeader><DialogTitle>Editar pull request #{pullRequest.number}</DialogTitle><DialogDescription>Cambia el título, la descripción o la rama de destino.</DialogDescription></DialogHeader><form action={action}><FieldGroup><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="pull_number" value={pullRequest.number} /><input type="hidden" name="base" value={base} /><Field><FieldLabel htmlFor={`edit-title-${pullRequest.number}`}>Título</FieldLabel><Input id={`edit-title-${pullRequest.number}`} name="title" required maxLength={256} defaultValue={pullRequest.title} /></Field><Field><FieldLabel htmlFor={`edit-body-${pullRequest.number}`}>Descripción</FieldLabel><Textarea id={`edit-body-${pullRequest.number}`} name="body" rows={6} maxLength={65000} defaultValue={pullRequest.body ?? ""} /></Field><BranchSelect id={`edit-base-${pullRequest.number}`} label="Rama de destino" value={base} onChange={setBase} branches={branches} />{state.error && <FieldError>{state.error}</FieldError>}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Pencil data-icon="inline-start" />}{pending ? "Guardando…" : "Guardar cambios"}</Button></DialogFooter></FieldGroup></form></DialogContent></Dialog>;
}

function ReviewDialog({ projectId, number, event, onChanged }: { projectId: string; number: number; event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"; onChanged: () => void }) {
  const [open, setOpen] = useState(false); const [state, action, pending] = useActionState(reviewGitHubPullRequest, initialState); const success = useCallback(() => { setOpen(false); onChanged(); }, [onChanged]); useFeedback(state, success); const title = event === "APPROVE" ? "Aprobar" : event === "REQUEST_CHANGES" ? "Solicitar cambios" : "Comentar"; const Icon = event === "APPROVE" ? CheckCircle2 : event === "REQUEST_CHANGES" ? XCircle : MessageSquare;
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size="sm" variant={event === "APPROVE" ? "default" : "outline"} />}><Icon data-icon="inline-start" /> {title}</DialogTrigger><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{title} el pull request</DialogTitle><DialogDescription>{event === "REQUEST_CHANGES" ? "La explicación es obligatoria para que quede claro qué debe corregirse." : "La revisión aparecerá en GitHub con la identidad de la App."}</DialogDescription></DialogHeader><form action={action}><FieldGroup><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="pull_number" value={number} /><input type="hidden" name="event" value={event} /><Field><FieldLabel htmlFor={`review-${event}-${number}`}>Comentario</FieldLabel><Textarea id={`review-${event}-${number}`} name="body" rows={5} required={event === "REQUEST_CHANGES"} /></Field>{state.error && <FieldError>{state.error}</FieldError>}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Icon data-icon="inline-start" />}{pending ? "Enviando…" : title}</Button></DialogFooter></FieldGroup></form></DialogContent></Dialog>;
}

function StateDialog({ projectId, number, state: targetState, onChanged }: { projectId: string; number: number; state: "open" | "closed"; onChanged: () => void }) {
  const [open, setOpen] = useState(false); const [state, action, pending] = useActionState(setGitHubPullRequestState, initialState); const success = useCallback(() => { setOpen(false); onChanged(); }, [onChanged]); useFeedback(state, success); const reopening = targetState === "open"; const Icon = reopening ? RotateCcw : XCircle;
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size="sm" variant="ghost" />}><Icon data-icon="inline-start" /> {reopening ? "Reabrir" : "Cerrar"}</DialogTrigger><DialogContent className="max-w-md" showCloseButton={false}><DialogHeader><DialogTitle>¿{reopening ? "Reabrir" : "Cerrar"} el pull request #{number}?</DialogTitle><DialogDescription>{reopening ? "Volverá a aceptar cambios y revisiones." : "No se fusionará y permanecerá disponible en el historial."}</DialogDescription></DialogHeader><form action={action}><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="pull_number" value={number} /><input type="hidden" name="state" value={targetState} />{state.error && <FieldError className="mb-4">{state.error}</FieldError>}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose><Button type="submit" variant={reopening ? "default" : "destructive"} disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <Icon data-icon="inline-start" />}{pending ? "Procesando…" : reopening ? "Reabrir" : "Cerrar PR"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function MergeDialog({ projectId, pullRequest, repository, onChanged }: { projectId: string; pullRequest: PullRequestDetail["pullRequest"]; repository: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false); const [method, setMethod] = useState("squash"); const [state, action, pending] = useActionState(mergeGitHubPullRequest, initialState); const success = useCallback(() => { setOpen(false); onChanged(); }, [onChanged]); useFeedback(state, success);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger render={<Button size="sm" disabled={pullRequest.mergeable === false} />}><GitMerge data-icon="inline-start" /> Fusionar</DialogTrigger><DialogContent className="max-w-lg" showCloseButton={false}><DialogHeader><DialogTitle>Fusionar pull request #{pullRequest.number}</DialogTitle><DialogDescription>GitHub comprobará de nuevo el commit {pullRequest.head.sha.slice(0, 7)} y las reglas del repositorio antes de modificar {pullRequest.base.ref}.</DialogDescription></DialogHeader><form action={action}><FieldGroup><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="pull_number" value={pullRequest.number} /><input type="hidden" name="expected_head_sha" value={pullRequest.head.sha} /><input type="hidden" name="merge_method" value={method} /><Field><FieldLabel htmlFor={`merge-method-${pullRequest.number}`}>Método</FieldLabel><Select value={method} onValueChange={(value) => setMethod(value ?? "squash")} items={[{ value: "merge", label: "Merge commit" }, { value: "squash", label: "Squash" }, { value: "rebase", label: "Rebase" }]}><SelectTrigger id={`merge-method-${pullRequest.number}`} className="w-full"><SelectValue /></SelectTrigger><SelectContent alignItemWithTrigger={false}><SelectGroup><SelectItem value="merge">Merge commit</SelectItem><SelectItem value="squash">Squash</SelectItem><SelectItem value="rebase">Rebase</SelectItem></SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor={`merge-title-${pullRequest.number}`}>Título del commit</FieldLabel><Input id={`merge-title-${pullRequest.number}`} name="commit_title" required maxLength={256} defaultValue={`${pullRequest.title} (#${pullRequest.number})`} /></Field><Field><FieldLabel htmlFor={`merge-message-${pullRequest.number}`}>Mensaje adicional</FieldLabel><Textarea id={`merge-message-${pullRequest.number}`} name="commit_message" rows={3} maxLength={65000} /></Field>{pullRequest.canDeleteHead && pullRequest.head.repository === repository && <Field orientation="horizontal"><Checkbox id={`delete-head-${pullRequest.number}`} name="delete_branch" /><FieldContent><FieldLabel htmlFor={`delete-head-${pullRequest.number}`}><FieldTitle>Eliminar {pullRequest.head.ref} después del merge</FieldTitle></FieldLabel><FieldDescription>Solo ocurrirá si el merge termina correctamente.</FieldDescription></FieldContent></Field>}{state.error && <FieldError>{state.error}</FieldError>}<DialogFooter><DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : <GitMerge data-icon="inline-start" />}{pending ? "Fusionando…" : "Confirmar merge"}</Button></DialogFooter></FieldGroup></form></DialogContent></Dialog>;
}

