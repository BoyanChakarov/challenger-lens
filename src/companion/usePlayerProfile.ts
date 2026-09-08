import { useCallback, useEffect, useState } from "react";

import type { CompanionBridge, LocalPlayerProfileSeed } from "./bridge";
import {
  attachMatchupDetails,
  parseOpggPlayerProfile,
  type PlayerProfile,
  type PlayerProfileConfig,
} from "./player-profile";

const CONFIG_KEY = "challenger-lens:player-profile:config:v1";
const PROFILE_KEY = "challenger-lens:player-profile:data:v1";
const PROFILE_MAX_AGE_MS = 6 * 60 * 60 * 1_000;

interface PlayerProfileState {
  local?: LocalPlayerProfileSeed;
  profile?: PlayerProfile;
  loading: boolean;
  error?: string;
  connected: boolean;
}

function readConfig(): PlayerProfileConfig | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "null") as Partial<PlayerProfileConfig> | null;
    return value && typeof value.gameName === "string" && typeof value.tagLine === "string" && typeof value.region === "string"
      ? { gameName: value.gameName, tagLine: value.tagLine, region: value.region }
      : undefined;
  } catch {
    return undefined;
  }
}

function readCachedProfile(): PlayerProfile | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null") as PlayerProfile | null;
    return value && typeof value.refreshedAt === "string" && Array.isArray(value.champions) && Array.isArray(value.masteries)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function storeProfile(config: PlayerProfileConfig, profile: PlayerProfile): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // A local storage restriction should not prevent the current profile view.
  }
}

export function usePlayerProfile(bridge: CompanionBridge) {
  const [state, setState] = useState<PlayerProfileState>(() => {
    const profile = readCachedProfile();
    return { profile, loading: false, connected: Boolean(readConfig() && profile) };
  });

  const loadRemoteProfile = useCallback(async (
    config: PlayerProfileConfig,
    local: LocalPlayerProfileSeed,
  ): Promise<PlayerProfile> => {
    if (!bridge.getOpggPlayerProfile || !bridge.getOpggMatchDetail) {
      throw new Error("OP.GG profile data is available in the installed desktop app.");
    }
    const raw = await bridge.getOpggPlayerProfile(config);
    const parsed = parseOpggPlayerProfile(raw, config, local);
    if (!parsed) throw new Error("OP.GG returned an unsupported or empty profile response.");
    const settledDetails = await Promise.allSettled(parsed.pendingMatches.map((match) =>
      bridge.getOpggMatchDetail!({ region: config.region, gameId: match.gameId, createdAt: match.playedAt }),
    ));
    const details = settledDetails.map((result) => result.status === "fulfilled" ? result.value : undefined);
    return attachMatchupDetails(parsed, details);
  }, [bridge]);

  const connect = useCallback(async (config: PlayerProfileConfig) => {
    const local = state.local;
    if (!local) {
      setState((current) => ({ ...current, error: "Open League and refresh the detected account first." }));
      return;
    }
    const sameAccount = config.gameName.trim().toLocaleLowerCase() === local.gameName.trim().toLocaleLowerCase()
      && config.tagLine.trim().toLocaleLowerCase() === local.tagLine.trim().toLocaleLowerCase()
      && config.region === local.region;
    if (!sameAccount) {
      setState((current) => ({ ...current, error: "The connected Riot ID must match the account currently open in League." }));
      return;
    }
    setState((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const profile = await loadRemoteProfile(config, local);
      storeProfile(config, profile);
      setState((current) => ({ ...current, profile, loading: false, connected: true }));
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "The profile could not be loaded.",
      }));
    }
  }, [loadRemoteProfile, state.local]);

  const refresh = useCallback(async () => {
    const config = readConfig();
    if (!config || !state.local) return;
    await connect(config);
  }, [connect, state.local]);

  const disconnect = useCallback(() => {
    try {
      localStorage.removeItem(CONFIG_KEY);
      localStorage.removeItem(PROFILE_KEY);
    } catch {
      // State is still cleared for the current session.
    }
    setState((current) => ({ local: current.local, loading: false, connected: false }));
  }, []);

  useEffect(() => {
    let active = true;
    if (!bridge.getLocalPlayerProfile) return;
    void bridge.getLocalPlayerProfile().then((local) => {
      if (!active) return;
      setState((current) => ({ ...current, local, error: undefined }));
      const config = readConfig();
      if (!config || !bridge.getOpggPlayerProfile || !bridge.getOpggMatchDetail) return;
      const sameAccount = config.gameName.trim().toLocaleLowerCase() === local.gameName.trim().toLocaleLowerCase()
        && config.tagLine.trim().toLocaleLowerCase() === local.tagLine.trim().toLocaleLowerCase()
        && config.region === local.region;
      if (!sameAccount) {
        setState((current) => ({ ...current, connected: false, error: "League is signed into a different account. Reconnect this profile to continue." }));
        return;
      }
      const cached = readCachedProfile();
      const cachedAt = cached ? Date.parse(cached.refreshedAt) : Number.NaN;
      if (cached && Number.isFinite(cachedAt) && Date.now() - cachedAt <= PROFILE_MAX_AGE_MS) {
        setState((current) => ({ ...current, profile: cached, connected: true, loading: false }));
        return;
      }
      setState((current) => ({ ...current, loading: true }));
      void loadRemoteProfile(config, local).then((profile) => {
        if (!active) return;
        storeProfile(config, profile);
        setState((current) => ({ ...current, profile, loading: false, connected: true }));
      }).catch((error: unknown) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : "The saved profile could not be refreshed.",
        }));
      });
    }).catch((error: unknown) => {
      if (!active) return;
      setState((current) => ({
        ...current,
        loading: false,
        error: current.profile
          ? undefined
          : error instanceof Error ? error.message : "Open League to detect your account.",
      }));
    });
    return () => { active = false; };
  }, [bridge, loadRemoteProfile]);

  return { ...state, connect, disconnect, refresh };
}
