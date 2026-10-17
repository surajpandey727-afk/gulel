-- Additive migration: profile avatar and activity tracking improvements
-- Safe: no destructive changes, no data loss

-- Add avatar_url to user_preferences (display_name already exists)
alter table public.user_preferences
  add column if not exists avatar_url text;

-- Ensure jobs table has all the types we need (the table already exists)
-- No schema changes needed — new job types use existing columns
