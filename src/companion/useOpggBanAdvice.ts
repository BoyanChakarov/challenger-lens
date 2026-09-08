import { useEffect, useMemo, useState } from "react";

import type { CompanionBridge } from "./bridge";
import {
  championTokenForOpgg,
  parseOpggBanAdvice,
  roleForOpgg,
  type OpggBanAdvice,
} from "./opgg-client";
import type { ChampionRef, LeagueSnapshot, Role } from "./types";

const CACHE_PREFIX = "challenger-lens:opgg-ban-advice:v1";
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1_000;

interface OpggBanAdviceState {
  advice?: OpggBanAdvice;
  loading: boolean;
  message?: string;
}

function cacheKey(snapshot: LeagueSnapshot, role: Role, champion: ChampionRef): string {
  return [CACHE_PREFIX, snapshot.patch ?? "current", role, champion.id].join(":");
}

function readCache(key: string): OpggBanAdvice | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as OpggBanAdvice | null;
    const fetchedAt = value ? Date.parse(value.fetchedAt) : Number.NaN;
    return value && Number.isFinite(fetchedAt) && Date.now() - fetchedAt <= CACHE_MAX_AGE_MS
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

export function useOpggBanAdvice(
  snapshot: LeagueSnapshot,
  bridge: CompanionBridge,
  role: Role | undefined,
  champion: ChampionRef | undefined,
): OpggBanAdviceState {
  const key = role && champion ? cacheKey(snapshot, role, champion) : undefined;
  const request = useMemo(() => {
    if (!role || !champion || !bridge.getOpggBanAdvice) return undefined;
    const championToken = championTokenForOpgg(champion.name);
    if (!championToken) return undefined;
    return { position: roleForOpgg(role), champion: championToken } as const;
  }, [bridge, champion?.id, champion?.name, role]);
  const [state, setState] = useState<OpggBanAdviceState>({ loading: false });

  useEffect(() => {
    if (snapshot.phase !== "champion_select" || !key || !request || !role || !champion) {
      setState({ loading: false });
      return;
    }
    const cached = readCache(key);
    if (cached) {
      setState({ advice: cached, loading: false, message: "Using cached OP.GG ban evidence." });
      return;
    }

    let active = true;
    setState({ loading: true, message: "Comparing current meta and matchup counters…" });
    void bridge.getOpggBanAdvice!(request).then((raw) => {
      if (!active) return;
      const advice = parseOpggBanAdvice(raw, {
        role,
        champion,
        ...(snapshot.patch ? { dataPatch: snapshot.patch } : {}),
      });
      if (!advice || advice.candidates.length === 0) {
        setState({ loading: false, message: "Not enough supported OP.GG evidence for a ban suggestion." });
        return;
      }
      try { localStorage.setItem(key, JSON.stringify(advice)); } catch { /* Cache is optional. */ }
      setState({ advice, loading: false });
    }).catch((error: unknown) => {
      if (!active) return;
      setState({
        loading: false,
        message: error instanceof Error ? error.message : "OP.GG ban evidence is unavailable.",
      });
    });

    return () => { active = false; };
  }, [bridge, champion?.id, champion?.name, key, request, role, snapshot.patch, snapshot.phase]);

  return state;
}
