"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { error: string | null; info?: string; redirect?: string };

function safeRedirect(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/overview";
}

const ALLOWED_DOMAINS = (process.env.ALLOWED_SIGNUP_DOMAINS ?? "nishaan-a.com,nishaan.test")
  .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);

function isSignupAllowed(email: string): boolean {
  const domain = email.split("@")[1];
  return ALLOWED_DOMAINS.includes(domain);
}

export async function signIn(_: Result, form: FormData): Promise<Result> {
  const supabase = await createClient();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const mode = String(form.get("mode") ?? "signin");
  const next = String(form.get("next") ?? "/overview");

  if (!email) return { error: "Enter your email address." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That doesn't look like a valid email address." };
  if (!password) return { error: "Enter your password." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  if (mode === "signup") {
    if (password.length > 72) return { error: "Password must be 72 characters or fewer." };
    if (!isSignupAllowed(email)) return { error: "Sign-up is restricted to invited team members. Contact your administrator." };
    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      if (/already registered/i.test(createErr.message)) return { error: "An account with this email already exists. Switch to Sign in." };
      if (/rate limit/i.test(createErr.message)) return { error: "Too many attempts. Wait a few minutes and try again." };
      return { error: createErr.message };
    }
    if (!created.user) return { error: "Account creation failed. Try again." };
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) return { error: signInErr.message };
    return { error: null, redirect: safeRedirect(next) };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      const admin = createAdminClient();
      const { data: { users } } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const user = users?.find((u) => u.email === email);
      if (user) {
        await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
        const { error: retryErr } = await supabase.auth.signInWithPassword({ email, password });
        if (!retryErr) return { error: null, redirect: safeRedirect(next) };
        return { error: retryErr.message };
      }
    }
    if (/invalid login credentials/i.test(error.message)) return { error: "Wrong email or password." };
    if (/rate limit/i.test(error.message)) return { error: "Too many sign-in attempts. Wait a few minutes and try again." };
    return { error: error.message };
  }
  return { error: null, redirect: safeRedirect(next) };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
