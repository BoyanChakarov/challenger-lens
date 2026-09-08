import { describe, expect, it } from "vitest";

import {
  attachMatchupDetails,
  parseOpggPlayerProfile,
  personalizeBanAdvice,
} from "../src/companion/player-profile";
import type { OpggBanAdvice } from "../src/companion/opgg-client";

const profileText = `
class LolGetSummonerProfile: data
LolGetSummonerProfile(Data(Summoner("Player","EUW",null,null,200,"2026-09-07T12:00:00+03:00",[LeagueStat("SOLORANKED",TierInfo("GOLD",2,44,null),30,20)],RankedMostChampions([MyChampionStat(268,20,12,8,"Azir"),MyChampionStat(134,10,4,6,"Syndra")]))))`;

const matchesText = `
LolListSummonerMatches(Data([GameHistory("game-1","2026-09-07T10:00:00+03:00","SOLORANKED",[Participant(268,"Azir","MID",Stats(3,7,4,"LOSE"))]),GameHistory("game-2","2026-09-06T10:00:00+03:00","SOLORANKED",[Participant(268,"Azir","MID",Stats(8,2,9,"WIN"))])]))`;

const local = {
  gameName: "Player",
  tagLine: "EUW",
  region: "EUW",
  summonerLevel: 200,
  masteries: [{ championId: 268, championLevel: 15, championPoints: 250_000, highestGrade: "S+", lastPlayTime: 1_700_000_000_000 }],
} as const;

describe("local player profile", () => {
  it("combines OP.GG ranked records with exact local mastery without retaining game IDs", () => {
    const parsed = parseOpggPlayerProfile(
      { profile: profileText, matches: matchesText },
      { gameName: "Player", tagLine: "EUW", region: "EUW" },
      local,
      new Date("2026-09-07T12:30:00Z"),
    );

    expect(parsed?.profile.rank).toMatchObject({ tier: "GOLD", division: 2, lp: 44, wins: 30, losses: 20 });
    expect(parsed?.profile.champions[0]).toMatchObject({ champion: { id: 268, name: "Azir" }, games: 20, wins: 12, winRate: 0.6 });
    expect(parsed?.profile.masteries[0]).toMatchObject({ championId: 268, level: 15, points: 250_000 });
    expect(parsed?.pendingMatches).toHaveLength(2);
    expect(JSON.stringify(parsed?.profile.recentMatches)).not.toContain("game-1");
  });

  it("pairs recent ranked games with the visible same-role opponent", () => {
    const parsed = parseOpggPlayerProfile(
      { profile: profileText, matches: matchesText },
      { gameName: "Player", tagLine: "EUW", region: "EUW" },
      local,
    )!;
    const detail = 'Team([Participant(false,268,"Azir","BLUE","MID",Stats(0)),Participant(false,50,"Swain","RED","MID",Stats(0))])';
    const complete = attachMatchupDetails(parsed, [detail, detail]);

    expect(complete.recentMatches[0]?.opponent).toEqual({ id: 50, name: "Swain" });
    expect(complete.matchups[0]).toMatchObject({ championId: 268, opponent: { id: 50 }, role: "MID", games: 2, wins: 1, losses: 1 });
  });

  it("caps personal history to a small ban-score adjustment", () => {
    const advice: OpggBanAdvice = {
      source: "OP.GG MCP",
      fetchedAt: "2026-09-07T12:00:00Z",
      role: "MID",
      champion: { id: 268, name: "Azir" },
      evidenceNotice: "Aggregate evidence",
      candidates: [{
        champion: { id: 50, name: "Swain" }, score: 70, matchupScore: .7, metaScore: .7,
        counterWinRate: .58, adjustedCounterWinRate: .55, matchupSampleSize: 500,
        interval95: { low: .54, high: .62 }, metaRank: 5, metaTier: 1, metaWinRate: .52,
        metaPickRate: .05, metaBanRate: .03, metaSampleSize: 20_000, evidenceLabel: "moderate",
      }],
    };
    const parsed = parseOpggPlayerProfile(
      { profile: profileText, matches: matchesText },
      { gameName: "Player", tagLine: "EUW", region: "EUW" },
      local,
    )!;
    const detail = 'Team([Participant(false,268,"Azir","BLUE","MID",Stats(0)),Participant(false,50,"Swain","RED","MID",Stats(0))])';
    const profile = attachMatchupDetails(parsed, [detail, undefined]);
    const personalized = personalizeBanAdvice(advice, profile);

    expect(personalized?.candidates[0]?.personalAdjustment).toBeLessThanOrEqual(8);
    expect(personalized?.candidates[0]?.score).toBeLessThanOrEqual(78);
  });
});
