# Live Companion Architecture

The Live Companion is a read-only Windows surface built around the existing
Challenger Lens aggregate pipeline. It does not inject into League, read process
memory, automate champion select, or make gameplay decisions for the player.

## Runtime flow

```text
Riot Match-v5 / League-v4 / Data Dragon
                  |
                  v
      private ingestion tables
                  |
                  v
  aggregate-only Supabase contract
                  |
           HTTPS, < 2.5 s
                  v
        patch-scoped local cache
                  |
                  v
LCU draft snapshot -> recommendations -> frozen pre-game plan
                                            |
                                  Live Client item IDs
                                            |
                                            v
                                  static Tauri overlay
```

The web dashboard remains an evidence-research view. The companion is a separate,
lifecycle-driven UI that reuses its statistical vocabulary without treating
post-game KDA, final gold, or completed items as causal pre-game features.

## Supported lifecycle

The connector maps League gameflow into seven stable application states:

| Companion state | Local signal |
| --- | --- |
| `client_closed` | no valid LCU lockfile and no Live Client response |
| `client_idle` | `None`, a temporarily unavailable LCU, or an unknown phase |
| `lobby` | `Lobby` |
| `queue` | `Matchmaking` or `ReadyCheck` |
| `champion_select` | `ChampSelect` plus a privacy-reduced draft snapshot |
| `loading` | `GameStart` |
| `active_game` | `InProgress`/`Reconnect`, or a reachable Live Client when the client is gone |
| `post_game` | `WaitingForStats`, `PreEndOfGame`, or `EndOfGame` |

The lockfile is rediscovered on every poll, so a new process, port, or password is
picked up automatically after a League restart. Missing or changed LCU fields do
not crash the app: the lifecycle remains visible and the affected panel reports a
temporary capability error.

## Local endpoint inventory

These are the only League Client endpoints used by the MVP:

- `GET /lol-gameflow/v1/gameflow-phase` — lifecycle detection.
- `GET /lol-champ-select/v1/session` — visible picks, bans, assigned positions,
  summoner spells, actions, and the phase timer. The connector deserializes no
  summoner name, Riot ID, PUUID, or summoner ID.
- `GET /lol-perks/v1/currentpage` — the local player's current rune selection.
- `GET /lol-gameflow/v1/session` — queue and map context for a bounded
  recommendation query.
- `GET /lol-patch/v1/game-version` — the running client patch, reduced to its
  major/minor data patch.
- `GET /riotclient/region-locale` — the local routing region, normalized to the
  backend's supported region codes.
- `GET /lol-summoner/v1/current-summoner` — signed-in player's Riot ID and level
  for the user-opened profile panel. Account IDs and PUUID are discarded.
- `GET /lol-champion-mastery/v1/local-player/champion-mastery` — signed-in
  player's champion mastery points, levels, grades, and last-play timestamps.

These are the only Live Client Data endpoints used by the MVP:

- `GET /liveclientdata/gamestats` — active-game detection and map/mode/time.
- `GET /liveclientdata/activeplayername` — transient local Riot ID lookup.
- `GET /liveclientdata/playeritems?riotId=...` — local inventory checklist.

The broad `/allgamedata`, `/playerlist`, event, score, ability, cooldown, and
enemy-player endpoints are intentionally not used. The adapter performs GETs
only. Riot's local certificate is bundled from the official developer
documentation and is added as a trust root; TLS validation is not disabled.

## Privacy boundary

The Tauri command returns only:

- lifecycle, observation time, and the raw gameflow phase;
- champion slot IDs, visible champion IDs/intents, assigned role when supplied by
  League, lock state, local spells, bans, runes, and timer;
- map/mode/time and the local player's owned item IDs during a match;
- sanitized diagnostic codes and copy.

The continuously polled draft snapshot never returns credentials, install paths,
process command lines, player names, Riot IDs, PUUIDs, summoner IDs, or raw
LCU/Live Client payloads. A separately invoked local-profile command is the only
exception: it returns the signed-in player's game name, tag line, region, level,
and sanitized mastery rows. It still excludes PUUID, account ID, summoner ID,
and every League credential.

## Recommendation and overlay rules

A recommendation bundle is immutable once champion select ends. Loading and
active-game views show the exact prepared bundle; Live Client data may check off
locally owned items but cannot re-rank or replace the options. Copy stays
conditional ("consider", "if the enemy is in Mid") and every option keeps its
patch, refresh time, sample size, player breadth/concentration, interval, and
evidence label beside the conclusion.

The overlay is a separate undecorated, always-on-top Tauri window. It is shown for
loading/active-game states and hidden when League reaches post-game, idle, or
closed. It is not injected into or parented by a Riot process.

## Latency and offline behavior

- Polling is local and uses short connection/request timeouts.
- Supabase reads disable automatic retries and abort at 2.5 seconds.
- Exact-patch aggregate responses are cached locally; offline fallback never
  changes the recorded data patch and is labeled stale.
- Patch-matched Data Dragon champion/item/spell metadata is cached separately
  and has a 1.5-second fetch budget. It can enrich labels and identify item
  stages, but it never creates or changes statistical evidence.
- No third-party website scraping is performed. For personal testing, the native
  connector may call OP.GG's documented public MCP endpoint for the selected
  visible matchup. Results are cached for six hours, attributed in the UI, and
  are not represented as patch/region-exact Riot observations.

## OP.GG MCP fallback boundary

The fallback uses `https://mcp-api.op.gg/mcp` and the documented
`lol_get_lane_matchup_guide`, `lol_list_lane_meta_champions`, and
`lol_get_champion_analysis` tools. Draft-time calls send only role and visible
champion names; they send no player identity, League token, Riot API key, or
Supabase credential.
The endpoint exposes game counts, observed wins, builds, runes, spells, and
matchup candidates. The app derives only a Wilson interval from those counts.

OP.GG MCP does not currently expose the exact data patch, regional slice,
unique-player count/concentration, baseline adjustment, or 15-minute lane
deltas. The UI therefore labels this data as a global reference and does not
present those unavailable measures as zero or infer them. The Riot/Supabase
aggregate remains the source for evidence-qualified counter claims.

The optional profile feature uses `lol_get_summoner_profile`,
`lol_list_summoner_matches`, and `lol_get_summoner_game_detail`. It is activated
only after the user presses **Connect this profile** on a screen that states the
external sharing boundary. Only the signed-in player's Riot ID and region are
sent. Parsed profile summaries are cached locally for six hours; game IDs and
raw match records are not retained. Disconnect removes the saved profile and
consent record. Personal same-role losses are a secondary signal capped at 8
points out of 100 in ban ranking.

## Deliberate MVP limits

- Exact patches are isolated and Data Dragon versions are recorded, but the
  structured previous-patch definition diff and balance-change down-weighting
  belong to the planned patch-aware phase.
- Current item stages are built from purchase events and retained final items;
  the aggregate labels this as a proxy until server-side Data Dragon enrichment
  is added.
- Team-composition compatibility is not fabricated. The UI says it is not yet
  modeled until a forward-tested composition feature model exists.
- A real champion-select acceptance run still requires a League client and an
  applied Supabase migration populated with current-patch observations.

## Development commands

```bash
pnpm desktop:dev
pnpm desktop:build
```

The Windows build requires Rust's stable MSVC toolchain, Microsoft C++ Build
Tools, and WebView2. Native unit tests cover lockfile validation/redaction,
gameflow mapping, role normalization, and local item reduction.

Primary references: [Riot League Client and Game Client APIs](https://developer.riotgames.com/docs/lol#league-client-api),
[Riot product policies](https://developer.riotgames.com/policies/general), and
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
