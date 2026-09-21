import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

type Section = "overview" | "ideas" | "projects" | "activity" | "notifications" | "team";

export async function WorkspaceAppShell({
  workspaceId,
  activeSection,
  headerLabel,
  project,
  children,
}: {
  workspaceId: string;
  activeSection: Section;
  headerLabel?: string;
  project?: { id: string; title: string; canEdit?: boolean; canManage?: boolean };
  children: React.ReactNode;
}) {
  const [{ userId }, user, cookieStore] = await Promise.all([auth.protect(), currentUser(), cookies()]);
  const db = createClient();
  const [spacesResponse, membershipsResponse, unreadResponse] = await Promise.all([
    db.from("workspaces").select("id,name,is_personal").order("created_at"),
    db.from("workspace_memberships").select("workspace_id,role").eq("user_id", userId),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("recipient_id", userId).is("read_at", null),
  ]);
  const spaces = spacesResponse.data ?? [];
  const activeSpace = spaces.find((space) => space.id === workspaceId);
  const membership = membershipsResponse.data?.find((item) => item.workspace_id === workspaceId);
  if (!activeSpace || !membership || spacesResponse.error || membershipsResponse.error) notFound();

  return (
    <AppShell
      spaces={spaces}
      activeSpace={activeSpace}
      activeSection={activeSection}
      role={membership.role}
      userName={user?.firstName || user?.fullName || "Creador"}
      project={project}
      headerLabel={headerLabel}
      defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}
      unreadNotifications={unreadResponse.count ?? 0}
    >
      {children}
    </AppShell>
  );
}
