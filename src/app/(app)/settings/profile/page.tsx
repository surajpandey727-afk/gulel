import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/workspace";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await getSession();
  const supabase = await createClient();
  const { data: prefs } = await supabase
    .from("user_preferences")
    .select("display_name, avatar_url")
    .eq("user_id", session.userId)
    .maybeSingle();

  return (
    <ProfileForm
      initial={{
        display_name: (prefs as Record<string, unknown>)?.display_name as string ?? session.displayName,
        email: session.email,
        avatar_url: (prefs as Record<string, unknown>)?.avatar_url as string | null ?? null,
      }}
    />
  );
}
