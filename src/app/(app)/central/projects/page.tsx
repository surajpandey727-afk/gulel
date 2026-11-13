import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { Panel, EmptyState } from "@/components/neo/surface";
import { FolderKanban } from "lucide-react";
import { ProjectsTable } from "./projects-table";

export const metadata = { title: "Projects" };

export default async function CentralProjectsPage() {
  const s = await getSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("projects")
    .select("id, name, scope, region, status, start_date, end_date, fee_amount, fee_currency, has_nda, has_testimonial, notes, owner_user_id, organisations(trading_name), opportunities(name)")
    .eq("workspace_id", s.workspaceId)
    .order("updated_at", { ascending: false });

  const projects = (data ?? [] as unknown) as Array<{
    id: string; name: string; scope: string | null; region: string | null;
    status: string; start_date: string | null; end_date: string | null;
    fee_amount: number | null; fee_currency: string | null;
    has_nda: boolean; has_testimonial: boolean; notes: string | null;
    owner_user_id: string | null;
    organisations: { trading_name: string } | null;
    opportunities: { name: string } | null;
  }>;

  if (projects.length === 0) {
    return (
      <Panel>
        <EmptyState
          title="No projects yet"
          body="Projects are created when opportunities are won, or imported from the Central Repository sheet."
          icon={<FolderKanban className="h-5 w-5" />}
        />
      </Panel>
    );
  }

  return <ProjectsTable projects={projects} />;
}
