import { useEffect, useState } from "react";

import type {
  RecommendationClientSuccess,
  RecommendationRequest,
} from "./recommendation-client";
import { freezeRecommendationBundle } from "./selectors";
import type {
  ChampionRef,
  FrozenRecommendationBundle,
  LeagueSnapshot,
  RecommendationBundle,
  Role,
} from "./types";

interface RecommendationState {
  bundle?: FrozenRecommendationBundle;
  loading: boolean;
  message?: string;
}

export interface RecommendationFocus {
  opponentChampionId?: number;
  localChampion?: ChampionRef;
  role?: Role;
  useRankedEvidenceForCustom?: boolean;
}

export function requestsForSnapshot(
  snapshot: LeagueSnapshot,
  focus: RecommendationFocus = {},
): RecommendationRequest[] {
  const { draft, patch, region, queue, map } = snapshot;
  const role = focus.role ?? draft?.assignedRole;
  const supportedRankedContext = queue?.id === 420 && map?.id === 11;
  const supportedCustomTestContext = focus.useRankedEvidenceForCustom === true && map?.id === 11;
  if (
    snapshot.phase !== "champion_select" ||
    !draft ||
    !role ||
    !patch ||
    !region ||
    (!supportedRankedContext && !supportedCustomTestContext)
  ) {
    return [];
  }

  const visible = draft.enemies
    .filter((slot) => slot.champion)
    .filter((slot) => !focus.opponentChampionId || slot.champion?.id === focus.opponentChampionId)
    .sort((left, right) =>
      Number(right.role === role) -
      Number(left.role === role),
    );
  const seen = new Set<number>();

  return visible.flatMap((slot) => {
    const opponent = slot.champion;
    if (!opponent || seen.has(opponent.id)) return [];
    seen.add(opponent.id);
    return [{
      patch,
      region,
      // Custom games are a test harness only; their UI explicitly opts into this
      // Ranked Solo/Duo evidence slice instead of representing it as custom data.
      queueId: 420,
      mapId: 11,
      role,
      ...(focus.localChampion ?? draft.localChampion
        ? {
            localChampionId: (focus.localChampion ?? draft.localChampion)?.id,
            localChampionName: (focus.localChampion ?? draft.localChampion)?.name,
          }
        : {}),
      opponentChampionId: opponent.id,
      opponentChampionName: opponent.name,
    }];
  });
}

export function mergeRecommendationResults(
  results: readonly RecommendationClientSuccess[],
  preparedAt = new Date(),
): FrozenRecommendationBundle | undefined {
  if (results.length === 0) return undefined;
  const primary =
    results.find((result) =>
      result.bundle.runePages.length > 0 ||
      result.bundle.spellPairs.length > 0 ||
      result.bundle.itemPaths.length > 0,
    ) ?? results[0];
  if (!primary) return undefined;

  const bundle = primary.bundle;
  const staleResults = results.filter((result) => result.stale);
  const counterGroups = results.flatMap((result) => result.bundle.counterGroups);
  const merged: RecommendationBundle = {
    id: `${bundle.id}:visible-${counterGroups.map((group) => group.opponent.id).join("-")}`,
    patch: bundle.patch,
    region: bundle.region,
    queue: { ...bundle.queue },
    map: { ...bundle.map },
    preparedAt: preparedAt.toISOString(),
    refreshedAt: bundle.refreshedAt,
    dataStatus: staleResults.length > 0 ? "stale" : "fresh",
    ...(staleResults.length > 0
      ? {
          dataNotice:
            "Offline fallback: one or more results use the latest cached aggregate for this exact patch and context.",
        }
      : {}),
    ...(bundle.localChampion ? { localChampion: { ...bundle.localChampion } } : {}),
    ...(bundle.role ? { role: bundle.role } : {}),
    counterGroups,
    runePages: [...bundle.runePages],
    spellPairs: bundle.spellPairs.flatMap((pair) => {
      const [first, second] = pair.spells;
      if (!first || !second) return [];
      return [{
        ...pair,
        spells: [{ ...first }, { ...second }] as const,
      }];
    }),
    itemPaths: [...bundle.itemPaths],
  };

  return freezeRecommendationBundle(merged, preparedAt.toISOString());
}

export function useCompanionRecommendations(
  snapshot: LeagueSnapshot,
  enabled: boolean,
  focus: RecommendationFocus = {},
): RecommendationState {
  const requests = requestsForSnapshot(snapshot, focus);
  const requestKey = JSON.stringify(requests.map((request) => [
      request.patch,
      request.region,
      request.queueId,
      request.mapId,
      request.role,
      request.localChampionId ?? null,
      request.opponentChampionId,
    ]));
  const [state, setState] = useState<RecommendationState>({ loading: false });

  useEffect(() => {
    if (!enabled) return;
    if (snapshot.phase !== "champion_select") {
      if (["client_closed", "idle", "lobby", "post_game"].includes(snapshot.phase)) {
        setState({ loading: false });
      }
      return;
    }
    if (requests.length === 0) {
      const role = focus.role ?? snapshot.draft?.assignedRole;
      const isCustomContext = snapshot.queue?.id !== 420;
      setState({
        loading: false,
        message:
          !role
            ? "Choose your role to request matchup evidence."
            : isCustomContext && !focus.useRankedEvidenceForCustom
              ? "Custom game detected. Enable ranked-evidence test mode to load recommendations."
              : snapshot.draft?.enemies.some((slot) => slot.champion)
                ? "Waiting for a supported patch, map, and visible matchup."
            : "Waiting for a visible enemy selection before requesting aggregate evidence.",
      });
      return;
    }

    let active = true;
    setState({ loading: true });
    void import("./recommendation-client")
      .then(({ fetchCompanionRecommendations }) =>
        Promise.all(requests.map((request) => fetchCompanionRecommendations(request))),
      )
      .then((results) => {
        if (!active) return;
        const successes = results.filter(
          (result): result is RecommendationClientSuccess => result.ok,
        );
        const merged = mergeRecommendationResults(successes);
        if (merged) {
          setState({ bundle: merged, loading: false, ...(merged.dataNotice ? { message: merged.dataNotice } : {}) });
          return;
        }
        const failure = results.find((result) => !result.ok);
        setState({
          loading: false,
          message: failure && !failure.ok
            ? failure.message
            : "No exact-context aggregate recommendation is available yet.",
        });
      })
      .catch(() => {
        if (active) {
          setState({
            loading: false,
            message: "The aggregate recommendation request could not be completed.",
          });
        }
      });

    return () => {
      active = false;
    };
  // requestKey represents the privacy-reduced context and prevents a refetch on every local poll.
  }, [enabled, requestKey, snapshot.phase]);

  return state;
}
