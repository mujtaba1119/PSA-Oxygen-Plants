# Setup

Do these steps in order.

## 1. Environment variables

Copy `.env.example` to `.env` and fill in the values.

Also add the same keys in Vercel → **Settings → Environment Variables**:

| Name | Where to get it |
|------|-----------------|
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` `public` key |
| `SUPABASE_URL` | Same as the Project URL |
| `SUPABASE_ANON_KEY` | Same as the `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` secret key |
| `RESEND_API_KEY` | Resend dashboard → API Keys |

Do not put `SUPABASE_SERVICE_ROLE_KEY` in any `VITE_` variable.

Redeploy on Vercel after saving env vars.

## 2. Database security SQL

1. Open Supabase → **SQL Editor**
2. Paste the contents of `supabase-security.sql`
3. Click **Run**

This stops the public anon key from reading password hashes.

## 3. Rotate the anon key

1. Supabase → Settings → API → rotate the `anon` key
2. Update `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY` in `.env` and Vercel
3. Redeploy

## 4. Run locally

```bash
npm install
npm run dev
```

For local API routes (`/api/login`, `/api/send-email`):

```bash
npm run dev:full
```

(`dev:full` needs the Vercel CLI and the env vars above.)
