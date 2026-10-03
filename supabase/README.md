# Supabase backend

The game's backend (accounts, profiles, character catalog, coin ledger, server
RPCs) lives in Supabase. This folder keeps its schema under version control so
the backend can be reviewed and recreated.

The game also runs **without** Supabase: if `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` aren't set, it falls back to guest-only mode
(localStorage).

## Projects

| Project | Purpose |
|---|---|
| **Live** | Real players. Only receives changes that were tested in dev first. |
| **Dev** | Development and testing. Safe to experiment and reset. |

Point the game at a project with Vite env files (both are gitignored):

| File | Used by | Should contain |
|---|---|---|
| `.env.development.local` | `npm run dev` | Dev URL + anon key |
| `.env.production.local` | `npm run build` | Live URL + anon key |

## Files

| File | What it is |
|---|---|
| `migrations/20261003000000_baseline.sql` | Full `public` schema exported from live: 6 tables + `coin_balances` view, the `currency_kind` enum, RLS policies, grants, the `record_run` / `purchase_character_with_coins` / `handle_new_user` functions, and the `on_auth_user_created` trigger on `auth.users` |
| `seed.sql` | The character catalog (7 characters) |
| `config.toml` | Supabase CLI config |

## What the client relies on

| Object | Kind | Used by |
|---|---|---|
| `profiles` | table (RLS: self read/update) | `src/game/auth.ts`, `progress.ts`, `characters.ts` |
| `characters` | table (public read) | `src/game/characters.ts` |
| `user_characters` | table (RLS: self read) | `src/game/characters.ts` |
| `coin_ledger` / `coin_balances` | table / view | `src/game/auth.ts` |
| `runs`, `purchases` | tables (written only by RPCs) | — |
| `record_run(p_distance, p_coins, p_character_id)` | RPC | `src/game/progress.ts` |
| `purchase_character_with_coins(p_character_id)` | RPC | `src/game/characters.ts` |
| `character-assets` | public storage bucket (models + thumbnails) | `characters.model_url` / `thumbnail_url` |

## Setting up a fresh project

1. Run `migrations/20261003000000_baseline.sql` in the new project's SQL
   Editor (or `psql -v ON_ERROR_STOP=1 --single-transaction -f …`).
2. Run `seed.sql`.
3. Create a **public** bucket named `character-assets` and upload the model and
   thumbnail files, then update `characters.model_url` / `thumbnail_url` to the
   new project's host.
4. In Authentication settings, match the live project (email confirmation,
   Site URL, redirect URLs, including `http://localhost:5173` for dev).

## Exporting the schema again

Use the **PostgreSQL 17** command-line tools (the servers run Postgres 17, and
`pg_dump` must be the same version or newer). Docker isn't required.

```sh
pg_dump --schema-only --schema=public "<session-pooler connection string>"
```

Use the **Session pooler** connection string from Dashboard → Connect. If the
password contains special characters (`@`, `#`, `/`…), URL-encode them.

## Rules

- Every database change is a **new migration file**. Never edit an applied one.
- Apply to **dev first**, test, then apply the same file to live.
- Never commit DB passwords, service-role keys, or `.env*.local` files.
- Read every dump before committing it.
