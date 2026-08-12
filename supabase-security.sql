-- One-time security hardening (run in Supabase → SQL Editor)
-- Does NOT change app tables/structure beyond privileges + RLS.
-- Safe to re-run.

-- 1) Password column must not be readable by the public anon key
REVOKE ALL ON TABLE public.users FROM anon;
REVOKE ALL ON TABLE public.users FROM authenticated;

-- Allow the app to list/manage users WITHOUT reading password hashes
GRANT SELECT (id, name, role) ON TABLE public.users TO anon, authenticated;
GRANT INSERT (id, name, role, password) ON TABLE public.users TO anon, authenticated;
GRANT UPDATE (name, role, password) ON TABLE public.users TO anon, authenticated;
GRANT DELETE ON TABLE public.users TO anon, authenticated;

-- 2) Enable RLS on core tables (app still uses anon key, so policies stay usable)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_notes ENABLE ROW LEVEL SECURITY;

-- Drop old open policies if re-running
DROP POLICY IF EXISTS users_select ON public.users;
DROP POLICY IF EXISTS users_insert ON public.users;
DROP POLICY IF EXISTS users_update ON public.users;
DROP POLICY IF EXISTS users_delete ON public.users;
DROP POLICY IF EXISTS complaints_all ON public.complaints;
DROP POLICY IF EXISTS comments_all ON public.comments;
DROP POLICY IF EXISTS notif_emails_all ON public.notification_emails;
DROP POLICY IF EXISTS site_notes_all ON public.site_notes;

-- users: column grants already hide password; RLS still required when enabled
CREATE POLICY users_select ON public.users FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY users_insert ON public.users FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY users_update ON public.users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY users_delete ON public.users FOR DELETE TO anon, authenticated USING (true);

-- Keep current app working (anon client). Password reads are blocked by column grants above.
-- Tighter per-role policies need Supabase Auth sessions later.
CREATE POLICY complaints_all ON public.complaints FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY comments_all ON public.comments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY notif_emails_all ON public.notification_emails FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY site_notes_all ON public.site_notes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3) After deploying the new /api/login + SERVICE_ROLE_KEY:
--    rotate the anon key in Supabase → Settings → API, then update .env + Vercel.
