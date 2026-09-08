import { describe, expect, it } from "vitest";

import {
  championTokenForOpgg,
  parseOpggBanAdvice,
  parseOpggDraftGuide,
  wilsonInterval,
} from "../src/companion/opgg-client";

const observed = (ids: number[], names: string[], play: number, win: number, pickRate: number) => ({
  ids,
  ids_names: names,
  play,
  win,
  pick_rate: pickRate,
});

const guide = (counters: unknown[] = []) => ({
  data: {
    summary: { positions: [{ name: "MID", counters }] },
    summoner_spells: [observed([4, 12], ["Flash", "Teleport"], 500, 260, 0.5)],
    core_items: [observed([3118, 4645, 3157], ["Malignance", "Shadowflame", "Zhonya's Hourglass"], 200, 112, 0.2)],
    boots: [observed([3020], ["Sorcerer's Shoes"], 600, 310, 0.6)],
    starter_items: [observed([1056, 2003], ["Doran's Ring", "Health Potion"], 900, 460, 0.9)],
    rune_pages: [{
      builds: [{
        id: 8112,
        primary_page_id: 8100,
        primary_page_name: "Domination",
        primary_rune_ids: [8112, 8139, 8140, 8106],
        primary_rune_names: ["Electrocute", "Taste of Blood", "Grisly Mementos", "Ultimate Hunter"],
        secondary_page_id: 8200,
        secondary_page_name: "Sorcery",
        secondary_rune_ids: [8210, 8226],
        secondary_rune_names: ["Transcendence", "Manaflow Band"],
        stat_mod_ids: [5005, 5008, 5001],
        play: 480,
        win: 250,
        pick_rate: 0.48,
      }],
    }],
  },
});

describe("OP.GG MCP adapter", () => {
  it("normalizes champion names into safe MCP tokens", () => {
    expect(championTokenForOpgg("Aurelion Sol")).toBe("AURELION_SOL");
    expect(championTokenForOpgg("Kai'Sa")).toBe("KAISA");
    expect(championTokenForOpgg("Nunu & Willump")).toBe("NUNU");
  });

  it("maps matchup builds, runes, spells, and opponent counters without inventing missing evidence", () => {
    const parsed = parseOpggDraftGuide(
      guide(),
      guide([{ champion_id: 50, champion_name: "Swain", play: 100, win: 42 }]),
      {
        role: "MID",
        champion: { id: 103, name: "Ahri" },
        opponent: { id: 134, name: "Syndra" },
        fetchedAt: "2026-09-07T12:00:00.000Z",
      },
    );

    expect(parsed?.source).toBe("OP.GG MCP");
    expect(parsed?.builds[0]?.ids).toEqual([3118, 4645, 3157]);
    expect(parsed?.runes[0]?.perkIds).toHaveLength(6);
    expect(parsed?.spells[0]?.names).toEqual(["Flash", "Teleport"]);
    expect(parsed?.matchupCandidates[0]).toMatchObject({
      champion: { id: 50, name: "Swain" },
      sampleSize: 100,
      wins: 58,
      rawWinRate: 0.58,
    });
    expect(parsed?.evidenceNotice).toMatch(/does not expose region/i);
  });

  it("derives an ordered Wilson interval around the observed win rate", () => {
    const interval = wilsonInterval(58, 100);
    expect(interval.low).toBeLessThan(0.58);
    expect(interval.high).toBeGreaterThan(0.58);
  });

  it("ranks supported matchup counters using both matchup danger and current role meta", () => {
    const meta = 'LolListLaneMetaChampions("mid",Data(Positions([Mid("Swain",14198,7262,0.51,0.01,0.02,3,40),Mid("Nasus",47998,24566,0.51,0.02,0.46,1,11),Mid("Xerath",97784,49683,0.51,0.04,0.13,1,13)])))';
    const analysis = 'LolGetChampionAnalysis("AZIR","MID",Data([WeakCounter(50,"Swain",115,46,0.4,0.6,0.6),WeakCounter(75,"Nasus",371,154,0.42,0.58,0.58),WeakCounter(101,"Xerath",885,389,0.44,0.56,0.56)]))';
    const parsed = parseOpggBanAdvice(
      { meta, analysis },
      {
        role: "MID",
        champion: { id: 268, name: "Azir" },
        dataPatch: "16.17",
        fetchedAt: "2026-09-07T12:00:00.000Z",
      },
    );

    expect(parsed?.candidates).toHaveLength(3);
    expect(parsed?.candidates[0]?.champion.name).toBe("Nasus");
    expect(parsed?.candidates[0]?.metaTier).toBe(1);
    expect(parsed?.candidates[0]?.matchupSampleSize).toBe(371);
    expect(parsed?.candidates[0]?.score).toBeGreaterThan(0);
    expect(parsed?.candidates[0]?.interval95.low).toBeLessThan(parsed?.candidates[0]?.counterWinRate ?? 0);
    expect(parsed?.evidenceNotice).toMatch(/60%.*40%/);
  });

  it("suppresses ban claims when matchup evidence is below the minimum sample", () => {
    const parsed = parseOpggBanAdvice(
      {
        meta: 'LolListLaneMetaChampions("mid",Data(Positions([Mid("Swain",14000,7000,0.5,0.01,0.02,1,1)])))',
        analysis: 'LolGetChampionAnalysis("AZIR","MID",Data([WeakCounter(50,"Swain",99,39,0.39,0.61,0.61)]))',
      },
      { role: "MID", champion: { id: 268, name: "Azir" } },
    );

    expect(parsed?.candidates).toEqual([]);
  });
});
