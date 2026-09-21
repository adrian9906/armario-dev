import "server-only";

import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveProjectRole, type ProjectVisibility } from "@/lib/project-permissions";

export async function getProjectAccess(projectId: string, userId: string) {
  const db = createClient();
  const { data: project } = await db.from("projects").select("id,workspace_id,title,creator_id,visibility")
    .eq("id", projectId).maybeSingle();
  if (!project) return null;
  const [{ data: workspaceMembership }, { data: projectMembership }] = await Promise.all([
    db.from("workspace_memberships").select("role").eq("workspace_id", project.workspace_id).eq("user_id", userId).maybeSingle(),
    db.from("project_memberships").select("role").eq("project_id", projectId).eq("user_id", userId).maybeSingle(),
  ]);
  if (!workspaceMembership) return null;
  const role = resolveProjectRole({
    userId, creatorId: project.creator_id, visibility: project.visibility as ProjectVisibility,
    workspaceRole: workspaceMembership.role, explicitRole: projectMembership?.role,
  });
  if (!role) return null;
  return {
    db, project: { ...project, visibility: project.visibility as ProjectVisibility }, userId, role,
    workspaceRole: workspaceMembership.role,
    canManage: role === "manager",
    canEdit: role === "manager" || role === "editor",
    canComment: role !== "viewer",
  };
}

export async function requireProjectAccess(projectId: string) {
  const { userId } = await auth.protect();
  const access = await getProjectAccess(projectId, userId);
  if (!access) notFound();
  return access;
}

export async function requireEditableProject(projectId: string) {
  const access = await requireProjectAccess(projectId);
  if (!access.canEdit) notFound();
  return access;
}
