"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string | null; info?: string; redirect?: string };

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
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      if (/already registered/i.test(error.message)) return { error: "An account with this email already exists. Switch to Sign in." };
      if (/rate limit/i.test(error.message)) return { error: "Too many attempts. Wait a few minutes and try again." };
      return { error: error.message };
    }
    if (data.user && !data.session) {
      return { error: null, info: "Check your inbox — we sent a confirmation link to " + email + ". Click it to finish setup." };
    }
    if (data.session) return { error: null, redirect: next.startsWith("/") ? next : "/overview" };
    return { error: null, info: "Account created. Check your email to confirm." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      const { error: resendErr } = await supabase.auth.resend({ type: "signup", email });
      if (resendErr && /rate limit/i.test(resendErr.message)) {
        return { error: "Your email is not confirmed. A confirmation link was already sent — check your inbox (and spam folder)." };
      }
      return { error: null, info: "Your email is not confirmed yet. We just re-sent the confirmation link to " + email + "." };
    }
    if (/invalid login credentials/i.test(error.message)) return { error: "Wrong email or password." };
    if (/rate limit/i.test(error.message)) return { error: "Too many sign-in attempts. Wait a few minutes and try again." };
    return { error: error.message };
  }
  return { error: null, redirect: next.startsWith("/") ? next : "/overview" };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
