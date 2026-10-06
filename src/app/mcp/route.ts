import { verifyClerkToken } from "@clerk/mcp-tools/next";
import { auth } from "@clerk/nextjs/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { getMcpUserId, getUserProjectContext, listUserProjects, listUserWorkspaces, listWorkspaceIdeas } from "@/lib/mcp/server";

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
}, {
  serverInfo: { name: "armario-dev", version: "0.1.0" },
  instructions: "Armario Dev project workspace. All exposed tools are read-only in this initial release. Data is scoped to the authenticated user's workspace and project permissions.",
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
