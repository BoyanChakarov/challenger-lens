import { Activity, Database, Scale, ShieldCheck, Users } from "lucide-react";
import type { DatasetSummary } from "../lib/analytics";
import { formatCompactNumber } from "../lib/analytics";

interface DataQualityProps {
  summary: DatasetSummary;
  patch: string;
  regionLabel: string;
}
export function DataQuality({ summary, patch, regionLabel }: DataQualityProps) {
  return (
    <div className="methodology-grid">
      <article className="methodology-card methodology-card--wide">
        <span className="section-kicker">From match history to signal</span>
        <h3>Designed to reward repeatable evidence</h3>
        <p>
          Challenger games are descriptive observations, not controlled experiments. The model
          combines outcomes, lane deltas, sample breadth, and uncertainty so one player's hot
          streak cannot dominate a recommendation.
        </p>
        <div className="method-steps">
          <div>
            <span className="method-step__number">01</span>
            <strong>Collect</strong>
            <p>Recent Ranked Solo matches from Challenger ladders in EUW and EUNE.</p>
          </div>
          <div>
            <span className="method-step__number">02</span>
            <strong>Normalize</strong>
            <p>Group by patch, role, champion, opponent, and observed item sequence.</p>
          </div>
          <div>
            <span className="method-step__number">03</span>
            <strong>Score</strong>
            <p>Shrink noisy win rates and score breadth, precision, and signal agreement.</p>
          </div>
        </div>
      </article>

      <aside className="quality-card">
        <div className="quality-card__heading">
          <span className="icon-shell" aria-hidden="true"><ShieldCheck size={18} /></span>
          <div>
            <span className="eyebrow">Current data slice</span>
            <strong>Quality context</strong>
          </div>
        </div>
        <dl className="quality-list">
          <div>
            <dt><Activity size={15} aria-hidden="true" /> Patch</dt>
            <dd>{patch}</dd>
          </div>
          <div>
            <dt><Database size={15} aria-hidden="true" /> Region</dt>
            <dd>{regionLabel}</dd>
          </div>
          <div>
            <dt><Users size={15} aria-hidden="true" /> Players</dt>
            <dd>{formatCompactNumber(summary.players)}</dd>
          </div>
          <div>
            <dt><Scale size={15} aria-hidden="true" /> Coverage</dt>
            <dd>{summary.coveragePct > 0 ? `${summary.coveragePct.toFixed(0)}%` : "Pending"}</dd>
          </div>
        </dl>
        <p className="quality-note">
          High confidence means the observed signal is broader and more precise. It does not
          guarantee the matchup result for an individual game.
        </p>
      </aside>
    </div>
  );
}
