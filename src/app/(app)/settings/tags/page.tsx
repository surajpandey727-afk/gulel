import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { listTags } from "@/lib/orgs/tags";
import { TagManager } from "./tag-manager";

export const metadata = { title: "Document tags" };

export default async function TagsPage() {
  const s = await getSession();
  const tags = await listTags(await createClient(), s.workspaceId);
  return <TagManager initial={tags} canWrite={s.role !== "viewer"} />;
}
