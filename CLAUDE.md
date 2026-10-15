# CLAUDE.md — Funding Scan Platform

This file is read by Claude Code at the start of every session. It describes the product, the stack, and the rules that must hold in every file you write. When a request conflicts with this file, stop and ask.

## What this product is

A web application where an organization fills out a profile form and receives a verified, continuously updated list of funding opportunities — grants, RFPs, contracts, provider enrollments, loans, certifications — that fit it. Three intake channels feed one `opportunities` table:

1. **Federal APIs** — SAM.gov Opportunities and Grants.gov Search2, pulled nightly per organization.
2. **Email** — each organization has an inbox at `{slug}-{suffix}@{INBOUND_DOMAIN}`; procurement portals and agency newsletters send to it; each message is parsed into opportunities.
3. **Web research** — four parallel Claude agents (state / federal-nonapi / local-regional / private-industry) search official sources, verify each item on its official page, and return JSON; results are merged in code.

Every channel ends at the same scoring step (`lib/assess.ts`) and the same table. The dashboard and the Monday digest read only from the table, never from a channel.

The founder's background is nonprofit development and Medicaid-waiver provider operations, not software engineering. Explain decisions briefly in commit messages and prefer boring, well-documented libraries.

## Stack

- **Framework:** Next.js (App Router), TypeScript strict mode, Tailwind. Server Components by default; Client Components only where interaction requires it.
- **Database / auth:** Supabase (Postgres, Auth with magic links, Row-Level Security, Storage for email attachments). Migrations live in `supabase/migrations/` and are the source of truth for the schema; never alter tables from the dashboard.
- **Background jobs:** Inngest. Every scheduled or long-running operation is an Inngest function in `inngest/functions/`. Nothing that calls Claude or an external API runs inside a web request handler.
- **Inbound email:** Postmark Inbound webhook at `app/api/inbound/postmark/route.ts`.
- **AI:** Claude API via the official `@anthropic-ai/sdk`. All calls go through `lib/claude.ts` (see below). Models: Haiku 5.5 for parsing and scoring; Sonnet 5.5 with web search and web fetch for research and re-verification. No other LLM providers, no orchestration frameworks.
- **Hosting:** Vercel. Environment variables are set in Vercel and `.env.local`; never hardcoded.
- **Package manager:** npm. Node 20+.

## Repository layout

```
app/                  Next.js routes and pages
  api/inbound/postmark/route.ts
  api/inngest/route.ts
  (dashboard)/        authenticated pages
inngest/
  client.ts
  functions/          federal-intake, email-received, research-scan, reverify, weekly-digest
lib/
  claude.ts           the only module that imports @anthropic-ai/sdk
  assess.ts           profile + opportunity -> scored fields
  merge.ts            deterministic dedupe/merge of research results
  intake/sam.ts       SAM.gov client and normalizer
  intake/grants.ts    Grants.gov client and normalizer
  intake/email.ts     email -> opportunities
  supabase/           server and browser clients
prompts/
  research-scan.md    shared header + layer briefs (the human-editable source of truth)
  assess.md
  email-parse.md
  digest.md
fixtures/
  cardinal-profile.json
  cardinal-v2.json    reference output for diffing
supabase/migrations/
scripts/              one-off CLI scripts (intake.ts, scan.ts)
```

## The data model

Core tables — see `supabase/migrations/` for columns:

- `organizations` — one per customer. `inbox_address` is unique and generated on creation.
- `profiles` — versioned; a new row on every save. Holds the form fields as JSONB plus `naics_codes text[]`, `states text[]`, `keywords text[]`.
- `opportunities` — the single table every channel writes to. Unique on `(organization_id, source_channel, external_id)`. `source_channel` is one of `api_sam | api_grants | email | research`.
- `scan_runs` — one row per job execution with counts, tokens, searches, `cost_usd`, status, error.
- `emails`, `email_subscriptions`, `manual_checks` — supporting tables.

Rules:

- `pursuit_status` is staff-owned. It is set to `'New'` when a row is first inserted and never written again by any automated code path. Upserts must exclude it from the update set.
- Upserts update `deadline`, `status`, `award_amount`, `last_verified`, `raw` and scoring fields. They never overwrite `first_seen`.
- Every row has `official_link` pointing at the funder's or agency's own page, SAM.gov, Grants.gov, or a state procurement registry. Aggregator hosts (`starbridge`, `grantwatch`, `instrumentl`, `bidnet`, `govtribe`, `highergov`) are rejected by `lib/merge.ts` and the content moved to `verify_notes` with `verification = 'Needs Verification'`.
- Row-Level Security is on for every table. A user can read and write only rows whose `organization_id` belongs to an organization they own. The service-role key is used only inside Inngest functions and API routes, never in browser code.

## `lib/claude.ts` — the only way to call Claude

Every call to the Claude API goes through this module. It must:

- Accept `{ purpose, organizationId, scanRunId, model, system, messages, tools, maxTokens, cache }`.
- Refuse to run when `process.env.CLAUDE_DISABLED === 'true'` (the kill switch) and throw a clear error.
- Apply prompt caching (`cache_control`) to the system block when `cache` is true.
- After the response, write to `scan_runs`: input tokens, output tokens, cache read/write tokens, web search count from `usage.server_tool_use`, and `cost_usd` computed from a price table in the same file.
- Retry on 429 and 5xx with exponential backoff, max 3 attempts.
- Never log prompt or response bodies at info level; debug only, and never customer email contents.

If you find yourself importing `@anthropic-ai/sdk` anywhere else, stop.

## Standing rules for anything Claude produces

These come from the founder's research practice and are non-negotiable. They apply to the prompts in `prompts/` and to any code that post-processes Claude output.

1. **No fabricated data.** Never invent a deadline, amount, URL, ID, contact, or eligibility rule. If it cannot be confirmed from an official source, the field is `null` and the item is `Needs Verification`.
2. **Official links only** as `official_link`. Aggregators may be used to discover leads, never as the link.
3. Unconfirmed references carry `[VERIFY]` in `verify_notes`. Items that need legal or compliance review before pursuit carry a non-null `compliance_flag`.
4. Named contacts only when the name appears on the official page.
5. Synopses in Claude's own words, 2–4 sentences, never copied passages.
6. One row per opportunity. Dedupe by normalized link, then by normalized name.
7. Closed opportunities are not silently dropped. Recurring programs whose round has closed get `status = 'Closed - Recurring'` with `last_round`; ineligible opportunities are stored with `status = 'Not eligible'` and the disqualifying rule.
8. Sources that cannot be read go to `manual_checks`, with URL and reason, never skipped.

## Prompts

- Prompt text lives in `prompts/*.md`, loaded at runtime. Do not inline prompt text in TypeScript. When output quality is the problem, change the prompt file and re-run the fixture; do not patch around it in code.
- Every Claude call that returns data uses structured output (a JSON schema) so parsing never depends on regex.
- `prompts/research-scan.md` has a shared header and four layer briefs. The header is identical across the four parallel calls and is the cached block.

## Cost and safety limits

- Research scan: at most one per organization per 30 days plus one on profile change; `max_uses: 40` on web search per layer; Inngest concurrency limit of 2 on `research-scan`.
- Email parsing: at most 500 messages per inbox per day.
- Assessment: batch through the Message Batches API when more than 20 records are pending.
- `CLAUDE_DISABLED=true` must stop every Claude call within one request cycle.
- Never run a scan, an API pull, or an email parse inside a web request. Enqueue an Inngest event and return.

## Conventions

- TypeScript strict; no `any` without a comment explaining why.
- Zod schemas for every external payload (API responses, webhook bodies, Claude structured output) in `lib/schemas/`.
- Dates stored as `date` or `timestamptz`, never strings. Deadlines are dates without time unless the source gives one.
- Server Actions for form submission; API routes only for webhooks and the Inngest handler.
- Tests with Vitest. Every normalizer (`sam`, `grants`, `email`) and `merge.ts` has fixture-based tests; run `npm test` before every commit.
- Commit messages: imperative, one line, then a short paragraph on why.
- Do not add dependencies without saying what they are for. Prefer the platform (fetch, crypto) over packages.

## Environment variables

Required in `.env.local` and Vercel:

```
ANTHROPIC_API_KEY
DATA_GOV_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
POSTMARK_SERVER_TOKEN
POSTMARK_INBOUND_SECRET
INBOUND_DOMAIN
CLAUDE_DISABLED
```

`.env.local` is gitignored. If a secret is ever committed, say so immediately so it can be rotated; do not try to rewrite history.

## How to work in this repo

- Read this file and `prompts/research-scan.md` before starting a task.
- Small, reviewable changes. One phase of the build guide per session.
- When a task is ambiguous, ask one question rather than guessing. When a task would violate a rule above, say which rule and stop.
- After finishing, run `npm run lint && npm test && npm run build` and report the result.
