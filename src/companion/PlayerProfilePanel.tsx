import {
  AlertTriangle,
  History,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Swords,
  Trophy,
  Unplug,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ChampionAvatar } from "../components/ChampionAvatar";
import type { LocalPlayerProfileSeed } from "./bridge";
import type { DataDragonCatalog } from "./dataDragon";
import type { PlayerProfile, PlayerProfileConfig } from "./player-profile";

const regions = ["EUW", "EUNE", "NA", "KR", "JP", "BR", "LAN", "LAS", "OCE", "TR", "RU", "SG", "PH", "TW", "VN", "TH", "ME"];

interface PlayerProfilePanelProps {
  local?: LocalPlayerProfileSeed;
  profile?: PlayerProfile;
  loading: boolean;
  error?: string;
  connected: boolean;
  catalog?: DataDragonCatalog;
  dataDragonVersion?: string;
  onConnect: (config: PlayerProfileConfig) => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}

function championName(id: number, fallback: string | undefined, catalog?: DataDragonCatalog): string {
  return catalog?.championNames[id] ?? fallback ?? `Champion ${id}`;
}

function Portrait({ id, name, catalog, version }: { id: number; name?: string; catalog?: DataDragonCatalog; version?: string }) {
  return <ChampionAvatar name={championName(id, name, catalog)} championId={id} assetKey={catalog?.championAssetKeys?.[id]} dataDragonVersion={version} size="small" />;
}

function rankLabel(profile: PlayerProfile): string {
  if (!profile.rank || profile.rank.tier === "UNRANKED") return "Unranked";
  const division = profile.rank.division ? ["", "I", "II", "III", "IV"][profile.rank.division] : "";
  return `${profile.rank.tier[0]}${profile.rank.tier.slice(1).toLowerCase()} ${division} · ${profile.rank.lp ?? 0} LP`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function PlayerProfilePanel({
  local,
  profile,
  loading,
  error,
  connected,
  catalog,
  dataDragonVersion,
  onConnect,
  onRefresh,
  onDisconnect,
  onClose,
}: PlayerProfilePanelProps) {
  const [gameName, setGameName] = useState(local?.gameName ?? "");
  const [tagLine, setTagLine] = useState(local?.tagLine ?? "");
  const [region, setRegion] = useState(local?.region ?? "EUW");

  useEffect(() => {
    if (!local || connected) return;
    setGameName(local.gameName);
    setTagLine(local.tagLine);
    setRegion(local.region);
  }, [connected, local]);

  const bestWinRate = useMemo(() => profile?.champions
    .filter((entry) => entry.games >= 5)
    .sort((left, right) => right.winRate - left.winRate || right.games - left.games)[0], [profile]);
  const topMastery = profile?.masteries[0];
  const worstMatchups = profile?.matchups.filter((entry) => entry.losses > 0).slice(0, 5) ?? [];
  const canConnect = Boolean(local && gameName.trim() && tagLine.trim() && region && !loading);

  return (
    <div className="profile-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="player-profile" role="dialog" aria-modal="true" aria-labelledby="player-profile-title">
        <header className="player-profile__header">
          <div><span><UserRound size={14} />Local player profile</span><h2 id="player-profile-title">Your performance room</h2><p>Mastery stays local. Match history and ranked records come from OP.GG only after you connect.</p></div>
          <button type="button" onClick={onClose} aria-label="Close player profile"><X size={19} /></button>
        </header>

        {!connected || !profile ? (
          <div className="profile-connect">
            <section className="profile-connect__detected">
              <span>Detected from League</span>
              {local ? (
                <><h3>{local.gameName}<small>#{local.tagLine}</small></h3><p>{local.region} · Level {local.summonerLevel} · {local.masteries.length} mastery records available locally</p></>
              ) : (
                <><h3>League account unavailable</h3><p>Open the League client, then reopen this panel.</p></>
              )}
            </section>
            <form onSubmit={(event) => { event.preventDefault(); if (canConnect) onConnect({ gameName: gameName.trim(), tagLine: tagLine.trim(), region }); }}>
              <label><span>Game name</span><input value={gameName} maxLength={32} readOnly aria-readonly="true" placeholder="Riot game name" /></label>
              <label><span>Tag line</span><input value={tagLine} maxLength={16} readOnly aria-readonly="true" placeholder="EUW" /></label>
              <label><span>Region</span><select value={region} disabled>{regions.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
              <div className="profile-privacy-note"><LockKeyhole size={17} /><p><strong>Explicit external lookup</strong>Your Riot ID and region will be sent to the official OP.GG MCP service. The League authentication token and PUUID never leave this computer.</p></div>
              {error ? <div className="profile-error"><AlertTriangle size={15} />{error}</div> : null}
              <button className="profile-connect__button" type="submit" disabled={!canConnect}>{loading ? <RefreshCw className="is-spinning" size={16} /> : <ShieldCheck size={16} />}Connect this profile</button>
            </form>
          </div>
        ) : (
          <div className="profile-dashboard">
            <div className="profile-identity">
              <div><span>Connected profile</span><h3>{profile.config.gameName}<small>#{profile.config.tagLine}</small></h3><p>{profile.config.region} · Level {profile.summonerLevel} · refreshed {new Date(profile.refreshedAt).toLocaleString()}</p></div>
              <div className="profile-identity__actions"><button type="button" onClick={onRefresh} disabled={loading}><RefreshCw className={loading ? "is-spinning" : ""} size={14} />Refresh</button><button type="button" onClick={onDisconnect}><Unplug size={14} />Disconnect</button></div>
            </div>
            {error ? <div className="profile-error"><AlertTriangle size={15} />{error}</div> : null}

            <div className="profile-summary">
              <article><span>Solo rank</span><strong>{rankLabel(profile)}</strong><small>{profile.rank ? `${profile.rank.wins}W · ${profile.rank.losses}L` : "No supported ranked record"}</small></article>
              <article><span>Best supported win rate</span><strong>{bestWinRate ? `${championName(bestWinRate.champion.id, bestWinRate.champion.name, catalog)} · ${percent(bestWinRate.winRate)}` : "Not enough games"}</strong><small>{bestWinRate ? `${bestWinRate.games} ranked games` : "Minimum 5 games"}</small></article>
              <article><span>Highest mastery</span><strong>{topMastery ? championName(topMastery.championId, undefined, catalog) : "Unavailable"}</strong><small>{topMastery ? `${topMastery.points.toLocaleString()} pts · Level ${topMastery.level}` : "Open League to refresh"}</small></article>
            </div>

            <div className="profile-grid">
              <section className="profile-panel profile-panel--champions">
                <header><div><Trophy size={15} /><span>Ranked champion record</span></div><small>Season aggregate from OP.GG</small></header>
                <div className="profile-champion-list">{profile.champions.slice(0, 5).map((entry) => (
                  <article key={entry.champion.id}><Portrait id={entry.champion.id} name={entry.champion.name} catalog={catalog} version={dataDragonVersion} /><span><strong>{championName(entry.champion.id, entry.champion.name, catalog)}</strong><small>{entry.games} games · {entry.wins}W {entry.losses}L</small></span><b className={entry.winRate >= .5 ? "is-positive" : "is-negative"}>{percent(entry.winRate)}</b></article>
                ))}</div>
              </section>

              <section className="profile-panel">
                <header><div><ShieldCheck size={15} /><span>Champion mastery</span></div><small>Exact local League points</small></header>
                <div className="profile-mastery-list">{profile.masteries.slice(0, 5).map((entry, index) => (
                  <article key={entry.championId}><em>{index + 1}</em><Portrait id={entry.championId} catalog={catalog} version={dataDragonVersion} /><span><strong>{championName(entry.championId, undefined, catalog)}</strong><small>Level {entry.level}{entry.highestGrade ? ` · Best ${entry.highestGrade}` : ""}</small></span><b>{entry.points.toLocaleString()}</b></article>
                ))}</div>
              </section>

              <section className="profile-panel">
                <header><div><History size={15} /><span>Recent match history</span></div><small>Latest OP.GG results</small></header>
                <div className="profile-match-list">{profile.recentMatches.slice(0, 5).map((match, index) => (
                  <article key={`${match.playedAt}-${index}`} className={`is-${match.result}`}><Portrait id={match.champion.id} name={match.champion.name} catalog={catalog} version={dataDragonVersion} /><span><strong>{championName(match.champion.id, match.champion.name, catalog)}{match.opponent ? ` vs ${championName(match.opponent.id, match.opponent.name, catalog)}` : ""}</strong><small>{match.role ?? "Role unknown"} · {match.kills}/{match.deaths}/{match.assists} · {new Date(match.playedAt).toLocaleDateString()}</small></span><b>{match.result}</b></article>
                ))}</div>
              </section>

              <section className="profile-panel">
                <header><div><Swords size={15} /><span>Recent difficult matchups</span></div><small>Personal signal · low weight</small></header>
                {worstMatchups.length > 0 ? <div className="profile-matchup-list">{worstMatchups.map((entry) => (
                  <article key={`${entry.championId}-${entry.role}-${entry.opponent.id}`}><Portrait id={entry.opponent.id} name={entry.opponent.name} catalog={catalog} version={dataDragonVersion} /><span><strong>{championName(entry.opponent.id, entry.opponent.name, catalog)}</strong><small>When you played {championName(entry.championId, undefined, catalog)} · {entry.role}</small></span><b>{entry.losses}L / {entry.games}</b></article>
                ))}</div> : <div className="profile-panel__empty">No completed same-role matchup pairs were available in the recent OP.GG history.</div>}
                <p className="profile-weight-note"><ShieldCheck size={13} />Personal losses can add at most 8 points to a 100-point ban score. Aggregate matchup and meta evidence remain dominant.</p>
              </section>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
