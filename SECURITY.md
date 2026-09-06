# Security

## Secrets

Never commit any Riot API key, Supabase secret/service-role key, database password, or personal access token. The repository contains placeholders only.

Use these locations:

- local development: ignored `.env.local`
- GitHub Actions: repository Actions secrets
- hosted worker: the host's encrypted environment/secrets store

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may reach browser code. The worker refuses to start without its server-only variables and never logs their values.

If a key is pasted into chat, an issue, a log, or a commit, rotate it immediately. Removing it from the latest commit is not enough because Git history and caches may retain it.

## Reporting

For this portfolio project, open a private security advisory in GitHub rather than a public issue when credentials or exploitable access-control problems are involved.
