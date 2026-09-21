export type ProjectRole = "manager" | "editor" | "contributor" | "viewer";
export type ProjectVisibility = "workspace" | "private" | "restricted";

export function resolveProjectRole(input: {
  userId: string;
  creatorId: string;
  visibility: ProjectVisibility;
  workspaceRole: string;
  explicitRole?: string | null;
}): ProjectRole | null {
  if (input.creatorId === input.userId || ["owner", "admin"].includes(input.workspaceRole)) return "manager";
  if (input.visibility === "workspace") return input.workspaceRole === "editor" ? "editor" : "viewer";
  if (input.visibility === "restricted" && ["manager", "editor", "contributor", "viewer"].includes(input.explicitRole ?? ""))
    return input.explicitRole as ProjectRole;
  return null;
}

export function canAssignProjectMember(
  project: { creator_id: string; visibility: ProjectVisibility },
  member: { user_id: string; role: string },
  explicitMemberIds: Set<string>,
) {
  return project.visibility === "workspace" || project.creator_id === member.user_id
    || ["owner", "admin"].includes(member.role)
    || (project.visibility === "restricted" && explicitMemberIds.has(member.user_id));
}
