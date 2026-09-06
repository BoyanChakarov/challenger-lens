import { Clock, Layers, SearchX } from "lucide-react";
import { formatPercent } from "../lib/analytics";
import type { ItemBuildStat } from "../types";
import { ChampionAvatar } from "./ChampionAvatar";

interface ItemBuildsProps {
  builds: ItemBuildStat[];
}

export function ItemBuilds({ builds }: ItemBuildsProps) {
  if (builds.length === 0) {
    return (
      <div className="empty-state empty-state--compact">
        <SearchX size={22} aria-hidden="true" />
        <strong>No build reaches the selected sample floor</strong>
        <span>Reduce minimum sample size or broaden the filters.</span>
      </div>
    );
  }

  return (
    <div className="build-grid">
      {builds.slice(0, 6).map((build) => (
        <article className="build-card" key={build.id}>
          <header className="build-card__header">
            <div className="champion-identity champion-identity--compact">
              <ChampionAvatar name={build.championName} />
              <div>
                <span className="eyebrow">{build.role} · {build.region}</span>
                <strong>{build.championName}</strong>
                <span>into {build.opponentName ?? "all opponents"}</span>
              </div>
            </div>
            <div className="build-rate">
              <strong>{formatPercent(build.winRate)}</strong>
              <span>{build.games} games</span>
            </div>
          </header>

          <div className="build-card__label">
            <Layers size={15} aria-hidden="true" />
            {build.buildLabel}
          </div>

          <ul className="item-sequence" aria-label={`${build.championName} observed final items`}>
            {build.itemNames.slice(0, 3).map((item) => (
              <li key={`${build.id}-${item}`}>
                <span className="item-index" aria-hidden="true">•</span>
                <strong>{item}</strong>
              </li>
            ))}
          </ul>

          <footer className="build-card__footer">
            <span>Boots · {build.boots ?? "Not available"}</span>
            {build.avgCompletionMinutes ? (
              <span>
                <Clock size={14} aria-hidden="true" />
                Core by {build.avgCompletionMinutes.toFixed(1)}m
              </span>
            ) : null}
            <span>{formatPercent(build.pickRate)} observed share</span>
          </footer>
        </article>
      ))}
    </div>
  );
}
