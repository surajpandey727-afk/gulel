"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

type R = { ok: true; message?: string } | { ok: false; error: string };

const ProfileSchema = z.object({
  display_name: z.string().trim().min(1, "Name is required").max(100),
  avatar_url: z.string().url().nullable().optional(),
});

export async function updateProfileAction(input: z.input<typeof ProfileSchema>): Promise<R> {
  const s = await getSession();
  const p = ProfileSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_preferences")
    .upsert(
      { user_id: s.userId, display_name: p.data.display_name, avatar_url: p.data.avatar_url ?? null },
      { onConflict: "user_id" },
    );
  if (error) return { ok: false, error: error.message };
  await supabase.from("audit_logs").insert({
    workspace_id: s.workspaceId, actor_type: "user", actor_id: s.userId,
    action: "profile.updated", metadata: { display_name: p.data.display_name },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile updated." };
}
