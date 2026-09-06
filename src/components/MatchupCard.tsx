import { ShieldCheck, Users } from "lucide-react";
import {
  describeSignal,
  formatPercent,
  formatSigned,
  type MatchupInsight,
} from "../lib/analytics";
import { ChampionAvatar } from "./ChampionAvatar";

interface MatchupCardProps {
  matchup: MatchupInsight;
  rank: number;
}

export function MatchupCard({ matchup, rank }: MatchupCardProps) {
  const isPositive = matchup.winRateLift >= 0;
  const tone = isPositive ? "positive" : "negative";
  const region = matchup.region === "ALL" ? "EUW + EUNE" : matchup.region;
  const hasEarlyGameData = matchup.earlyGameSampleSize > 0;
  const earlyDelta = (value: number, decimals = 0) =>
    hasEarlyGameData ? formatSigned(value, decimals) : "—";

  return (
    <article className="matchup-card" data-tone={tone}>
      <div className="matchup-card__rank">Signal {String(rank).padStart(2, "0")}</div>
      <div className="matchup-card__pair">
        <div className="champion-identity">
          <ChampionAvatar name={matchup.championName} size="large" />
          <div>
            <span className="eyebrow">Play</span>
            <strong>{matchup.championName}</strong>
          </div>
        </div>
        <span className="versus" aria-label="versus">VS</span>
        <div className="champion-identity champion-identity--enemy">
          <ChampionAvatar name={matchup.opponentName} size="large" muted />
          <div>
            <span className="eyebrow">Into</span>
            <strong>{matchup.opponentName}</strong>
          </div>
        </div>
      </div>

      <div className="matchup-card__headline">
        <div>
          <span>Adjusted matchup win rate</span>
          <strong>{formatPercent(matchup.adjustedWinRate)}</strong>
        </div>
        <div className={`lift-badge lift-badge--${tone}`}>
          {formatSigned(matchup.winRateLift * 100, 1, " pp")}
          <span>vs baseline</span>
        </div>
      </div>

      <div className="confidence-range">
        <span
          className="confidence-range__fill"
          style={{
            left: `${matchup.wilsonLow * 100}%`,
            width: `${Math.max((matchup.wilsonHigh - matchup.wilsonLow) * 100, 2)}%`,
          }}
        />
        <span
          className="confidence-range__marker"
          style={{ left: `${matchup.rawWinRate * 100}%` }}
        />
      </div>
      <div className="confidence-range__labels">
        <span>Raw WR 95% interval {formatPercent(matchup.wilsonLow)}</span>
        <span>{formatPercent(matchup.wilsonHigh)}</span>
      </div>

      <div className="delta-grid">
        <div>
          <span>Gold @15</span>
          <strong className={hasEarlyGameData ? (matchup.avgGoldDiff15 >= 0 ? "positive-value" : "negative-value") : undefined}>
            {earlyDelta(matchup.avgGoldDiff15)}
          </strong>
        </div>
        <div>
          <span>CS @15</span>
          <strong className={hasEarlyGameData ? (matchup.avgCsDiff15 >= 0 ? "positive-value" : "negative-value") : undefined}>
            {earlyDelta(matchup.avgCsDiff15, 1)}
          </strong>
        </div>
        <div>
          <span>XP @15</span>
          <strong className={hasEarlyGameData ? (matchup.avgXpDiff15 >= 0 ? "positive-value" : "negative-value") : undefined}>
            {earlyDelta(matchup.avgXpDiff15)}
          </strong>
        </div>
        <div>
          <span>KDA Δ</span>
          <strong className={matchup.kdaDiff >= 0 ? "positive-value" : "negative-value"}>
            {formatSigned(matchup.kdaDiff, 2)}
          </strong>
        </div>
      </div>

      <p className="signal-explanation">{describeSignal(matchup)}</p>

      <footer className="matchup-card__footer">
        <div className="evidence-score">
          <span className={`confidence-dot confidence-dot--${matchup.confidenceLabel.toLowerCase()}`} />
          <ShieldCheck size={15} aria-hidden="true" />
          <strong>{matchup.evidenceScore}/100</strong>
          <span>{matchup.confidenceLabel} evidence</span>
        </div>
        <div className="sample-note">
          <Users size={15} aria-hidden="true" />
          {matchup.games} games · {matchup.uniquePlayers} players · {matchup.earlyGameSampleSize} @15 · {region}
        </div>
      </footer>
    </article>
  );
}
