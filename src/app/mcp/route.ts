import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { auth } from "@clerk/nextjs/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { formatMcpGitHubError } from "@/lib/github/api-errors";
import { serializeMcpOutput } from "@/lib/mcp/output";
import { fetchUserProjectDocument, getMcpAccessToken, getMcpUserId, getUserProjectContext, listUserProjects, listUserWorkspaces, listWorkspaceIdeas, MCP_DOCUMENT_TYPES, searchUserProject } from "@/lib/mcp/server";
import { fetchIndexedRepositoryFile, indexProjectRepository, searchIndexedRepositoryFiles } from "@/lib/mcp/repository";
import {
  commitMcpGitHubFiles, createMcpGitHubBranch, createMcpGitHubIssue, createMcpGitHubPullRequest,
  createMcpTaskGitHubPullRequest, deleteMcpGitHubBranch,
  getMcpGitHubCommit, getMcpGitHubPullRequest, getMcpRepositorySnapshot, listMcpGitHubIssues,
  listMcpGitHubPullRequests, mergeMcpGitHubPullRequest, reviewMcpGitHubPullRequest,
  saveMcpGitHubAutomationSettings, synchronizeMcpGitHubTasks,
  updateMcpGitHubIssue, updateMcpGitHubPullRequest,
} from "@/lib/mcp/github";
import {
  addMcpChecklistItem, addMcpComment, convertMcpIdeaToProject, createMcpDecision, createMcpIdea,
  createMcpProject, createMcpRequirement, createMcpTask, linkMcpDiagram, linkMcpTaskRequirement,
  listMcpComments, moveMcpProjectItem, restoreMcpDiagramVersion, saveMcpDiagram, saveMcpTechnology,
  setMcpIdeaStatus, setMcpRequirementStatus, toggleMcpChecklistItem, updateMcpDecision,
  updateMcpIdea, updateMcpProject, updateMcpRequirement, updateMcpTask, updateMcpTaskStatus,
} from "@/lib/mcp/writes";

const handler = createMcpHandler((server) => {
  server.registerTool(
    "list_my_workspaces",
    {
      title: "List my workspaces",
      description: "Lists only the Armario Dev workspaces where the authenticated user is a member.",
    },
    async (context) => {
      try {
        const userId = getMcpUserId(context);
        const workspaces = await listUserWorkspaces(userId);
        return { content: [{ type: "text", text: serializeMcpOutput(workspaces) }] };
      } catch {
        return { isError: true, content: [{ type: "text", text: "No se pudieron cargar tus espacios de trabajo." }] };
      }
    },
  );

  server.registerTool(
    "list_workspace_ideas",
    {
      title: "List workspace ideas",
      description: "Lists non-archived ideas from a workspace the authenticated user belongs to.",
      inputSchema: z.object({ workspaceId: z.string().uuid() }),
    },
    async ({ workspaceId }, context) => {
      try {
        const ideas = await listWorkspaceIdeas(getMcpUserId(context), workspaceId);
        if (!ideas) return { isError: true, content: [{ type: "text", text: "No tienes acceso a ese espacio de trabajo." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(ideas) }] };
      } catch {
        return { isError: true, content: [{ type: "text", text: "No se pudieron cargar las ideas de ese espacio." }] };
      }
    },
  );

  server.registerTool(
    "list_projects",
    {
      title: "List workspace projects",
      description: "Lists active projects in a workspace the authenticated user belongs to, honoring private and restricted project access.",
      inputSchema: z.object({ workspaceId: z.string().uuid() }),
    },
    async ({ workspaceId }, context) => {
      try {
        const projects = await listUserProjects(getMcpUserId(context), workspaceId);
        if (!projects) return { isError: true, content: [{ type: "text", text: "No tienes acceso a ese espacio de trabajo." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(projects) }] };
      } catch {
        return { isError: true, content: [{ type: "text", text: "No se pudieron cargar los proyectos de ese espacio." }] };
      }
    },
  );

  server.registerTool(
    "get_project_context",
    {
      title: "Get project context",
      description: "Reads an accessible project's objective, requirements, tasks, technology decisions, architecture decisions, and diagrams. This tool does not modify data.",
      inputSchema: z.object({ projectId: z.string().uuid() }),
    },
    async ({ projectId }, context) => {
      try {
        const project = await getUserProjectContext(getMcpUserId(context), projectId);
        if (!project) return { isError: true, content: [{ type: "text", text: "No tienes acceso a ese proyecto." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(project) }] };
      } catch {
        return { isError: true, content: [{ type: "text", text: "No se pudo cargar el contexto del proyecto." }] };
      }
    },
  );

  server.registerTool(
    "search_project",
    {
      title: "Search project knowledge",
      description: "Searches the accessible project's objective, source idea, requirements, tasks, technology decisions, ADRs, and Mermaid diagrams. Returns concise excerpts and document IDs; use fetch_document to read a full result. This tool is read-only.",
      inputSchema: z.object({
        projectId: z.string().uuid(),
        query: z.string().trim().min(2).max(200),
        types: z.array(z.enum(MCP_DOCUMENT_TYPES)).max(MCP_DOCUMENT_TYPES.length).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async ({ projectId, query, types, limit }, context) => {
      try {
        const results = await searchUserProject(getMcpUserId(context), projectId, query, types, limit);
        if (!results) return { isError: true, content: [{ type: "text", text: "No tienes acceso a ese proyecto." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(results) }] };
      } catch {
        return { isError: true, content: [{ type: "text", text: "No se pudo buscar en el contenido del proyecto." }] };
      }
    },
  );

  server.registerTool(
    "fetch_document",
    {
      title: "Read a project document",
      description: "Reads one complete project, source idea, requirement, task with checklist, technology entry, architecture decision, or diagram with its recent version and traceability links. Requires both projectId and documentId and returns nothing outside that project. This tool is read-only.",
      inputSchema: z.object({
        projectId: z.string().uuid(),
        type: z.enum(MCP_DOCUMENT_TYPES),
        documentId: z.string().uuid(),
      }),
    },
    async ({ projectId, type, documentId }, context) => {
      try {
        const document = await fetchUserProjectDocument(getMcpUserId(context), projectId, type, documentId);
        if (!document) return { isError: true, content: [{ type: "text", text: "No se encontró ese documento dentro del proyecto accesible." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(document) }] };
      } catch {
        return { isError: true, content: [{ type: "text", text: "No se pudo cargar el documento del proyecto." }] };
      }
    },
  );

  server.registerTool(
    "index_project_repository",
    {
      title: "Index linked GitHub repository",
      description: "Indexes a bounded set of safe text files from the linked repository's default branch. Manager access is required. The result records the exact source commit SHA; this is on-demand and read-only on GitHub.",
      inputSchema: z.object({ projectId: z.string().uuid() }),
    },
    async ({ projectId }, context) => {
      try {
        const result = await indexProjectRepository(getMcpUserId(context), projectId);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo indexar el repositorio. Comprueba los permisos de lectura de Contents de la GitHub App e inténtalo de nuevo.") }] };
      }
    },
  );

  server.registerTool(
    "search_repository_files",
    {
      title: "Search indexed repository files",
      description: "Searches text files indexed from the linked repository's latest on-demand sync. Results include path, excerpt, and source commit SHA. Call index_project_repository first if no index exists.",
      inputSchema: z.object({ projectId: z.string().uuid(), query: z.string().trim().min(2).max(200), limit: z.number().int().min(1).max(20).optional() }),
    },
    async ({ projectId, query, limit }, context) => {
      try {
        const result = await searchIndexedRepositoryFiles(getMcpUserId(context), projectId, query, limit);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch {
        return { isError: true, content: [{ type: "text", text: "No se pudo buscar en los archivos indexados del repositorio." }] };
      }
    },
  );

  server.registerTool(
    "fetch_repository_file",
    {
      title: "Fetch indexed repository file",
      description: "Reads one file from the current repository index, including its source commit SHA. Only paths present in the linked project's active index can be fetched.",
      inputSchema: z.object({ projectId: z.string().uuid(), path: z.string().min(1).max(1024) }),
    },
    async ({ projectId, path }, context) => {
      try {
        const file = await fetchIndexedRepositoryFile(getMcpUserId(context), projectId, path);
        if (!file) return { isError: true, content: [{ type: "text", text: "No se encontró ese archivo en el índice actual del repositorio accesible." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(file) }] };
      } catch {
        return { isError: true, content: [{ type: "text", text: "No se pudo cargar el archivo indexado." }] };
      }
    },
  );

  server.registerTool(
    "get_github_repository",
    {
      title: "Get linked GitHub repository",
      description: "Reads the linked repository summary, branches, and recent commits. Requires access to the Armario Dev project.",
      inputSchema: z.object({ projectId: z.string().uuid() }),
    },
    async ({ projectId }, context) => {
      try {
        const result = await getMcpRepositorySnapshot(getMcpUserId(context), projectId);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo cargar el repositorio de GitHub.") }] }; }
    },
  );

  server.registerTool(
    "list_github_issues",
    {
      title: "List GitHub issues",
      description: "Lists up to 100 issues from the linked repository, excluding pull requests. Requires access to the Armario Dev project.",
      inputSchema: z.object({ projectId: z.string().uuid(), state: z.enum(["open", "closed", "all"]).optional() }),
    },
    async ({ projectId, state }, context) => {
      try {
        const result = await listMcpGitHubIssues(getMcpUserId(context), projectId, state);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudieron cargar los issues de GitHub.") }] }; }
    },
  );

  server.registerTool(
    "list_github_pull_requests",
    {
      title: "List GitHub pull requests",
      description: "Lists pull requests and repository branches. Requires access to the Armario Dev project.",
      inputSchema: z.object({ projectId: z.string().uuid() }),
    },
    async ({ projectId }, context) => {
      try {
        const result = await listMcpGitHubPullRequests(getMcpUserId(context), projectId);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudieron cargar los pull requests.") }] }; }
    },
  );

  server.registerTool(
    "get_github_commit",
    {
      title: "Get GitHub commit details",
      description: "Reads one commit, including changed files and statistics, from the linked repository.",
      inputSchema: z.object({ projectId: z.string().uuid(), sha: z.string().regex(/^[a-f0-9]{7,40}$/i) }),
    },
    async ({ projectId, sha }, context) => {
      try {
        const result = await getMcpGitHubCommit(getMcpUserId(context), projectId, sha);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo cargar el commit.") }] }; }
    },
  );

  server.registerTool(
    "get_github_pull_request",
    {
      title: "Get GitHub pull request details",
      description: "Reads a pull request with commits, changed files, and reviews from the linked repository.",
      inputSchema: z.object({ projectId: z.string().uuid(), number: z.number().int().positive() }),
    },
    async ({ projectId, number }, context) => {
      try {
        const result = await getMcpGitHubPullRequest(getMcpUserId(context), projectId, number);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo cargar el pull request.") }] }; }
    },
  );

  server.registerTool(
    "create_github_branch",
    {
      title: "Create GitHub branch",
      description: "Creates a GitHub branch. This writes to GitHub and requires Armario Dev manager access plus the installation's Contents: write permission. The branch defaults from the linked repository's default branch.",
      inputSchema: z.object({ projectId: z.string().uuid(), branch: z.string().min(1).max(255), baseBranch: z.string().min(1).max(255).optional() }),
    },
    async ({ projectId, branch, baseBranch }, context) => {
      try {
        const result = await createMcpGitHubBranch(getMcpUserId(context), projectId, branch, baseBranch);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo crear la rama. Comprueba tu rol, Contents: write y que el nombre/base sean válidos.") }] }; }
    },
  );

  server.registerTool(
    "commit_github_files",
    {
      title: "Commit files to GitHub",
      description: "Creates a commit on an existing branch (up to 20 text files, 100 KB each). This writes to GitHub and requires manager access plus Contents: write. expectedHeadSha prevents overwriting a branch that moved; it does not push to the default branch unless that branch is explicitly requested.",
      inputSchema: z.object({
        projectId: z.string().uuid(), branch: z.string().min(1).max(255), expectedHeadSha: z.string().regex(/^[a-f0-9]{40}$/i),
        message: z.string().trim().min(1).max(200),
        files: z.array(z.object({ path: z.string().min(1).max(500), content: z.string().max(100_000) })).min(1).max(20),
      }),
    },
    async ({ projectId, ...input }, context) => {
      try {
        const result = await commitMcpGitHubFiles(getMcpUserId(context), projectId, input);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo crear el commit. Comprueba permisos, rama, SHA y límites del contenido.") }] }; }
    },
  );

  server.registerTool(
    "create_github_issue",
    {
      title: "Create GitHub issue",
      description: "Creates an issue in the linked repository. This writes to GitHub and requires manager access plus Issues: write. Does not create pull requests.",
      inputSchema: z.object({ projectId: z.string().uuid(), title: z.string().trim().min(1).max(256), body: z.string().max(65_536).default("") }),
    },
    async ({ projectId, title, body }, context) => {
      try {
        const result = await createMcpGitHubIssue(getMcpUserId(context), projectId, title, body);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo crear el issue. Comprueba el rol y Issues: write.") }] }; }
    },
  );

  server.registerTool(
    "update_github_issue",
    {
      title: "Update or close GitHub issue",
      description: "Edits, closes, or reopens an issue. Closing requires a reason (completed or not_planned); reopening uses reason reopened. This writes to GitHub and requires manager access plus Issues: write.",
      inputSchema: z.object({
        projectId: z.string().uuid(), number: z.number().int().positive(), title: z.string().trim().min(1).max(256).optional(),
        body: z.string().max(65_536).optional(), state: z.enum(["open", "closed"]).optional(),
        stateReason: z.enum(["completed", "not_planned", "reopened"]).optional(),
      }).refine((value) => value.title !== undefined || value.body !== undefined || value.state !== undefined, "Provide an issue change"),
    },
    async ({ projectId, ...input }, context) => {
      try {
        if (input.state === "closed" && !["completed", "not_planned"].includes(input.stateReason ?? ""))
          return { isError: true, content: [{ type: "text", text: "Al cerrar el issue especifica stateReason: completed o not_planned." }] };
        if (input.state === "open" && input.stateReason !== undefined && input.stateReason !== "reopened")
          return { isError: true, content: [{ type: "text", text: "Al reabrir el issue, stateReason debe ser reopened." }] };
        const result = await updateMcpGitHubIssue(getMcpUserId(context), projectId, input);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo actualizar el issue. Comprueba el rol y Issues: write.") }] }; }
    },
  );

  server.registerTool(
    "create_github_pull_request",
    {
      title: "Create GitHub pull request",
      description: "Opens a pull request from an existing head branch to a base branch. This writes to GitHub and requires manager access plus Pull requests: write. It does not merge the PR.",
      inputSchema: z.object({ projectId: z.string().uuid(), title: z.string().trim().min(1).max(256), body: z.string().max(65_536).default(""), head: z.string().min(1).max(255), base: z.string().min(1).max(255).optional(), draft: z.boolean().optional() }),
    },
    async ({ projectId, ...input }, context) => {
      try {
        const result = await createMcpGitHubPullRequest(getMcpUserId(context), projectId, input);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo crear el pull request. Comprueba el rol, Pull requests: write y las ramas.") }] }; }
    },
  );

  server.registerTool(
    "update_github_pull_request",
    {
      title: "Update or close GitHub pull request",
      description: "Edits, changes base, reopens, or closes a pull request without merging it. This writes to GitHub and requires manager access plus Pull requests: write.",
      inputSchema: z.object({ projectId: z.string().uuid(), number: z.number().int().positive(), title: z.string().trim().min(1).max(256).optional(), body: z.string().max(65_536).optional(), state: z.enum(["open", "closed"]).optional(), base: z.string().min(1).max(255).optional() })
        .refine((value) => value.title !== undefined || value.body !== undefined || value.state !== undefined || value.base !== undefined, "Provide a pull request change"),
    },
    async ({ projectId, ...input }, context) => {
      try {
        const result = await updateMcpGitHubPullRequest(getMcpUserId(context), projectId, input);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo actualizar el pull request. Comprueba el rol y Pull requests: write.") }] }; }
    },
  );

  server.registerTool(
    "review_github_pull_request",
    {
      title: "Review GitHub pull request",
      description: "Submits an approval, change request, or comment review. This writes to GitHub and requires manager access plus Pull requests: write.",
      inputSchema: z.object({ projectId: z.string().uuid(), number: z.number().int().positive(), event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]), body: z.string().max(65_536).default("") }),
    },
    async ({ projectId, ...input }, context) => {
      try {
        const result = await reviewMcpGitHubPullRequest(getMcpUserId(context), projectId, input);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo enviar la revisión. Comprueba el rol y Pull requests: write.") }] }; }
    },
  );

  server.registerTool(
    "merge_github_pull_request",
    {
      title: "Merge GitHub pull request",
      description: "Merges a pull request using merge, squash, or rebase. This is irreversible on GitHub and requires manager access plus Pull requests: write. Requires the exact current expectedHeadSha; never call unless the user explicitly asked to merge this PR.",
      inputSchema: z.object({ projectId: z.string().uuid(), number: z.number().int().positive(), expectedHeadSha: z.string().regex(/^[a-f0-9]{40}$/i), method: z.enum(["merge", "squash", "rebase"]), commitTitle: z.string().max(256).default(""), commitMessage: z.string().max(65_536).default("") }),
    },
    async ({ projectId, ...input }, context) => {
      try {
        const result = await mergeMcpGitHubPullRequest(getMcpUserId(context), projectId, input);
        if (!result) return { isError: true, content: [{ type: "text", text: "No tienes acceso al repositorio vinculado o el proyecto no tiene uno." }] };
        return { content: [{ type: "text", text: serializeMcpOutput(result) }] };
      } catch (error) { return { isError: true, content: [{ type: "text", text: formatMcpGitHubError(error, "No se pudo fusionar el pull request. Comprueba el rol, permiso, estado y SHA actual.") }] }; }
    },
  );

  const writeFailure = (message: string) => ({ isError: true as const, content: [{ type: "text" as const, text: message }] });
  const writeSuccess = (value: unknown) => ({ content: [{ type: "text" as const, text: serializeMcpOutput(value) }] });

  server.registerTool("create_idea", {
    title: "Create Armario Dev idea",
    description: "Creates an idea in a workspace. This changes Armario Dev data and requires an explicit user request plus owner, admin, or editor role.",
    inputSchema: z.object({ workspaceId: z.string().uuid(), title: z.string().trim().min(1).max(160), description: z.string().max(10_000).default(""), kind: z.enum(["web", "mobile", "frontend", "backend", "mixed", "other", "undecided"]).default("undecided"), tags: z.array(z.string().max(30)).max(12).default([]) }),
  }, async (input, context) => {
    try { return writeSuccess(await createMcpIdea(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo crear la idea. Verifica el espacio, los datos y que tengas rol de propietario, administrador o editor."); }
  });

  server.registerTool("update_idea", {
    title: "Update Armario Dev idea",
    description: "Updates an active idea. This changes Armario Dev data and requires an explicit user request plus owner, admin, or editor role.",
    inputSchema: z.object({ workspaceId: z.string().uuid(), ideaId: z.string().uuid(), title: z.string().trim().min(1).max(160), description: z.string().max(10_000), kind: z.enum(["web", "mobile", "frontend", "backend", "mixed", "other", "undecided"]), tags: z.array(z.string().max(30)).max(12) }),
  }, async (input, context) => {
    try { return writeSuccess(await updateMcpIdea(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo actualizar la idea. Comprueba que siga activa y que tengas permisos de edición."); }
  });

  server.registerTool("set_idea_status", {
    title: "Archive or restore Armario Dev idea",
    description: "Archives or restores an idea (converted ideas cannot be changed). This changes Armario Dev data and requires explicit user request and owner/admin/editor role.",
    inputSchema: z.object({ workspaceId: z.string().uuid(), ideaId: z.string().uuid(), status: z.enum(["active", "archived"]) }),
  }, async (input, context) => {
    try { return writeSuccess(await setMcpIdeaStatus(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo cambiar el estado de la idea. Comprueba permisos y que no esté convertida en proyecto."); }
  });

  server.registerTool("create_task", {
    title: "Create Armario Dev task",
    description: "Creates a project task and its checklist atomically. This changes Armario Dev data and requires explicit user request and manager/editor project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), title: z.string().trim().min(1).max(160), description: z.string().max(10_000).default(""), status: z.enum(["todo", "in_progress", "done"]).default("todo"), priority: z.enum(["low", "medium", "high"]).default("medium"), assigneeId: z.string().nullable().optional(), startDate: z.string().nullable().optional(), dueDate: z.string().nullable().optional(), checklist: z.array(z.string().max(300)).max(30).default([]) }),
  }, async (input, context) => {
    try { return writeSuccess(await createMcpTask(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo crear la tarea. Verifica fechas, responsable (miembro del espacio) y permisos de edición del proyecto."); }
  });

  server.registerTool("update_task", {
    title: "Update Armario Dev task details",
    description: "Updates task details (title, description, priority, assignee, dates). This changes Armario Dev data and requires explicit user request and manager/editor project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), taskId: z.string().uuid(), title: z.string().trim().min(1).max(160).optional(), description: z.string().max(10_000).optional(), priority: z.enum(["low", "medium", "high"]).optional(), assigneeId: z.string().uuid().nullable().optional(), startDate: z.string().nullable().optional(), dueDate: z.string().nullable().optional() }).refine((value) => Object.keys(value).some((key) => !["projectId", "taskId"].includes(key)), "Provide task changes"),
  }, async ({ projectId, taskId, ...changes }, context) => {
    try { return writeSuccess(await updateMcpTask(getMcpUserId(context), getMcpAccessToken(context), { projectId, taskId, ...changes })); }
    catch { return writeFailure("No se pudo actualizar la tarea. Verifica los datos, el responsable y los permisos de edición."); }
  });

  server.registerTool("update_task_status", {
    title: "Change Armario Dev task status",
    description: "Changes a task status. Managers/editors can change project tasks; contributors can change only tasks assigned to them. Requires an explicit user request.",
    inputSchema: z.object({ projectId: z.string().uuid(), taskId: z.string().uuid(), status: z.enum(["todo", "in_progress", "done", "archived"]) }),
  }, async (input, context) => {
    try { return writeSuccess(await updateMcpTaskStatus(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo cambiar el estado. Comprueba la tarea, tu asignación y los permisos del proyecto."); }
  });

  server.registerTool("create_requirement", {
    title: "Create Armario Dev requirement",
    description: "Creates a requirement in a project. This changes Armario Dev data and requires an explicit user request plus manager/editor project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), title: z.string().trim().min(1).max(160), description: z.string().max(10_000).default(""), acceptanceCriteria: z.string().max(10_000).default(""), kind: z.enum(["functional", "nonfunctional"]).default("functional"), priority: z.enum(["must", "should", "could"]).default("must") }),
  }, async (input, context) => {
    try { return writeSuccess(await createMcpRequirement(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo crear el requisito. Comprueba los datos y que tengas permisos de edición del proyecto."); }
  });

  server.registerTool("update_requirement", {
    title: "Update Armario Dev requirement",
    description: "Updates or archives a project requirement. This changes Armario Dev data and requires an explicit user request plus manager/editor project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), requirementId: z.string().uuid(), title: z.string().trim().min(1).max(160).optional(), description: z.string().max(10_000).optional(), acceptanceCriteria: z.string().max(10_000).optional(), kind: z.enum(["functional", "nonfunctional"]).optional(), priority: z.enum(["must", "should", "could"]).optional(), status: z.enum(["active", "archived"]).optional() }).refine((value) => Object.keys(value).some((key) => !["projectId", "requirementId"].includes(key)), "Provide requirement changes"),
  }, async ({ projectId, requirementId, ...changes }, context) => {
    try { return writeSuccess(await updateMcpRequirement(getMcpUserId(context), getMcpAccessToken(context), { projectId, requirementId, ...changes })); }
    catch { return writeFailure("No se pudo actualizar el requisito. Comprueba los datos y permisos del proyecto."); }
  });

  server.registerTool("create_adr", {
    title: "Create Armario Dev architecture decision",
    description: "Creates an architecture decision record (ADR). This changes Armario Dev data and requires an explicit user request plus manager/editor project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), title: z.string().trim().min(1).max(160), context: z.string().max(10_000).default(""), decision: z.string().max(10_000).default(""), consequences: z.string().max(10_000).default(""), status: z.enum(["proposed", "accepted", "rejected", "superseded"]).default("proposed"), decidedAt: z.string().optional() }),
  }, async (input, context) => {
    try { return writeSuccess(await createMcpDecision(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo crear el ADR. Comprueba la fecha, los datos y los permisos de edición del proyecto."); }
  });

  server.registerTool("update_adr", {
    title: "Update Armario Dev architecture decision",
    description: "Updates an architecture decision record (ADR). This changes Armario Dev data and requires an explicit user request plus manager/editor project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), decisionId: z.string().uuid(), title: z.string().trim().min(1).max(160).optional(), context: z.string().max(10_000).optional(), decision: z.string().max(10_000).optional(), consequences: z.string().max(10_000).optional(), status: z.enum(["proposed", "accepted", "rejected", "superseded"]).optional(), decidedAt: z.string().optional() }).refine((value) => Object.keys(value).some((key) => !["projectId", "decisionId"].includes(key)), "Provide ADR changes"),
  }, async ({ projectId, decisionId, ...changes }, context) => {
    try { return writeSuccess(await updateMcpDecision(getMcpUserId(context), getMcpAccessToken(context), { projectId, decisionId, ...changes })); }
    catch { return writeFailure("No se pudo actualizar el ADR. Comprueba la fecha, los datos y permisos del proyecto."); }
  });

  const modulesSchema = z.object({ frontend: z.boolean().optional(), backend: z.boolean().optional(), database: z.boolean().optional(), auth: z.boolean().optional() }).optional();
  server.registerTool("create_project", {
    title: "Create Armario Dev project",
    description: "Creates a project directly in a workspace without an idea. This changes Armario Dev and requires explicit user request plus owner/admin/editor workspace access.",
    inputSchema: z.object({ workspaceId: z.string().uuid(), title: z.string().trim().min(1).max(160), objective: z.string().max(10_000).default(""), kind: z.enum(["web", "mobile", "frontend", "backend", "mixed", "other"]), stage: z.enum(["definition", "planning", "development", "published", "archived"]).default("definition"), modules: modulesSchema }),
  }, async (input, context) => {
    try { return writeSuccess(await createMcpProject(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo crear el proyecto. Comprueba el espacio, los datos y tu permiso de edición."); }
  });

  server.registerTool("convert_idea_to_project", {
    title: "Convert Armario Dev idea to project",
    description: "Creates a project from an active idea, preserving its link and snapshot. This changes Armario Dev and requires explicit user request plus owner/admin/editor workspace access.",
    inputSchema: z.object({ ideaId: z.string().uuid(), kind: z.enum(["web", "mobile", "frontend", "backend", "mixed", "other"]), objective: z.string().max(10_000).default(""), modules: modulesSchema }),
  }, async (input, context) => {
    try { return writeSuccess(await convertMcpIdeaToProject(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo convertir la idea. Comprueba que esté activa y que tengas permisos en su espacio."); }
  });

  server.registerTool("update_project", {
    title: "Update Armario Dev project",
    description: "Updates project title, objective, type, stage, and selected modules. Does not change project visibility or access controls. Requires explicit user request and manager/editor project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), title: z.string().trim().min(1).max(160).optional(), objective: z.string().max(10_000).optional(), kind: z.enum(["web", "mobile", "frontend", "backend", "mixed", "other"]).optional(), stage: z.enum(["definition", "planning", "development", "published", "archived"]).optional(), modules: modulesSchema }).refine((value) => Object.keys(value).some((key) => key !== "projectId"), "Provide project changes"),
  }, async ({ projectId, ...changes }, context) => {
    try { return writeSuccess(await updateMcpProject(getMcpUserId(context), getMcpAccessToken(context), { projectId, ...changes })); }
    catch { return writeFailure("No se pudo actualizar el proyecto. Comprueba sus datos y permisos de edición."); }
  });

  server.registerTool("move_project_item", {
    title: "Reorder task or requirement",
    description: "Moves a task or requirement one position up/down in its project. Requires explicit user request and manager/editor project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), entity: z.enum(["task", "requirement"]), entityId: z.string().uuid(), direction: z.enum(["up", "down"]) }),
  }, async (input, context) => {
    try { return writeSuccess(await moveMcpProjectItem(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo reordenar el elemento. Comprueba el proyecto y los permisos."); }
  });

  server.registerTool("set_requirement_status", {
    title: "Archive or restore requirement",
    description: "Archives or restores a requirement in Armario Dev. Requires explicit user request and manager/editor project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), requirementId: z.string().uuid(), status: z.enum(["active", "archived"]) }),
  }, async (input, context) => {
    try { return writeSuccess(await setMcpRequirementStatus(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo cambiar el estado del requisito. Comprueba permisos y datos."); }
  });

  server.registerTool("add_task_checklist_item", {
    title: "Add task checklist item",
    description: "Adds a checklist step to a task. Manager/editor access is required; contributors may add steps only to tasks assigned to them.",
    inputSchema: z.object({ projectId: z.string().uuid(), taskId: z.string().uuid(), content: z.string().trim().min(1).max(300) }),
  }, async (input, context) => {
    try { return writeSuccess(await addMcpChecklistItem(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo añadir el paso. Comprueba la tarea, el contenido y que puedas trabajar en ella."); }
  });

  server.registerTool("set_task_checklist_item", {
    title: "Mark task checklist item",
    description: "Marks or unmarks a checklist step. Manager/editor access is required; contributors may update steps only on tasks assigned to them.",
    inputSchema: z.object({ projectId: z.string().uuid(), taskId: z.string().uuid(), itemId: z.string().uuid(), completed: z.boolean() }),
  }, async (input, context) => {
    try { return writeSuccess(await toggleMcpChecklistItem(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo actualizar el paso. Comprueba la tarea y tus permisos."); }
  });

  server.registerTool("link_task_requirement", {
    title: "Link task to requirement",
    description: "Adds or removes a task-requirement traceability link. Requires explicit user request and manager/editor project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), taskId: z.string().uuid(), requirementId: z.string().uuid(), linked: z.boolean() }),
  }, async (input, context) => {
    try { return writeSuccess(await linkMcpTaskRequirement(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo actualizar el vínculo. Comprueba que ambos elementos sean del mismo proyecto."); }
  });

  server.registerTool("add_project_comment", {
    title: "Comment on task or requirement",
    description: "Adds a comment to a task or requirement. Requires explicit user request and manager/editor/contributor project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), targetType: z.enum(["task", "requirement"]), targetId: z.string().uuid(), content: z.string().trim().min(1).max(5000) }),
  }, async (input, context) => {
    try { return writeSuccess(await addMcpComment(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo guardar el comentario. Comprueba el elemento y los permisos del proyecto."); }
  });

  server.registerTool("list_project_comments", {
    title: "List project comments",
    description: "Reads recent project comments, optionally filtered to a task or requirement. Requires project access.",
    inputSchema: z.object({ projectId: z.string().uuid(), targetType: z.enum(["task", "requirement"]).optional(), targetId: z.string().uuid().optional(), limit: z.number().int().min(1).max(100).optional() }).refine((value) => (value.targetType === undefined) === (value.targetId === undefined), "targetType and targetId must be provided together"),
  }, async (input, context) => {
    try { return writeSuccess(await listMcpComments(getMcpUserId(context), input)); }
    catch { return writeFailure("No se pudieron cargar los comentarios del proyecto."); }
  });

  server.registerTool("save_project_technology", {
    title: "Add or update project technology",
    description: "Adds or updates a technology from Armario Dev's technology catalog. Use status rejected to mark it as discarded. Requires explicit user request and manager/editor access.",
    inputSchema: z.object({ projectId: z.string().uuid(), technologyId: z.string().uuid().optional(), technologyKey: z.string().min(1).max(80), status: z.enum(["candidate", "selected", "rejected"]), version: z.string().max(80).default(""), rationale: z.string().max(5000).default("") }),
  }, async (input, context) => {
    try { return writeSuccess(await saveMcpTechnology(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo guardar la tecnología. Comprueba technologyKey en el catálogo, que no esté duplicada y tus permisos."); }
  });

  server.registerTool("save_project_diagram", {
    title: "Create or update project diagram",
    description: "Creates or versions a Mermaid project diagram. Updates preserve version history. Requires explicit user request and manager/editor access.",
    inputSchema: z.object({ projectId: z.string().uuid(), diagramId: z.string().uuid().optional(), title: z.string().trim().min(1).max(160), kind: z.enum(["flow", "context", "container", "data_model"]), source: z.string().min(1).max(50_000), status: z.enum(["active", "archived"]).default("active"), changeSummary: z.string().max(500).default("") }),
  }, async (input, context) => {
    try { return writeSuccess(await saveMcpDiagram(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo guardar el diagrama. Comprueba la sintaxis/contenido y permisos del proyecto."); }
  });

  server.registerTool("restore_project_diagram_version", {
    title: "Restore project diagram version",
    description: "Restores a specific diagram version while preserving a new history entry. This changes the current diagram and requires explicit user request and manager/editor access.",
    inputSchema: z.object({ projectId: z.string().uuid(), diagramId: z.string().uuid(), versionId: z.string().uuid() }),
  }, async (input, context) => {
    try { return writeSuccess(await restoreMcpDiagramVersion(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo restaurar la versión. Comprueba que pertenezca a ese diagrama y los permisos."); }
  });

  server.registerTool("link_diagram_traceability", {
    title: "Link diagram to requirement or ADR",
    description: "Adds or removes a diagram traceability link to a requirement or ADR in the same project. Requires explicit user request and manager/editor access.",
    inputSchema: z.object({ projectId: z.string().uuid(), diagramId: z.string().uuid(), targetType: z.enum(["requirement", "decision"]), targetId: z.string().uuid(), linked: z.boolean() }),
  }, async (input, context) => {
    try { return writeSuccess(await linkMcpDiagram(getMcpUserId(context), getMcpAccessToken(context), input)); }
    catch { return writeFailure("No se pudo actualizar la trazabilidad. Comprueba que los elementos pertenezcan al mismo proyecto."); }
  });

  server.registerTool("delete_github_branch", {
    title: "Delete GitHub branch",
    description: "Deletes a branch from the linked GitHub repository; the default branch is protected. This is a destructive remote change. Call only after the user explicitly asks to delete that exact branch. Requires project manager access and Contents: write.",
    inputSchema: z.object({ projectId: z.string().uuid(), branch: z.string().min(1).max(255) }),
  }, async ({ projectId, branch }, context) => {
    try {
      const result = await deleteMcpGitHubBranch(getMcpUserId(context), projectId, branch);
      if (!result) return writeFailure("El proyecto no tiene un repositorio GitHub accesible vinculado.");
      return writeSuccess(result);
    } catch (error) { return writeFailure(formatMcpGitHubError(error, "No se pudo eliminar la rama. Comprueba rol, permisos y que no sea la rama principal.")); }
  });

  server.registerTool("save_github_automation_settings", {
    title: "Configure project GitHub automations",
    description: "Enables/disables the project's GitHub issue, branch, PR, synchronization, publication and notification automations. Changes project settings; requires an explicit user request and manager access.",
    inputSchema: z.object({
      projectId: z.string().uuid(), taskIssueEnabled: z.boolean(), taskBranchEnabled: z.boolean(),
      taskPrEnabled: z.boolean(), prMergeCompletesTask: z.boolean(), issueStateSync: z.boolean(),
      documentPublishEnabled: z.boolean(), notificationsEnabled: z.boolean(), branchPrefix: z.string().min(1).max(40),
    }),
  }, async ({ projectId, ...input }, context) => {
    try {
      const result = await saveMcpGitHubAutomationSettings(getMcpUserId(context), projectId, input);
      if (!result) return writeFailure("El proyecto no tiene un repositorio GitHub accesible vinculado.");
      return writeSuccess(result);
    } catch (error) { return writeFailure(formatMcpGitHubError(error, "No se pudieron guardar las automatizaciones. Comprueba rol y prefijo de rama.")); }
  });

  server.registerTool("synchronize_github_tasks", {
    title: "Run GitHub task synchronization",
    description: "Runs the configured GitHub automations for up to 100 active project tasks. This may create/update remote issues or branches. Requires explicit user request and project manager access.",
    inputSchema: z.object({ projectId: z.string().uuid() }),
  }, async ({ projectId }, context) => {
    try {
      const result = await synchronizeMcpGitHubTasks(getMcpUserId(context), projectId);
      if (!result) return writeFailure("El proyecto no tiene un repositorio GitHub accesible vinculado.");
      return writeSuccess(result);
    } catch (error) { return writeFailure(formatMcpGitHubError(error, "No se pudo sincronizar las tareas con GitHub.")); }
  });

  server.registerTool("create_task_github_pull_request", {
    title: "Create task GitHub pull request",
    description: "Creates and links a PR using a synchronized task branch; the project's task-PR automation must be enabled. This writes to GitHub and project sync history. Requires explicit user request, manager access and Pull requests: write.",
    inputSchema: z.object({ projectId: z.string().uuid(), taskId: z.string().uuid(), draft: z.boolean().default(false) }),
  }, async ({ projectId, taskId, draft }, context) => {
    try {
      const result = await createMcpTaskGitHubPullRequest(getMcpUserId(context), projectId, taskId, draft);
      if (!result) return writeFailure("El proyecto no tiene un repositorio GitHub accesible vinculado.");
      return writeSuccess(result);
    } catch (error) { return writeFailure(formatMcpGitHubError(error, "No se pudo crear el PR de la tarea. Comprueba la automatización, la rama y permisos.")); }
  });
}, {
  serverInfo: { name: "armario-dev", version: "0.1.0" },
  instructions: "Armario Dev project workspace. Data is scoped to the authenticated user's workspace and project permissions. Use search_project to discover structured knowledge, then fetch_document for full details. For repository source, call index_project_repository on demand, then search_repository_files and fetch_repository_file; responses identify the indexed commit SHA. Native write tools create/update/archive ideas, tasks, requirements and ADRs in Armario Dev; they require an explicit user request and respect workspace/project roles. GitHub tools can read the linked repository. Tools named create_github_branch, commit_github_files, create_github_issue, update_github_issue, create_github_pull_request, update_github_pull_request, review_github_pull_request, and merge_github_pull_request make remote GitHub changes; they require manager access and the matching GitHub App installation permission, and are recorded in the workspace sync history. Never merge unless the user explicitly requests that exact merge; commits require an expected head SHA.",
});

const authenticatedHandler = withMcpAuth(
  handler,
  async (_request, token) => {
    const clerkAuth = await auth({ acceptsToken: "oauth_token" });
    return verifyClerkToken(clerkAuth, token);
  },
  {
    required: true,
    resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
  },
);

export const runtime = "nodejs";
export { authenticatedHandler as GET, authenticatedHandler as POST };
