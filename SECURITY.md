# Security

## Secrets

Never commit any Riot API key, Supabase secret/service-role key, database password, or personal access token. The repository contains placeholders only.

Use these locations:

- local development: ignored `.env.local`
- GitHub Actions: repository Actions secrets
- hosted worker: the host's encrypted environment/secrets store

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may reach browser code. The worker refuses to start without its server-only variables and never logs their values.

The desktop connector discovers League's rotating local credential from the local
lockfile. That credential is held in memory only, is never serialized across the
Tauri bridge, and is never written to Supabase, disk, analytics, or logs. Its
custom debug representation replaces the password with `[REDACTED]`.

Local League requests are restricted to HTTPS loopback addresses, bypass system
proxies, refuse redirects, and validate against Riot's published local root
certificate. The Live Client adapter briefly reads the local player's Riot ID
only to call Riot's player-scoped item endpoint; the ID is discarded before the
response crosses the desktop bridge.

The opt-in player-profile command is a separate, explicit exception to the
identity-free draft snapshot. It returns only the signed-in player's game name,
tag line, region, level, and sanitized mastery rows; PUUID, account ID, summoner
ID, and the League token are discarded. Pressing **Connect this profile** sends
the Riot ID and region to OP.GG's documented MCP service. The UI discloses this
before the first request. Parsed summaries are cached locally, raw matches and
game IDs are not retained, and disconnect removes the saved profile data.

Public clients use only the Supabase publishable key. Automatic PostgREST retries
are disabled and requests are aborted after 2.5 seconds so champion select can
fall back to a clearly labeled local aggregate cache. Secret keys remain limited
to the ingestion worker.

If a key is pasted into chat, an issue, a log, or a commit, rotate it immediately. Removing it from the latest commit is not enough because Git history and caches may retain it.

## Reporting

For this portfolio project, open a private security advisory in GitHub rather than a public issue when credentials or exploitable access-control problems are involved.
