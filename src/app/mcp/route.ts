import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { auth } from "@clerk/nextjs/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { fetchUserProjectDocument, getMcpUserId, getUserProjectContext, listUserProjects, listUserWorkspaces, listWorkspaceIdeas, MCP_DOCUMENT_TYPES, searchUserProject } from "@/lib/mcp/server";
import { fetchIndexedRepositoryFile, indexProjectRepository, searchIndexedRepositoryFiles } from "@/lib/mcp/repository";

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
}, {
  serverInfo: { name: "armario-dev", version: "0.1.0" },
  instructions: "Armario Dev project workspace. All project and GitHub content tools are read-only; index_project_repository only writes or replaces the server-side search snapshot and never modifies GitHub. Data is scoped to the authenticated user's workspace and project permissions. Use search_project to discover structured knowledge, then fetch_document for full details. For repository source, call index_project_repository on demand, then search_repository_files and fetch_repository_file; responses identify the indexed commit SHA.",
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
