# Architecture

Challenger Lens is intentionally split into a public read path and a private write path.

```text
League-v4 (EUW1/EUN1)     Data Dragon realms
          \                   /
           \                 /
            resumable Node ingestion worker
                        |
                        v
         locked Supabase ingestion tables
                        |
             refresh_public_analytics()
                        |
                        v
          read-only aggregate tables (RLS)
                        |
                        v
              React + Vite dashboard
```

## Why a worker instead of one Edge Function?

A current-patch Challenger crawl can require thousands of Match-v5 detail and timeline requests. Riot's personal key limit, retries, and Supabase Edge Function runtime limits make a single request the wrong execution unit. The worker checkpoints each run, deduplicates matches, and writes idempotently. It can run locally, in a scheduled GitHub Action, or on any small long-lived worker host.

Supabase remains the backend: it stores the census, enforces the public/private boundary, computes aggregate evidence, and serves the dashboard through its Data API.

## Data flow

1. Fetch each region's current Data Dragon realm and Challenger Solo/Duo league.
2. Record the ladder snapshot and its members. Challenger status means “present in this collection snapshot,” not necessarily Challenger at the historical match time.
3. Select a bounded batch of players using the stored cursor.
4. Fetch recent Ranked Solo match IDs from the shared `EUROPE` Match-v5 route.
5. Deduplicate match IDs before fetching details.
6. Reject other queues, maps, patches, and games under ten minutes before requesting a timeline.
7. Persist all participants, 15-minute frames, item events, match sources, and valid same-role pairs.
8. Refresh the public patch/region/role aggregates.

## Security boundary

- Browser: Supabase URL and publishable key only.
- Worker: Riot key and Supabase secret key only in its process environment.
- Ingestion tables: RLS enabled, privileges revoked from `anon` and `authenticated`, no public policies.
- Aggregate tables: RLS enabled, explicit read-only policies and `SELECT` grants.
- Refresh RPC: `SECURITY INVOKER`, executable only by `service_role`.
- No API key is stored in a database row, fixture, source file, URL, or log.

## Scale path

The first version stores 15-minute landmark frames rather than every timeline frame. If the project grows, raw match/timeline payloads can move to private object storage and events can be partitioned by patch. The aggregate-table API remains stable for the frontend.
