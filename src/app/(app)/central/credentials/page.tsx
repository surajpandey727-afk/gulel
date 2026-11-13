import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { Panel, EmptyState } from "@/components/neo/surface";
import { Award } from "lucide-react";
import { CredentialsTable } from "./credentials-table";

export const metadata = { title: "Credentials" };

export default async function CentralCredentialsPage() {
  const s = await getSession();
  const supabase = await createClient();

  const { data } = await supabase
    .from("credentials")
    .select("id, name, type, sector, status, permission_notes, projects(name), organisations(trading_name)")
    .eq("workspace_id", s.workspaceId)
    .order("created_at", { ascending: false });

  const credentials = (data ?? [] as unknown) as Array<{
    id: string; name: string; type: string; sector: string | null;
    status: string; permission_notes: string | null;
    projects: { name: string } | null;
    organisations: { trading_name: string } | null;
  }>;

  if (credentials.length === 0) {
    return (
      <Panel>
        <EmptyState
          title="No credentials yet"
          body="Track case studies, testimonials and other proof points. Import from the Central Repository sheet or add manually."
          icon={<Award className="h-5 w-5" />}
        />
      </Panel>
    );
  }

  return <CredentialsTable credentials={credentials} />;
}
