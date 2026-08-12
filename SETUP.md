# Setup

Env vars live in `.env` (committed for this project). On merge to `main`, Vercel builds with those values.

## One-time database step

1. Open Supabase → **SQL Editor**
2. Paste `supabase-security.sql`
3. Click **Run**

## Local run

```bash
npm install
npm run dev
```

API routes locally:

```bash
npm run dev:full
```
