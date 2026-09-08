import {
  Activity,
  BarChart3,
  Database,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChampionAvatar } from "./components/ChampionAvatar";
import { ChampionTable } from "./components/ChampionTable";
import { DataQuality } from "./components/DataQuality";
import { FilterBar } from "./components/FilterBar";
import { ItemBuilds } from "./components/ItemBuilds";
import { MatchupCard } from "./components/MatchupCard";
import { StatCard } from "./components/StatCard";
import { CompanionApp } from "./companion/CompanionApp";
import { demoData, demoPatches } from "./data/demo";
import {
  formatCompactNumber,
  formatPercent,
  formatSigned,
  getChampionRollups,
  getItemBuilds,
  getMatchupInsights,
  summarizeDataset,
} from "./lib/analytics";
import type { DashboardFilters, DashboardLoadResult } from "./types";

const initialResult: DashboardLoadResult = {
  data: demoData,
  mode: "demo",
  message: "Preparing the latest available dataset…",
};

async function loadDashboardData() {
  const dashboardData = await import("./lib/dashboard-data");
  return dashboardData.loadDashboardData();
}

function sortPatches(patches: string[]): string[] {
  return Array.from(new Set(patches)).sort((left, right) =>
    right.localeCompare(left, undefined, { numeric: true }),
  );
}

function formatUpdatedAt(value?: string): string {
  if (!value) return "Refresh pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Refresh pending";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

interface AnalyticsDashboardProps {
  onOpenCompanion: () => void;
}

export function AnalyticsDashboard({ onOpenCompanion }: AnalyticsDashboardProps) {
  const [result, setResult] = useState<DashboardLoadResult>(initialResult);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<DashboardFilters>({
    patch: demoPatches[0] ?? "",
    region: "ALL",
    role: "ALL",
    minGames: 5,
    query: "",
  });

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const nextResult = await loadDashboardData();
    setResult(nextResult);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    void loadDashboardData().then((nextResult) => {
      if (!active) return;
      setResult(nextResult);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const patches = useMemo(() => {
    const values = [
      ...result.data.status.map((row) => row.patch),
      ...result.data.champions.map((row) => row.patch),
      ...result.data.matchups.map((row) => row.patch),
    ].filter((patch) => patch && patch !== "unknown");
    return sortPatches(values.length > 0 ? values : demoPatches);
  }, [result.data]);

  useEffect(() => {
    if (patches.length > 0 && !patches.includes(filters.patch)) {
      setFilters((current) => ({ ...current, patch: patches[0] ?? current.patch }));
    }
  }, [filters.patch, patches]);

  const championRows = useMemo(
    () => getChampionRollups(result.data.champions, filters),
    [filters, result.data.champions],
  );
  const matchupRows = useMemo(
    () => getMatchupInsights(result.data.matchups, filters),
    [filters, result.data.matchups],
  );
  const buildRows = useMemo(
    () => getItemBuilds(result.data.itemBuilds, filters),
    [filters, result.data.itemBuilds],
  );
  const summary = useMemo(
    () => summarizeDataset(result.data.status, filters),
    [filters, result.data.status],
  );
  const scopedStatuses = useMemo(
    () =>
      result.data.status.filter(
        (row) =>
          row.patch === filters.patch &&
          (filters.region === "ALL" || row.region === filters.region),
      ),
    [filters.patch, filters.region, result.data.status],
  );
  const observedStatusCount = scopedStatuses.filter(
    (row) => row.dataProvenance === "live",
  ).length;
  const isObservedView =
    scopedStatuses.length > 0 && observedStatusCount === scopedStatuses.length;
  const isMixedView = observedStatusCount > 0 && !isObservedView;
  const viewMode = isObservedView ? "live" : "demo";
  const viewLabel = isObservedView
    ? "Observed data"
    : isMixedView
      ? "Mixed data"
      : "Synthetic demo";
  const viewMessage = isObservedView
    ? "Reading batch-refreshed, pre-aggregated observations from Supabase."
    : isMixedView
      ? "This scope mixes observed and clearly labeled synthetic rows; treat conclusions as illustrative."
      : result.message;

  const topSignal = matchupRows[0];
  const regionLabel = filters.region === "ALL" ? "EUW + EUNE" : filters.region;
  const trustedSignals = matchupRows.filter((row) => row.confidenceLabel !== "Low").length;
  const roleLabel = filters.role === "ALL" ? "all roles" : filters.role.toLocaleLowerCase();

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#overview" aria-label="Challenger Lens home">
          <span className="brand__mark" aria-hidden="true"><Swords size={20} /></span>
          <span>
            <strong>Challenger Lens</strong>
            <small>EU ranked intelligence</small>
          </span>
        </a>
        <nav className="site-nav" aria-label="Dashboard sections">
          <a href="#matchups">Matchups</a>
          <a href="#champions">Champions</a>
          <a href="#builds">Builds</a>
          <a href="#methodology">Methodology</a>
        </nav>
        <div className="header-actions">
          <button className="surface-switch" type="button" onClick={onOpenCompanion}>
            Live companion
          </button>
          <div className={`source-chip source-chip--${viewMode}`}>
            <span className="source-chip__pulse" />
            {viewLabel}
          </div>
          <button
            className="refresh-button"
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
            aria-label="Refresh dashboard data"
          >
            <RefreshCw size={16} className={isLoading ? "is-spinning" : ""} />
            <span>{isLoading ? "Loading" : "Refresh"}</span>
          </button>
        </div>
      </header>

      <main>
        <section className="hero" id="overview">
          <div className="hero__copy">
            <div className="hero__eyebrow">
              <span><Sparkles size={14} aria-hidden="true" /> Patch {filters.patch}</span>
              <span>{regionLabel}</span>
              <span>Challenger only</span>
            </div>
            <h1>Read the lane<br />before you queue.</h1>
            <p>
              Matchup evidence from Europe's best solo-queue players—measured with win rate,
              early-lane deltas, item choices, and uncertainty in view.
            </p>
          </div>

          <aside className="hero-signal" aria-label="Top evidence signal">
            {topSignal ? (
              <>
                <div className="hero-signal__top">
                  <span className="section-kicker">Strongest signal in view</span>
                  <span className={`confidence-tag confidence-tag--${topSignal.confidenceLabel.toLowerCase()}`}>
                    {topSignal.confidenceLabel} confidence
                  </span>
                </div>
                <div className="hero-signal__matchup">
                  <ChampionAvatar name={topSignal.championName} size="large" />
                  <div>
                    <strong>{topSignal.championName}</strong>
                    <span>into {topSignal.opponentName} · {topSignal.role}</span>
                  </div>
                  <div className="hero-signal__score">
                    <strong>{formatSigned(topSignal.winRateLift * 100, 1, " pp")}</strong>
                    <span>adjusted lift</span>
                  </div>
                </div>
                <div className="hero-signal__metrics">
                  <div><span>Adj. WR</span><strong>{formatPercent(topSignal.adjustedWinRate)}</strong></div>
                  <div><span>Gold @15</span><strong>{topSignal.earlyGameSampleSize > 0 ? formatSigned(topSignal.avgGoldDiff15) : "—"}</strong></div>
                  <div><span>Sample</span><strong>{topSignal.games}</strong></div>
                </div>
              </>
            ) : (
              <div className="empty-state empty-state--compact">
                <Activity size={22} />
                <strong>No signal in this scope yet</strong>
                <span>Broaden the filters to find a matchup.</span>
              </div>
            )}
          </aside>
        </section>

        <div className={`data-banner data-banner--${viewMode}`} role="status" aria-live="polite">
          <div>
            {isObservedView ? <Database size={17} /> : <FlaskConical size={17} />}
            <strong>{isObservedView ? "Observed aggregate dataset" : isMixedView ? "Mixed-provenance dataset" : "Portfolio demo dataset"}</strong>
            <span>{viewMessage}</span>
          </div>
          <span className="data-banner__updated">Updated {formatUpdatedAt(summary.updatedAt)}</span>
        </div>

        <FilterBar filters={filters} patches={patches} onChange={setFilters} />

        <section className="stat-grid" aria-label="Dataset summary">
          <StatCard
            icon={<Trophy size={19} />}
            label="Matches sampled"
            value={formatCompactNumber(summary.matches)}
            detail={`${regionLabel} · patch ${filters.patch}`}
            accent="mint"
          />
          <StatCard
            icon={<Users size={19} />}
            label="Challenger players"
            value={formatCompactNumber(summary.players)}
            detail="Unique ladder entries in scope"
            accent="blue"
          />
          <StatCard
            icon={<BarChart3 size={19} />}
            label="Champion samples"
            value={formatCompactNumber(championRows.reduce((sum, row) => sum + row.games, 0))}
            detail={`${championRows.length} champion-role groups`}
            accent="violet"
          />
          <StatCard
            icon={<ShieldCheck size={19} />}
            label="Trusted signals"
            value={trustedSignals.toString()}
            detail={`≥ ${filters.minGames} games · ${roleLabel}`}
            accent="amber"
          />
        </section>

        <section className="dashboard-section" id="matchups">
          <div className="section-heading">
            <div>
              <span className="section-kicker">Matchup lab</span>
              <h2>Evidence worth investigating</h2>
              <p>Ranked by sample quality, player breadth, precision, and directional agreement.</p>
            </div>
            <div className="section-legend">
              <span><i className="legend-dot legend-dot--high" /> High</span>
              <span><i className="legend-dot legend-dot--medium" /> Medium</span>
              <span><i className="legend-dot legend-dot--low" /> Low</span>
            </div>
          </div>

          {matchupRows.length > 0 ? (
            <div className="matchup-grid">
              {matchupRows.slice(0, 3).map((matchup, index) => (
                <MatchupCard key={matchup.id} matchup={matchup} rank={index + 1} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Swords size={25} aria-hidden="true" />
              <strong>No matchup clears this sample floor</strong>
              <span>Try 10 games, another role, or remove the champion search.</span>
            </div>
          )}
        </section>

        <section className="dashboard-section panel-section" id="champions">
          <div className="section-heading section-heading--inside">
            <div>
              <span className="section-kicker">Champion index</span>
              <h2>Performance at a glance</h2>
              <p>Weighted across the selected regions; click a column to re-rank.</p>
            </div>
            <span className="row-count">{championRows.length} rows</span>
          </div>
          <ChampionTable rows={championRows} />
        </section>

        <section className="dashboard-section" id="builds">
          <div className="section-heading">
            <div>
              <span className="section-kicker">Observed item sets</span>
              <h2>What high-ranked players actually bought</h2>
              <p>Final inventories tied to the matchup—not generic item recommendations.</p>
            </div>
            <div className="context-note">
              <Sparkles size={15} aria-hidden="true" />
              Descriptive, not prescriptive
            </div>
          </div>
          <ItemBuilds builds={buildRows} />
        </section>

        <section className="dashboard-section" id="methodology">
          <div className="section-heading">
            <div>
              <span className="section-kicker">Methodology & limits</span>
              <h2>Confidence stays next to the conclusion</h2>
              <p>Enough context to understand what each prediction can—and cannot—say.</p>
            </div>
          </div>
          <DataQuality summary={summary} patch={filters.patch} regionLabel={regionLabel} />
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer__brand">
          <span className="brand__mark brand__mark--small" aria-hidden="true"><Swords size={16} /></span>
          <div><strong>Challenger Lens</strong><span>A portfolio analytics project</span></div>
        </div>
        <p>
          Challenger Lens is not endorsed by Riot Games and does not reflect the views or opinions
          of Riot Games or anyone officially involved in producing or managing Riot Games
          properties. Riot Games and all associated properties are trademarks or registered
          trademarks of Riot Games, Inc.
        </p>
      </footer>
    </div>
  );
}

type AppSurface = "companion" | "research";

function requestedSurface(): AppSurface {
  const value = new URLSearchParams(window.location.search).get("view");
  return value === "research" ? "research" : "companion";
}

function App() {
  const [surface, setSurface] = useState<AppSurface>(requestedSurface);

  if (surface === "research") {
    return <AnalyticsDashboard onOpenCompanion={() => setSurface("companion")} />;
  }

  return <CompanionApp onOpenResearch={() => setSurface("research")} />;
}

export default App;
