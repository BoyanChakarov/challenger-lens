# Riot Product Registration Draft

This document is a review aid, not proof of Riot approval. Keep the Developer
Portal product description synchronized with every shipped endpoint and feature.

## Product summary

**Name:** Challenger Lens Companion

Challenger Lens Companion is a read-only Windows application that detects League
of Legends champion select, displays several evidence-backed pre-game choices,
and carries the chosen pre-game plan into a static non-injected overlay. It uses
current-patch aggregate Match-v5 observations. It shows uncertainty, sample size,
unique-player breadth, concentration, and early-lane statistics, and suppresses
counter language when evidence is insufficient.

## Player flow

1. The player opens the companion and League independently.
2. The companion reports closed, idle, lobby, queue, or champion-select state.
3. During champion select it reads only visible draft state and the local
   player's role/loadout from the local League Client API.
4. It requests precomputed aggregate recommendations by patch, region, queue,
   map, role, champion, and visible enemy champion IDs.
5. The player may inspect and manually mark one of several choices. Nothing is
   applied to League.
6. During loading and the match, a separate always-on-top window shows the frozen
   pre-game choices. Live Client Data updates only the local item checklist.
7. During personal testing, when the patch-and-region-exact aggregate is
   unavailable, the native application may request an explicitly selected,
   visible champion matchup from OP.GG's official public MCP endpoint. The UI
   labels this as global OP.GG reference data and displays its evidence gaps.
8. The overlay hides after the match.
9. The player may open a local profile panel. It reads only the signed-in
   player's Riot ID, level, and champion mastery. After a separate explicit
   connect action, the app requests that player's ranked record and recent
   public match history through OP.GG's documented MCP service. Personal recent
   matchup history can add at most 8 points to a 100-point ban-priority score.

## League Client API endpoints disclosed for the MVP

- `GET /lol-gameflow/v1/gameflow-phase`
- `GET /lol-champ-select/v1/session`
- `GET /lol-perks/v1/currentpage`
- `GET /lol-gameflow/v1/session`
- `GET /lol-patch/v1/game-version`
- `GET /riotclient/region-locale`
- `GET /lol-summoner/v1/current-summoner` — local player's Riot ID and level for
  the explicitly opened profile panel.
- `GET /lol-champion-mastery/v1/local-player/champion-mastery` — local player's
  champion mastery level and points.

All calls are local, authenticated with League's rotating lockfile credential,
and read-only. The profile command returns only the local player's game name,
tag line, region, level, and mastery rows; it excludes PUUID, account ID, and
summoner ID. The credential remains in native memory and never crosses IPC or
leaves the computer.

## Live Client Data API endpoints disclosed for the MVP

- `GET /liveclientdata/gamestats`
- `GET /liveclientdata/activeplayername`
- `GET /liveclientdata/playeritems?riotId=...` for the local player only

The local Riot ID is used transiently for that local item request and then
discarded. No player list, enemy cooldown, event stream, prediction, movement,
or hidden identity feature is present.

## Server-side Riot APIs and static data

- League-v4 Challenger cohorts.
- Match-v5 match details and timelines.
- Data Dragon regional realms, version index, and patch-matched champion, item,
  rune, and spell metadata/assets.
- Official patch notes for future patch-impact annotations.

The Riot production key and Supabase secret key are server-side only. Desktop
responses contain sanitized aggregates, never raw match records.

## Explicitly excluded

- Picking, banning, locking, dodging, rune writes, or spell writes.
- Automatic purchasing, movement, abilities, or input automation.
- Process memory reads, DLL/code injection, or Riot process modification.
- Enemy identity inference, cooldown tracking, movement predictions, or adaptive
  live coaching.
- Imperative prompts such as "buy this now" or "go here now".
- Scraping OP.GG, U.GG, Lolalytics, Mobalytics, or another third-party website.
  OP.GG integration uses its documented MCP interface, not website scraping,
  and must be included in the feature audit before distribution.
- Advertising in the loading screen or in-game overlay.

Any future League Client write endpoint is a new opt-in feature and must be added
to the product description and reviewed by Riot before distribution.

## Required visible disclaimer

> Challenger Lens Companion is not endorsed by Riot Games and does not reflect
> the views or opinions of Riot Games or anyone officially involved in producing
> or managing Riot Games properties. Riot Games and all associated properties are
> trademarks or registered trademarks of Riot Games, Inc.

## Pre-distribution checklist

- Product and every LCU endpoint are registered in the Riot Developer Portal.
- The current build/feature set has been audited by Riot.
- Public builds use a production-approved key; no personal/development key is
  distributed or used for public alpha/beta traffic.
- The legal disclaimer is readily visible.
- A testable Windows build and the full queue-to-overlay flow are available to
  Riot reviewers.
- Endpoint inventory, privacy statement, screenshots, and data refresh/patch
  behavior match the shipped build.
- Optional writes remain absent until separately reviewed.

Policy references: [Riot general policies](https://developer.riotgames.com/policies/general)
and [League game/client API policy](https://developer.riotgames.com/docs/lol).
