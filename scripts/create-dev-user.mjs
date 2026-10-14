// Creates the local development founder account (local Supabase only).
// Usage: node --env-file=.env.local scripts/create-dev-user.mjs
import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("Refusing to create a dev user outside local Supabase");
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data, error } = await admin.auth.admin.createUser({ email: process.env.DEV_USER_EMAIL, password: process.env.DEV_USER_PASSWORD, email_confirm: true });
if (error && !/already/i.test(error.message)) throw error;
console.log(error ? "dev user already exists" : `created dev user ${data.user.id}`);
