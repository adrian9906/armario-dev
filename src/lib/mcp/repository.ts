import "server-only";

import { createGitHubInstallationToken, githubJson } from "@/lib/github/auth";
import { getGitHubAppConfig } from "@/lib/github/env";
import { getAccessibleProject } from "@/lib/mcp/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMcpSearchFilter, createSearchSnippet, normalizeMcpSearchQuery } from "@/lib/mcp/search";
import { chooseRepositoryFiles, decodeGitHubTextBlob, MCP_REPOSITORY_INDEX_LIMITS, parseRepositoryPush } from "@/lib/mcp/repository-index";

type GitTree = { path: string; type: string; size?: number; sha: string };
type GitBlob = { content: string; encoding: string };
const repoPath = (owner: string, repository: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;

async function getAccessibleRepository(userId: string, projectId: string) {
  const admin = createAdminClient();
  const accessible = await getAccessibleProject(admin, userId, projectId);
  if (!accessible) return null;
  const workspaceId = accessible.project.workspace_id;
  const [{ data: installation, error: installationError }, { data: repository, error: repositoryError }] = await Promise.all([
    admin.from("github_installations").select("installation_id,permissions,status")
      .eq("workspace_id", workspaceId).eq("status", "active").maybeSingle(),
    admin.from("project_repositories").select("repository_id,owner_login,name,full_name,default_branch,workspace_id,indexed_commit_sha,indexed_at")
      .eq("project_id", projectId).eq("workspace_id", workspaceId).maybeSingle(),
  ]);
  if (installationError || repositoryError) throw new Error("mcp_repository_link_lookup_failed");
  const config = getGitHubAppConfig();
  if (!installation || !repository || !config) return null;
  return { admin, access: accessible, installation, repository, config };
}

async function inBatches<T, R>(items: T[], batchSize: number, run: (item: T) => Promise<R>) {
  const values: R[] = [];
  for (let start = 0; start < items.length; start += batchSize) {
    values.push(...await Promise.all(items.slice(start, start + batchSize).map(run)));
  }
  return values;
}

export async function indexProjectRepository(userId: string, projectId: string) {
  const context = await getAccessibleRepository(userId, projectId);
  if (!context) return null;
  if (context.access.access !== "manager") throw new Error("mcp_repository_index_manager_required");

  const { config, installation, repository, admin } = context;
  const { token } = await createGitHubInstallationToken(config, installation.installation_id);
  const path = repoPath(repository.owner_login, repository.name);
  const branch = repository.default_branch.split("/").map(encodeURIComponent).join("/");
  const ref = await githubJson<{ object: { sha: string } }>(`https://api.github.com${path}/git/ref/heads/${branch}`, token);
  const commit = await githubJson<{ sha: string; tree: { sha: string } }>(`https://api.github.com${path}/git/commits/${encodeURIComponent(ref.object.sha)}`, token);
  const tree = await githubJson<{ tree: GitTree[]; truncated?: boolean }>(`https://api.github.com${path}/git/trees/${encodeURIComponent(commit.tree.sha)}?recursive=1`, token);
  if (tree.truncated) throw new Error("mcp_repository_tree_truncated");
  const candidates = chooseRepositoryFiles(tree.tree ?? []);
  let selectedBytes = 0;
  const files = candidates.filter((file) => {
    if (selectedBytes + (file.size ?? 0) > MCP_REPOSITORY_INDEX_LIMITS.totalBytes) return false;
    selectedBytes += file.size ?? 0;
    return true;
  });
  const previousFiles = repository.indexed_commit_sha
    ? await admin.from("project_repository_index_files").select("path,blob_sha,size_bytes,content")
      .eq("project_id", projectId).eq("workspace_id", repository.workspace_id)
      .eq("github_repository_id", repository.repository_id).eq("source_commit_sha", repository.indexed_commit_sha)
    : { data: [], error: null };
  if (previousFiles.error) throw new Error("mcp_repository_previous_index_lookup_failed");
  const previousByPath = new Map((previousFiles.data ?? []).map((file) => [file.path, file]));
  const blobs = await inBatches(files, 8, async (file) => {
    const previous = previousByPath.get(file.path);
    if (previous?.blob_sha === file.sha) {
      return { path: file.path, blobSha: file.sha, sizeBytes: previous.size_bytes, content: previous.content };
    }
    const blob = await githubJson<GitBlob>(`https://api.github.com${path}/git/blobs/${encodeURIComponent(file.sha)}`, token);
    const content = decodeGitHubTextBlob(blob.content, blob.encoding);
    return content === null ? null : { path: file.path, blobSha: file.sha, sizeBytes: Buffer.byteLength(content, "utf8"), content };
  });
  const indexable = blobs.filter((file): file is NonNullable<typeof file> => file !== null);
  const totalBytes = indexable.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (totalBytes > MCP_REPOSITORY_INDEX_LIMITS.totalBytes) throw new Error("mcp_repository_index_too_large");

  const latestRef = await githubJson<{ object: { sha: string } }>(`https://api.github.com${path}/git/ref/heads/${branch}`, token);
  if (latestRef.object.sha !== commit.sha) {
    return {
      projectId,
      repository: repository.full_name,
      branch: repository.default_branch,
      sourceCommitSha: commit.sha,
      indexedAt: null,
      indexedFiles: 0,
      totalBytes: 0,
      skippedAsStale: true,
      note: "La rama principal cambió durante la indexación; se omitió esta instantánea obsoleta.",
    };
  }

  const indexedAt = new Date().toISOString();
  const rows = indexable.map((file) => ({
    project_id: projectId,
    workspace_id: context.access.project.workspace_id,
    github_repository_id: repository.repository_id,
    path: file.path,
    source_commit_sha: commit.sha,
    blob_sha: file.blobSha,
    size_bytes: file.sizeBytes,
    content: file.content,
    indexed_at: indexedAt,
  }));

  if (rows.length) {
    const { error } = await admin.from("project_repository_index_files")
      .upsert(rows, { onConflict: "project_id,github_repository_id,path,source_commit_sha" });
    if (error) throw new Error("mcp_repository_index_write_failed");
  }
  const { error: metadataError } = await admin.from("project_repositories")
    .update({ indexed_commit_sha: commit.sha, indexed_at: indexedAt })
    .eq("project_id", projectId).eq("workspace_id", context.access.project.workspace_id);
  if (metadataError) throw new Error("mcp_repository_index_metadata_failed");
  const { error: cleanupError } = await admin.from("project_repository_index_files")
    .delete().eq("project_id", projectId).or(`source_commit_sha.neq.${commit.sha},github_repository_id.neq.${repository.repository_id}`);
  if (cleanupError) throw new Error("mcp_repository_index_cleanup_failed");

  return {
    projectId,
    repository: repository.full_name,
    branch: repository.default_branch,
    sourceCommitSha: commit.sha,
    indexedAt,
    indexedFiles: rows.length,
    totalBytes,
    limits: MCP_REPOSITORY_INDEX_LIMITS,
    note: "Se indexan archivos de texto permitidos; archivos binarios, secretos conocidos y archivos grandes se excluyen.",
  };
}

export async function enqueueRepositoryIndexForPush(deliveryId: string, body: Record<string, unknown>) {
  const push = parseRepositoryPush(body);
  if (!push) return null;

  const admin = createAdminClient();
  const { data: linked, error: linkError } = await admin.from("project_repositories")
    .select("project_id,workspace_id,default_branch").eq("repository_id", push.repositoryId).maybeSingle();
  if (linkError) throw new Error("mcp_repository_webhook_lookup_failed");
  if (!linked || linked.default_branch !== push.branch) return null;

  const payload = { deliveryId, ...push };
  const { data: inserted, error: insertError } = await admin.from("github_sync_jobs").insert({
    workspace_id: linked.workspace_id,
    project_id: linked.project_id,
    operation: "mcp_repository_index",
    payload,
    status: "pending",
  }).select("id").single();
  if (!insertError && inserted) return inserted.id as string;
  if (insertError?.code !== "23505") throw new Error("mcp_repository_webhook_enqueue_failed");

  const { data: existing, error: existingError } = await admin.from("github_sync_jobs")
    .select("id,status,attempt_count,started_at").eq("operation", "mcp_repository_index")
    .contains("payload", { deliveryId }).maybeSingle();
  if (existingError || !existing) throw new Error("mcp_repository_webhook_job_lookup_failed");
  const staleRunning = existing.status === "running" && existing.started_at
    && Date.now() - Date.parse(existing.started_at) > 120_000;
  if ((existing.status === "failed" || staleRunning) && existing.attempt_count < 5) {
    let retryQuery = admin.from("github_sync_jobs")
      .update({ status: "pending", error: null, finished_at: null })
      .eq("id", existing.id).eq("status", existing.status);
    if (existing.status === "running" && existing.started_at) retryQuery = retryQuery.eq("started_at", existing.started_at);
    const { data: retried, error: retryError } = await retryQuery.select("id").maybeSingle();
    if (retryError) throw new Error("mcp_repository_webhook_retry_failed");
    if (retried) return retried.id as string;
  }
  return ["pending", "running", "completed"].includes(existing.status) ? existing.id as string : null;
}

export async function processRepositoryIndexJob(jobId: string) {
  const admin = createAdminClient();
  const { data: candidate, error: candidateError } = await admin.from("github_sync_jobs")
    .select("id,project_id,payload,status,attempt_count")
    .eq("id", jobId).eq("operation", "mcp_repository_index").eq("status", "pending").maybeSingle();
  if (candidateError || !candidate) return { processed: false };
  const { data: job, error: claimError } = await admin.from("github_sync_jobs")
    .update({ status: "running", started_at: new Date().toISOString(), attempt_count: candidate.attempt_count + 1, error: null })
    .eq("id", jobId).eq("status", "pending").select("id,project_id,payload,attempt_count").maybeSingle();
  if (claimError || !job || !job.project_id) return { processed: false };

  const payload = job.payload as { repositoryId?: number; branch?: string };
  try {
    if (!Number.isSafeInteger(payload.repositoryId) || !payload.branch)
      throw new Error("mcp_repository_job_payload_invalid");
    const { data: linked, error: linkError } = await admin.from("project_repositories")
      .select("repository_id,default_branch").eq("project_id", job.project_id).eq("repository_id", payload.repositoryId!).maybeSingle();
    if (linkError || !linked || linked.default_branch !== payload.branch)
      throw new Error("mcp_repository_link_changed");
    const { data: project, error: projectError } = await admin.from("projects")
      .select("creator_id").eq("id", job.project_id).maybeSingle();
    if (projectError || !project) throw new Error("mcp_repository_project_missing");

    // Use the linked project's creator as the system actor; the indexing code
    // still revalidates manager access and reads only the current default branch.
    const result = await indexProjectRepository(project.creator_id, job.project_id);
    if (!result) throw new Error("mcp_repository_index_unavailable");
    await admin.from("github_sync_jobs").update({
      status: "completed",
      payload: { ...payload, result: { sourceCommitSha: result.sourceCommitSha, indexedFiles: result.indexedFiles, totalBytes: result.totalBytes } },
      finished_at: new Date().toISOString(),
    }).eq("id", jobId).eq("status", "running");
    return { processed: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "mcp_repository_index_failed";
    await admin.from("github_sync_jobs").update({
      status: "failed", error: message.slice(0, 2000), finished_at: new Date().toISOString(),
    }).eq("id", jobId).eq("status", "running");
    return { processed: false, error: message };
  }
}

export async function searchIndexedRepositoryFiles(userId: string, projectId: string, query: string, limit = 10) {
  const context = await getAccessibleRepository(userId, projectId);
  if (!context) return null;
  const { data: repository, error: repositoryError } = await context.admin.from("project_repositories")
    .select("indexed_commit_sha,indexed_at,full_name,default_branch")
    .eq("project_id", projectId).eq("workspace_id", context.access.project.workspace_id).maybeSingle();
  if (repositoryError) throw new Error("mcp_repository_index_lookup_failed");
  if (!repository?.indexed_commit_sha) return { projectId, indexed: false, results: [] };

  const normalizedQuery = normalizeMcpSearchQuery(query);
  if (normalizedQuery.length < 2) throw new Error("mcp_search_query_too_short");
  const { data, error } = await context.admin.from("project_repository_index_files")
    .select("path,source_commit_sha,blob_sha,size_bytes,content,indexed_at")
    .eq("project_id", projectId).eq("workspace_id", context.access.project.workspace_id)
    .eq("github_repository_id", context.repository.repository_id)
    .eq("source_commit_sha", repository.indexed_commit_sha)
    .or(buildMcpSearchFilter(["path", "content"], normalizedQuery))
    .order("path", { ascending: true }).limit(Math.min(Math.max(limit, 1), 20));
  if (error) throw new Error("mcp_repository_search_failed");
  return {
    projectId,
    repository: repository.full_name,
    branch: repository.default_branch,
    sourceCommitSha: repository.indexed_commit_sha,
    indexedAt: repository.indexed_at,
    query: normalizedQuery,
    total: data?.length ?? 0,
    results: (data ?? []).map((file) => ({
      path: file.path,
      sourceCommitSha: file.source_commit_sha,
      blobSha: file.blob_sha,
      sizeBytes: file.size_bytes,
      snippet: createSearchSnippet(file.content, normalizedQuery),
    })),
  };
}

export async function fetchIndexedRepositoryFile(userId: string, projectId: string, filePath: string) {
  const context = await getAccessibleRepository(userId, projectId);
  if (!context) return null;
  const { data: repository, error: repositoryError } = await context.admin.from("project_repositories")
    .select("indexed_commit_sha,indexed_at,full_name,default_branch")
    .eq("project_id", projectId).eq("workspace_id", context.access.project.workspace_id).maybeSingle();
  if (repositoryError) throw new Error("mcp_repository_index_lookup_failed");
  if (!repository?.indexed_commit_sha) return null;
  const { data, error } = await context.admin.from("project_repository_index_files")
    .select("path,source_commit_sha,blob_sha,size_bytes,content,indexed_at")
    .eq("project_id", projectId).eq("workspace_id", context.access.project.workspace_id)
    .eq("github_repository_id", context.repository.repository_id)
    .eq("source_commit_sha", repository.indexed_commit_sha).eq("path", filePath).maybeSingle();
  if (error) throw new Error("mcp_repository_file_fetch_failed");
  if (!data) return null;
  return {
    projectId,
    repository: repository.full_name,
    branch: repository.default_branch,
    indexedAt: repository.indexed_at,
    ...data,
  };
}
