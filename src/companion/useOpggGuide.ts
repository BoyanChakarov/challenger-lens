import { useEffect, useMemo, useState } from "react";

import type { CompanionBridge } from "./bridge";
import {
  championTokenForOpgg,
  parseOpggDraftGuide,
  roleForOpgg,
  type OpggDraftGuide,
} from "./opgg-client";
import type { ChampionRef, LeagueSnapshot, Role } from "./types";

const CACHE_PREFIX = "challenger-lens:opgg-mcp:v1";
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1_000;

interface OpggGuideState {
  guide?: OpggDraftGuide;
  loading: boolean;
  message?: string;
}

function cacheKey(snapshot: LeagueSnapshot, role: Role, champion: ChampionRef, opponent: ChampionRef): string {
  return [CACHE_PREFIX, snapshot.patch ?? "current", role, champion.id, opponent.id].join(":");
}

function readCache(key: string): OpggDraftGuide | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as OpggDraftGuide | null;
    const fetchedAt = value ? Date.parse(value.fetchedAt) : Number.NaN;
    return value && Number.isFinite(fetchedAt) && Date.now() - fetchedAt <= CACHE_MAX_AGE_MS
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

export function useOpggGuide(
  snapshot: LeagueSnapshot,
  bridge: CompanionBridge,
  role: Role | undefined,
  champion: ChampionRef | undefined,
  opponent: ChampionRef | undefined,
): OpggGuideState {
  const key = role && champion && opponent ? cacheKey(snapshot, role, champion, opponent) : undefined;
  const request = useMemo(() => {
    if (!role || !champion || !opponent || !bridge.getOpggMatchupGuide) return undefined;
    const myChampion = championTokenForOpgg(champion.name);
    const opponentChampion = championTokenForOpgg(opponent.name);
    if (!myChampion || !opponentChampion) return undefined;
    return { position: roleForOpgg(role), myChampion, opponentChampion } as const;
  }, [
    bridge,
    champion?.id,
    champion?.name,
    opponent?.id,
    opponent?.name,
    role,
  ]);
  const [state, setState] = useState<OpggGuideState>({ loading: false });

  useEffect(() => {
    if (snapshot.phase !== "champion_select" || !key || !request || !role || !champion || !opponent) {
      setState({ loading: false });
      return;
    }
    const cached = readCache(key);
    if (cached) {
      setState({ guide: cached, loading: false, message: "Using locally cached OP.GG MCP reference data." });
      return;
    }

    let active = true;
    setState({ loading: true, message: "Loading OP.GG MCP fallback evidence…" });
    const reverseRequest = {
      position: request.position,
      myChampion: request.opponentChampion,
      opponentChampion: request.myChampion,
    } as const;
    void Promise.all([
      bridge.getOpggMatchupGuide!(request),
      bridge.getOpggMatchupGuide!(reverseRequest),
    ]).then(([matchup, opponentView]) => {
      if (!active) return;
      const guide = parseOpggDraftGuide(matchup, opponentView, { role, champion, opponent });
      if (!guide) {
        setState({ loading: false, message: "OP.GG MCP returned data in an unsupported format." });
        return;
      }
      try { localStorage.setItem(key, JSON.stringify(guide)); } catch { /* Memory cache still applies. */ }
      setState({ guide, loading: false });
    }).catch((error: unknown) => {
      if (!active) return;
      setState({
        loading: false,
        message: error instanceof Error ? error.message : "OP.GG MCP fallback is unavailable.",
      });
    });

    return () => { active = false; };
  }, [bridge, key, request, role, snapshot.phase]);

  return state;
}
