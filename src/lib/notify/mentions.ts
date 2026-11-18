import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { richToText } from "@/lib/notes/rich";

export interface Member { id: string; name: string; email: string | null }

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** User ids mentioned in a rich note body (<span data-mention="uuid">@Name</span>). */
export const mentionedIds = (body: string | null | undefined) => [...new Set([...String(body ?? "").matchAll(new RegExp(`data-mention="(${UUID})"`, "gi"))].map((m) => m[1].toLowerCase()))];

/** Everyone in the workspace, with a display name, for the @ picker. */
export async function workspaceMembers(workspaceId: string): Promise<Member[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).limit(200);
  const ids = [...new Set((data ?? []).map((m) => m.user_id as string))];
  const { data: prefs } = await admin.from("user_preferences").select("user_id, display_name").in("user_id", ids);
  const shown = new Map((prefs ?? []).map((p) => [p.user_id as string, p.display_name as string | null]));
  const out = await Promise.all(ids.map(async (id) => {
    const { data: u } = await admin.auth.admin.getUserById(id);
    const email = u?.user?.email ?? null;
    const name = shown.get(id) || (u?.user?.user_metadata?.full_name as string | undefined) || email?.split("@")[0] || "Team member";
    return { id, name, email };
  }));
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Tell newly mentioned teammates. Only ids that are workspace members and weren't already mentioned in `before` are
 * notified, and never the author.
 */
export async function notifyMentions(opts: { workspaceId: string; actorId: string | null; body: string; before?: string | null; where: string; link: string; noteId?: string | null }) {
  const now = mentionedIds(opts.body), was = new Set(mentionedIds(opts.before));
  const fresh = now.filter((id) => !was.has(id) && id !== opts.actorId);
  if (!fresh.length) return 0;
  const admin = createAdminClient();
  const { data: members } = await admin.from("workspace_members").select("user_id").eq("workspace_id", opts.workspaceId).in("user_id", fresh);
  const ok = (members ?? []).map((m) => m.user_id as string);
  if (!ok.length) return 0;
  let actor = "A teammate";
  if (opts.actorId) {
    const all = await workspaceMembers(opts.workspaceId);
    actor = all.find((m) => m.id === opts.actorId)?.name ?? actor;
  }
  const text = richToText(opts.body).replace(/\s+/g, " ").trim();
  await admin.from("notifications").insert(ok.map((user_id) => ({
    workspace_id: opts.workspaceId, user_id, kind: "mention", title: `${actor} mentioned you on ${opts.where}`,
    body: text.length > 240 ? `${text.slice(0, 240)}…` : text, link: opts.link, actor_id: opts.actorId, note_id: opts.noteId ?? null,
  })));
  return ok.length;
}
