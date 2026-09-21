import { notFound } from "next/navigation";
import { WorkspaceAppShell } from "@/components/workspace-app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function IdeaLayout({ children, params }: LayoutProps<"/ideas/[id]">) {
  const { id } = await params;
  const { data: idea } = await createClient().from("ideas").select("workspace_id,title").eq("id", id).maybeSingle();
  if (!idea) notFound();

  return (
    <WorkspaceAppShell workspaceId={idea.workspace_id} activeSection="ideas" headerLabel={idea.title}>
      {children}
    </WorkspaceAppShell>
  );
}
