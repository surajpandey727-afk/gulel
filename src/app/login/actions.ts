"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_: unknown, form: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const mode = String(form.get("mode") ?? "signin");
  const next = String(form.get("next") ?? "/overview");
  if (!email || password.length < 8) return { error: "Enter your email and a password of at least 8 characters." };

  const { error } =
    mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(next.startsWith("/") ? next : "/overview");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
