import "server-only";

import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireProjectAccess(projectId: string) {
  const { userId } = await auth.protect();
  const db = createClient();
  const { data: project } = await db.from("projects").select("id,workspace_id,title")
    .eq("id", projectId).maybeSingle();
  if (!project) notFound();
  const { data: membership } = await db.from("workspace_memberships").select("role")
    .eq("workspace_id", project.workspace_id).eq("user_id", userId).maybeSingle();
  if (!membership) notFound();
  return { db, project, userId, canEdit: ["owner", "admin", "editor"].includes(membership.role) };
}

export async function requireEditableProject(projectId: string) {
  const access = await requireProjectAccess(projectId);
  if (!access.canEdit) notFound();
  return access;
}
