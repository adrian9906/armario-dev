import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { auth } from "@clerk/nextjs/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { fetchUserProjectDocument, getMcpUserId, getUserProjectContext, listUserProjects, listUserWorkspaces, listWorkspaceIdeas, MCP_DOCUMENT_TYPES, searchUserProject } from "@/lib/mcp/server";
import { fetchIndexedRepositoryFile, indexProjectRepository, searchIndexedRepositoryFiles } from "@/lib/mcp/repository";
import {
  commitMcpGitHubFiles, createMcpGitHubBranch, createMcpGitHubIssue, createMcpGitHubPullRequest,
  getMcpGitHubCommit, getMcpGitHubPullRequest, getMcpRepositorySnapshot, listMcpGitHubIssues,
  listMcpGitHubPullRequests, mergeMcpGitHubPullRequest, reviewMcpGitHubPullRequest,
  updateMcpGitHubIssue, updateMcpGitHubPullRequest,
} from "@/lib/mcp/github";

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
        return { content: [{ type: "text", text: JSON.stringify(workspaces) }] };
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
        return { content: [{ type: "text", text: JSON.stringify(ideas) }] };
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
        return { content: [{ type: "text", text: JSON.stringify(projects) }] };
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
        return { content: [{ type: "text", text: JSON.stringify(project) }] };
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
        return { content: [{ type: "text", text: JSON.stringify(results) }] };
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
        return { content: [{ type: "text", text: JSON.stringify(document) }] };
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch {
        return { isError: true, content: [{ type: "text", text: "No se pudo indexar el repositorio. Comprueba los permisos de lectura de Contents de la GitHub App e inténtalo de nuevo." }] };
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
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
        return { content: [{ type: "text", text: JSON.stringify(file) }] };
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudo cargar el repositorio de GitHub." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudieron cargar los issues de GitHub." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudieron cargar los pull requests." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudo cargar el commit." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudo cargar el pull request." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudo crear la rama. Comprueba tu rol, el permiso Contents: write y que el nombre/base sean válidos." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudo crear el commit. Comprueba permisos, rama, SHA y límites del contenido." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudo crear el issue. Comprueba el rol y Issues: write." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudo actualizar el issue. Comprueba el rol y Issues: write." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudo crear el pull request. Comprueba el rol, Pull requests: write y las ramas." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudo actualizar el pull request. Comprueba el rol y Pull requests: write." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudo enviar la revisión. Comprueba el rol y Pull requests: write." }] }; }
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
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch { return { isError: true, content: [{ type: "text", text: "No se pudo fusionar el pull request. Comprueba el rol, permiso, estado y SHA actual." }] }; }
    },
  );
}, {
  serverInfo: { name: "armario-dev", version: "0.1.0" },
  instructions: "Armario Dev project workspace. Data is scoped to the authenticated user's workspace and project permissions. Use search_project to discover structured knowledge, then fetch_document for full details. For repository source, call index_project_repository on demand, then search_repository_files and fetch_repository_file; responses identify the indexed commit SHA. GitHub tools can read the linked repository. Tools named create_github_branch, commit_github_files, create_github_issue, update_github_issue, create_github_pull_request, update_github_pull_request, review_github_pull_request, and merge_github_pull_request make remote GitHub changes; they require manager access and the matching GitHub App installation permission, and are recorded in the workspace sync history. Never merge unless the user explicitly requests that exact merge; commits require an expected head SHA.",
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
