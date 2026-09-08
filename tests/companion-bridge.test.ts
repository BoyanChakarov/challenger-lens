import { describe, expect, it } from "vitest";
import {
  LOCAL_PLAYER_PROFILE_COMMAND,
  LEAGUE_SNAPSHOT_COMMAND,
  OPGG_MATCH_DETAIL_COMMAND,
  OPGG_PLAYER_PROFILE_COMMAND,
  sanitizeNativeSnapshot,
} from "../src/companion/bridge";
import type { LeaguePhase } from "../src/companion/types";

describe("privacy-safe native companion bridge", () => {
  it("uses the registered read-only snapshot command", () => {
    expect(LEAGUE_SNAPSHOT_COMMAND).toBe("get_league_snapshot");
    expect(LOCAL_PLAYER_PROFILE_COMMAND).toBe("get_local_player_profile");
    expect(OPGG_PLAYER_PROFILE_COMMAND).toBe("get_opgg_player_profile");
    expect(OPGG_MATCH_DETAIL_COMMAND).toBe("get_opgg_match_detail");
  });

  it.each([
    ["client_closed", "client_closed"],
    ["client_idle", "idle"],
    ["lobby", "lobby"],
    ["queue", "lobby"],
    ["champion_select", "champion_select"],
    ["loading", "loading"],
    ["active_game", "active_game"],
    ["post_game", "post_game"],
  ] satisfies Array<[string, LeaguePhase]>)(
    "maps native state %s to visible lifecycle state %s",
    (state, expected) => {
      expect(sanitizeNativeSnapshot({ state }).phase).toBe(expected);
    },
  );

  it("keeps only allowlisted draft fields and preserves recommendation context", () => {
    const snapshot = sanitizeNativeSnapshot({
      state: "champion_select",
      observedAtMs: Date.parse("2026-09-07T06:42:00.000Z"),
      patch: "16.17",
      region: "EUW1",
      queue: { id: 420, name: "Ranked Solo/Duo", hidden: "discard me" },
      map: { id: 11, name: "Summoner's Rift", secret: "discard me" },
      championSelect: {
        localChampionId: 163,
        assignedRole: "MIDDLE",
        allies: [
          {
            cellId: 4,
            championId: 163,
            championPickIntent: 0,
            assignedRole: "MIDDLE",
            lockedIn: true,
            isLocalPlayer: true,
            puuid: "identity-puuid",
            summonerName: "Hidden Summoner",
          },
        ],
        enemies: [
          {
            cellId: 9,
            championId: 517,
            lockedIn: true,
            riotId: "Hidden#EUW",
          },
        ],
        allyBanIds: [238],
        enemyBanIds: [84],
        currentRunePage: {
          primaryStyleId: 8300,
          subStyleId: 8200,
          selectedPerkIds: [8369, 8304, 5005],
          name: "Private page name",
        },
        currentSpellIds: [4, 12],
        timer: { phase: "BAN_PICK", adjustedTimeLeftMs: 30_000 },
      },
    });

    expect(snapshot.patch).toBe("16.17");
    expect(snapshot.region).toBe("EUW");
    expect(snapshot.queue).toEqual({ id: 420, name: "Ranked Solo/Duo" });
    expect(snapshot.map).toEqual({ id: 11, name: "Summoner's Rift" });
    expect(snapshot.draft?.localChampion).toEqual({ id: 163, name: "Taliyah" });
    expect(snapshot.draft?.assignedRole).toBe("MID");
    expect(snapshot.draft?.currentSpells?.map((spell) => spell.name)).toEqual([
      "Flash",
      "Teleport",
    ]);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("identity-puuid");
    expect(serialized).not.toContain("Hidden Summoner");
    expect(serialized).not.toContain("Hidden#EUW");
    expect(serialized).not.toContain("Private page name");
    expect(serialized).not.toContain("discard me");
  });
});
