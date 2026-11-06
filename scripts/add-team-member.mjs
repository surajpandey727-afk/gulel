import { createClient } from "@supabase/supabase-js";

const PROD_URL = process.env.SUPABASE_URL || "https://pseaaaltdzbzlpdlsjkv.supabase.co";
const PROD_SECRET = process.env.SUPABASE_SECRET_KEY;
if (!PROD_SECRET) { console.error("Set SUPABASE_SECRET_KEY env var"); process.exit(1); }
const WORKSPACE_ID = process.env.WORKSPACE_ID || "b58af37c-09bb-4292-88dd-d95266ed1f93";

const supabase = createClient(PROD_URL, PROD_SECRET, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = process.argv[2] || "nihal.kashyap@nishaan-a.com";
const PASSWORD = process.argv[3] || "Admin@123";
const DISPLAY = process.argv[4] || EMAIL.split("@")[0].split(".").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
const ROLE = process.argv[5] || "analyst";

async function main() {
  console.log(`Creating user ${EMAIL}...`);
  const { data: userData, error: createErr } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  let userId;
  if (createErr) {
    if (createErr.message?.includes("already been registered")) {
      console.log("User already exists, looking up...");
      const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
      if (listErr) throw listErr;
      const existing = users.find(u => u.email === EMAIL);
      if (!existing) throw new Error("User not found");
      userId = existing.id;
      console.log(`Found: ${userId}`);
    } else throw createErr;
  } else {
    userId = userData.user.id;
    console.log(`Created: ${userId}`);
  }

  console.log(`Adding to workspace as ${ROLE}...`);
  const { error: memberErr } = await supabase
    .from("workspace_members")
    .upsert({ workspace_id: WORKSPACE_ID, user_id: userId, role: ROLE }, { onConflict: "workspace_id,user_id" });
  if (memberErr) throw memberErr;

  console.log("Setting active workspace...");
  const { error: prefErr } = await supabase
    .from("user_preferences")
    .upsert({ user_id: userId, active_workspace_id: WORKSPACE_ID, display_name: DISPLAY }, { onConflict: "user_id" });
  if (prefErr) throw prefErr;

  console.log(`\nDone! ${EMAIL} can log in. Role: ${ROLE}`);
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
