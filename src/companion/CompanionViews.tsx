import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Clock3,
  Database,
  EyeOff,
  Gamepad2,
  Layers3,
  Lock,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { ChampionAvatar } from "../components/ChampionAvatar";
import type { DataDragonCatalog } from "./dataDragon";
import type {
  BuildPath,
  CounterInsufficiencyReason,
  CounterRecommendationGroup,
  DraftSlot,
  DraftSnapshot,
  EvidenceLabel,
  EvidenceMetrics,
  FrozenRecommendationBundle,
  ItemRef,
  LeagueSnapshot,
  Role,
  RuneRecommendation,
  SpellPairRecommendation,
} from "./types";

interface PathInteractionProps {
  selectedPathId?: string;
  onSelectPath: (pathId: string) => void;
}

const roleLabels: Record<Role, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MID: "Mid",
  ADC: "Bot / ADC",
  SUPPORT: "Support",
};

const evidenceLabels: Record<EvidenceLabel, string> = {
  strong: "Strong evidence",
  moderate: "Moderate evidence",
  limited: "Limited evidence",
  insufficient: "Insufficient evidence",
};

const insufficiencyCopy: Record<CounterInsufficiencyReason, string> = {
  no_matching_data: "No same-role matchup sample is available for this patch and region.",
  sample_too_small: "The current-patch sample is below the minimum evidence floor.",
  player_breadth_too_low: "Too few unique players contributed to this result.",
  player_concentration_too_high: "The result is too concentrated among a small number of players.",
  evidence_too_weak: "The available observations do not form a sufficiently reliable signal.",
  lift_not_supported: "The adjusted lift and uncertainty interval do not support a counter label.",
};

const runeKindLabels: Record<RuneRecommendation["kind"], string> = {
  most_frequent: "Most frequently observed",
  highest_supported: "Highest-supported alternative",
  matchup_alternative: "Matchup-specific alternative",
  matchup_defensive_or_scaling: "Defensive or scaling alternative",
};

const styleNames: Record<number, string> = {
  8000: "Precision",
  8100: "Domination",
  8200: "Sorcery",
  8300: "Inspiration",
  8400: "Resolve",
};

const perkNames: Record<number, string> = {
  8126: "Cheap Shot",
  8128: "Dark Harvest",
  8135: "Treasure Hunter",
  8138: "Eyeball Collection",
  8210: "Transcendence",
  8226: "Manaflow Band",
  8230: "Phase Rush",
  8237: "Scorch",
  8304: "Magical Footwear",
  8345: "Biscuit Delivery",
  8347: "Cosmic Insight",
  8369: "First Strike",
};

const formatPercent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const formatSigned = (value: number, digits = 0) => `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Refresh time unavailable";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTimer(remainingMs?: number): string {
  const seconds = Math.max(Math.ceil((remainingMs ?? 0) / 1_000), 0);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Panel({
  icon,
  eyebrow,
  title,
  detail,
  children,
  className = "",
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  detail?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`companion-panel ${className}`.trim()}>
      <header className="companion-panel__heading">
        <span className="companion-panel__icon" aria-hidden="true">{icon}</span>
        <div>
          <span className="companion-kicker">{eyebrow}</span>
          <h2>{title}</h2>
          {detail ? <p>{detail}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export function EvidenceDetails({
  evidence,
  patch,
  title = "Evidence details",
}: {
  evidence: EvidenceMetrics;
  patch: string;
  title?: string;
}) {
  const lift = evidence.adjustedWinRate - evidence.baselineWinRate;
  return (
    <details className="evidence-details">
      <summary>
        <span>{title}</span>
        <span className={`evidence-label evidence-label--${evidence.label}`}>
          {evidenceLabels[evidence.label]}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="evidence-details__body">
        <dl className="evidence-grid">
          <div><dt>Raw win rate</dt><dd>{formatPercent(evidence.rawWinRate)}</dd></div>
          <div><dt>Adjusted win rate</dt><dd>{formatPercent(evidence.adjustedWinRate)}</dd></div>
          <div><dt>Baseline lift</dt><dd>{formatSigned(lift * 100, 1)} pp</dd></div>
          <div>
            <dt>95% raw-WR interval</dt>
            <dd>{formatPercent(evidence.interval95.low)}–{formatPercent(evidence.interval95.high)}</dd>
          </div>
          <div><dt>Sample</dt><dd>{evidence.sampleSize.toLocaleString()} games</dd></div>
          <div><dt>Unique players</dt><dd>{evidence.uniquePlayers.toLocaleString()}</dd></div>
          <div><dt>Top-player share</dt><dd>{formatPercent(evidence.topPlayerShare)}</dd></div>
          <div><dt>Player concentration (HHI)</dt><dd>{evidence.playerConcentrationHhi === undefined ? "Not reported" : evidence.playerConcentrationHhi.toFixed(3)}</dd></div>
          <div><dt>Observed frequency</dt><dd>{evidence.frequency === undefined ? "Not reported" : formatPercent(evidence.frequency)}</dd></div>
          <div><dt>Gold at 15</dt><dd>{formatSigned(evidence.deltas15.gold)}</dd></div>
          <div><dt>CS at 15</dt><dd>{formatSigned(evidence.deltas15.cs, 1)}</dd></div>
          <div><dt>XP at 15</dt><dd>{formatSigned(evidence.deltas15.xp)}</dd></div>
          <div><dt>Data patch</dt><dd>{patch}</dd></div>
        </dl>
        <p className="evidence-caveat">
          These are observational aggregates, not a guarantee or a causal estimate.
          {evidence.earlyGameSampleSize !== undefined
            ? ` Early-lane deltas use ${evidence.earlyGameSampleSize.toLocaleString()} observations.`
            : ""}
        </p>
      </div>
    </details>
  );
}

function EvidenceHeadline({ evidence }: { evidence: EvidenceMetrics }) {
  return (
    <div className="evidence-headline" aria-label="Evidence summary">
      <span className={`evidence-label evidence-label--${evidence.label}`}>
        {evidenceLabels[evidence.label]}
      </span>
      <span>{evidence.sampleSize.toLocaleString()} games</span>
      <span>{formatPercent(evidence.adjustedWinRate)} adjusted WR</span>
      <span>95% {formatPercent(evidence.interval95.low)}–{formatPercent(evidence.interval95.high)}</span>
    </div>
  );
}

function DraftTeam({ title, slots }: { title: string; slots: readonly DraftSlot[] }) {
  return (
    <section className="draft-team" aria-label={title}>
      <h3>{title}</h3>
      <ol>
        {slots.map((slot) => (
          <li key={`${slot.team}-${slot.slot}`} className={`draft-slot draft-slot--${slot.selectionState}`}>
            {slot.champion ? (
              <ChampionAvatar name={slot.champion.name} size="small" muted={slot.team === "enemy"} />
            ) : (
              <span className="draft-slot__unknown" aria-hidden="true">?</span>
            )}
            <span className="draft-slot__copy">
              <strong>{slot.champion?.name ?? "Not visible"}</strong>
              <small>
                {slot.role ? roleLabels[slot.role] : slot.team === "enemy" ? "Role not inferred" : "Role pending"}
              </small>
            </span>
            {slot.isLocal ? <span className="local-slot-badge">You</span> : null}
            {slot.selectionState === "locked" ? <Lock size={12} aria-label="Locked" /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function DraftBoard({ draft }: { draft?: DraftSnapshot }) {
  if (!draft) {
    return (
      <div className="companion-empty companion-empty--compact">
        <AlertTriangle size={19} aria-hidden="true" />
        <div><strong>Draft details are temporarily unavailable.</strong><span>The connector will retry without exposing player identities.</span></div>
      </div>
    );
  }

  return (
    <Panel
      icon={<Swords size={18} />}
      eyebrow="Visible draft"
      title="Champion select"
      detail="Only champion slots and assigned local context are represented. Hidden identities stay hidden."
      className="draft-panel"
    >
      <div className="draft-context">
        <div>
          <span>Local selection</span>
          <strong>{draft.localChampion?.name ?? "Waiting for selection"}</strong>
        </div>
        <div>
          <span>Assigned role</span>
          <strong>{draft.assignedRole ? roleLabels[draft.assignedRole] : "Pending"}</strong>
        </div>
        <div>
          <span>{draft.timer?.phase ?? "Draft phase"}</span>
          <strong className="draft-timer"><Clock3 size={16} aria-hidden="true" />{formatTimer(draft.timer?.remainingMs)}</strong>
        </div>
        <div>
          <span>Current spells</span>
          <strong>{draft.currentSpells?.map((spell) => spell.name).join(" + ") ?? "Not available"}</strong>
        </div>
        <div>
          <span>Current runes</span>
          <strong>
            {draft.currentRunes
              ? `${styleNames[draft.currentRunes.primaryStyleId] ?? `Style ${draft.currentRunes.primaryStyleId}`} + ${styleNames[draft.currentRunes.secondaryStyleId] ?? `Style ${draft.currentRunes.secondaryStyleId}`}`
              : "Not available"}
          </strong>
        </div>
      </div>

      <div className="draft-teams">
        <DraftTeam title="Allied selections" slots={draft.allies} />
        <div className="draft-versus" aria-hidden="true">VS</div>
        <DraftTeam title="Visible enemy selections" slots={draft.enemies} />
      </div>

      <div className="draft-bans">
        <span><EyeOff size={14} aria-hidden="true" /> Picks and bans</span>
        <ul>
          {draft.bans.length > 0 ? draft.bans.map((ban) => (
            <li key={`${ban.team}-${ban.slot}`}>
              <span className={`ban-team ban-team--${ban.team}`}>{ban.team}</span>
              {ban.champion?.name ?? "Pending"}
            </li>
          )) : <li>No completed bans are visible yet.</li>}
        </ul>
      </div>
    </Panel>
  );
}

function CounterGroup({ group, patch }: { group: CounterRecommendationGroup; patch: string }) {
  return (
    <article className="counter-group">
      <header className="counter-group__heading">
        <ChampionAvatar name={group.opponent.name} muted />
        <div>
          <span className="companion-kicker">Visible selection</span>
          <h3>{group.opponent.name}</h3>
          <p>Checked against {roleLabels[group.role]} data; the enemy role is not inferred.</p>
        </div>
      </header>

      {group.status === "insufficient_evidence" ? (
        <div className="insufficient-card">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Not enough evidence to call a counter</strong>
            <p>{insufficiencyCopy[group.reason ?? "evidence_too_weak"]}</p>
          </div>
        </div>
      ) : (
        <div className="counter-candidates">
          {group.candidates.slice(0, 3).map((candidate, index) => (
            <article className="counter-candidate" key={candidate.id}>
              <header>
                <span className="counter-candidate__rank">Option {index + 1}</span>
                <span className={`evidence-label evidence-label--${candidate.evidence.label}`}>
                  {evidenceLabels[candidate.evidence.label]}
                </span>
              </header>
              <div className="counter-candidate__identity">
                <ChampionAvatar name={candidate.champion.name} size="large" />
                <div>
                  <h4>{candidate.champion.name}</h4>
                  <span>{roleLabels[candidate.role]} · patch {candidate.patch}</span>
                </div>
                <strong>{formatSigned((candidate.evidence.adjustedWinRate - candidate.evidence.baselineWinRate) * 100, 1)} pp</strong>
              </div>
              <ul className="reason-list">
                {candidate.explanations.map((explanation) => <li key={explanation}>{explanation}</li>)}
              </ul>
              <EvidenceHeadline evidence={candidate.evidence} />
              <div className="compatibility-row">
                <span>Composition compatibility</span>
                <strong>
                  {candidate.compositionCompatibility === undefined
                    ? "Not yet modeled"
                    : formatPercent(candidate.compositionCompatibility, 0)}
                </strong>
              </div>
              {candidate.relevantBalanceChange ? (
                <p className={`balance-change balance-change--${candidate.relevantBalanceChange.severity}`}>
                  <AlertTriangle size={13} aria-hidden="true" />
                  {candidate.relevantBalanceChange.patch}: {candidate.relevantBalanceChange.summary}
                </p>
              ) : null}
              <EvidenceDetails evidence={candidate.evidence} patch={patch} />
            </article>
          ))}
        </div>
      )}
    </article>
  );
}

function CounterRecommendations({ plan }: { plan?: FrozenRecommendationBundle }) {
  return (
    <Panel
      icon={<Shield size={18} />}
      eyebrow="Pick options"
      title="Supported matchup candidates"
      detail="Up to three candidates per visible enemy selection. Unsupported results remain explicitly inconclusive."
    >
      {!plan ? (
        <RecommendationUnavailable kind="counter" />
      ) : plan.counterGroups.length === 0 ? (
        <div className="insufficient-card">
          <AlertTriangle size={18} aria-hidden="true" />
          <div><strong>No counter recommendation is supported.</strong><p>No visible selection clears the current sample and confidence requirements.</p></div>
        </div>
      ) : (
        <div className="counter-groups">
          {plan.counterGroups.map((group) => (
            <CounterGroup key={`${group.opponent.id}-${group.role}`} group={group} patch={plan.patch} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function RecommendationUnavailable({ kind }: { kind: "counter" | "rune" | "spell" | "item" }) {
  const nouns = { counter: "Counter", rune: "Rune", spell: "Summoner spell", item: "Item-path" };
  return (
    <div className="companion-empty companion-empty--compact">
      <Database size={18} aria-hidden="true" />
      <div>
        <strong>{nouns[kind]} recommendations are unavailable.</strong>
        <span>The live connector will not substitute synthetic values. Cached or backend evidence is required.</span>
      </div>
    </div>
  );
}

function RuneCards({ plan, compact = false }: { plan?: FrozenRecommendationBundle; compact?: boolean }) {
  if (!plan) return <RecommendationUnavailable kind="rune" />;
  if (plan.runePages.length === 0) {
    return <div className="insufficient-card"><AlertTriangle size={17} /><div><strong>No supported rune page</strong><p>The available sample does not clear the evidence floor.</p></div></div>;
  }
  return (
    <div className={`rune-grid ${compact ? "rune-grid--compact" : ""}`}>
      {plan.runePages.slice(0, 3).map((rune) => (
        <article className="loadout-card" key={rune.id}>
          <span className="loadout-card__kind">{runeKindLabels[rune.kind]}</span>
          <h3>{rune.title}</h3>
          <p>{rune.explanation}</p>
          <div className="rune-styles">
            <strong>{styleNames[rune.page.primaryStyleId] ?? `Style ${rune.page.primaryStyleId}`}</strong>
            <span>+</span>
            <strong>{styleNames[rune.page.secondaryStyleId] ?? `Style ${rune.page.secondaryStyleId}`}</strong>
          </div>
          <ul className="perk-list">
            {rune.page.selectedPerkIds.map((perkId) => <li key={perkId}>{perkNames[perkId] ?? `Perk ${perkId}`}</li>)}
          </ul>
          <EvidenceHeadline evidence={rune.evidence} />
          {!compact ? <EvidenceDetails evidence={rune.evidence} patch={plan.patch} /> : (
            <span className="compact-evidence">{rune.evidence.sampleSize} games · {formatPercent(rune.evidence.adjustedWinRate)} adjusted WR</span>
          )}
        </article>
      ))}
    </div>
  );
}

function SpellCards({ plan, compact = false }: { plan?: FrozenRecommendationBundle; compact?: boolean }) {
  if (!plan) return <RecommendationUnavailable kind="spell" />;
  if (plan.spellPairs.length === 0) {
    return <div className="insufficient-card"><AlertTriangle size={17} /><div><strong>No supported spell pair</strong><p>The current context has insufficient evidence.</p></div></div>;
  }
  return (
    <div className={`spell-grid ${compact ? "spell-grid--compact" : ""}`}>
      {plan.spellPairs.slice(0, 3).map((pair) => (
        <article className="loadout-card spell-card" key={pair.id}>
          <div className="spell-pair" aria-label={pair.spells.map((spell) => spell.name).join(" and ")}>
            {pair.spells.map((spell) => <strong key={spell.id}>{spell.name}</strong>)}
          </div>
          <p>{pair.explanation}</p>
          <EvidenceHeadline evidence={pair.evidence} />
          {!compact ? <EvidenceDetails evidence={pair.evidence} patch={plan.patch} /> : (
            <span className="compact-evidence">{pair.evidence.sampleSize} games · {formatPercent(pair.evidence.frequency ?? 0)} frequency</span>
          )}
        </article>
      ))}
    </div>
  );
}

function LoadoutRecommendations({ plan }: { plan?: FrozenRecommendationBundle }) {
  return (
    <div className="loadout-panels">
      <Panel
        icon={<Sparkles size={18} />}
        eyebrow="Runes"
        title="Observed rune pages"
        detail="Frequency, support, and a matchup-oriented alternative stay separate."
      >
        <RuneCards plan={plan} />
      </Panel>
      <Panel
        icon={<ScrollText size={18} />}
        eyebrow="Summoner spells"
        title="Supported spell pairs"
        detail="Scoped to champion, role, visible threat context, queue, and map."
      >
        <SpellCards plan={plan} />
      </Panel>
    </div>
  );
}

interface PathItem {
  item: ItemRef;
  stage: string;
}

function corePathItems(path: BuildPath): PathItem[] {
  const values: PathItem[] = [
    ...path.startingItems.map((item) => ({ item, stage: "Start" })),
    { item: path.firstCompletedItem, stage: "First item" },
    { item: path.boots, stage: "Boots" },
    ...path.coreItems
      .filter((item) => item.id !== path.firstCompletedItem.id)
      .map((item) => ({ item, stage: "Core" })),
  ];
  const seen = new Set<number>();
  return values.filter(({ item }) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function BuildPathCard({
  path,
  patch,
  selected,
  onSelect,
  checklist,
}: {
  path: BuildPath;
  patch: string;
  selected: boolean;
  onSelect: () => void;
  checklist?: {
    detectedOwnedItemIds: ReadonlySet<number>;
    manualOwnedItemIds: ReadonlySet<number>;
    onToggleManualItem: (itemId: number) => void;
  };
}) {
  return (
    <article className={`path-card ${selected ? "path-card--selected" : ""}`}>
      <header className="path-card__heading">
        <div>
          <span className={`path-kind path-kind--${path.kind}`}>{path.kind}</span>
          <h3>{path.title}</h3>
        </div>
        {selected ? <span className="selected-path-label"><Check size={13} />Marked</span> : null}
      </header>
      <p className="path-explanation">{path.explanation}</p>
      <button className="mark-path-button" type="button" aria-pressed={selected} onClick={onSelect}>
        {selected ? "Marked for this match" : "Mark this option"}
      </button>

      <ol className={`path-sequence ${checklist ? "path-sequence--checklist" : ""}`}>
        {corePathItems(path).map(({ item, stage }) => {
          const detected = checklist?.detectedOwnedItemIds.has(item.id) ?? false;
          const manuallyOwned = checklist?.manualOwnedItemIds.has(item.id) ?? false;
          const owned = detected || manuallyOwned;
          return (
            <li key={item.id} className={owned ? "path-item path-item--owned" : "path-item"}>
              {checklist ? (
                <input
                  type="checkbox"
                  checked={owned}
                  disabled={detected}
                  onChange={() => checklist.onToggleManualItem(item.id)}
                  aria-label={`${item.name} owned${detected ? " (detected)" : ""}`}
                />
              ) : <span className="path-item__dot" aria-hidden="true" />}
              <span><small>{stage}</small><strong>{item.name}</strong></span>
              {detected ? <em>Detected</em> : manuallyOwned ? <em>Marked</em> : null}
            </li>
          );
        })}
      </ol>

      {path.situationalOptions.length > 0 ? (
        <div className="situational-options">
          {path.situationalOptions.map((option) => (
            <div key={option.id}>
              <span>{option.condition}</span>
              <strong>{option.items.map((item) => item.name).join(" + ")}</strong>
              <p>{option.explanation}</p>
            </div>
          ))}
        </div>
      ) : null}

      <p className="bias-warning"><AlertTriangle size={13} aria-hidden="true" />{path.biasWarning}</p>
      <EvidenceHeadline evidence={path.evidence} />
      <EvidenceDetails evidence={path.evidence} patch={patch} />
    </article>
  );
}

function BuildPaths({
  plan,
  selectedPathId,
  onSelectPath,
  checklist,
}: {
  plan?: FrozenRecommendationBundle;
  checklist?: {
    detectedOwnedItemIds: ReadonlySet<number>;
    manualOwnedItemIds: ReadonlySet<number>;
    onToggleManualItem: (itemId: number) => void;
  };
} & PathInteractionProps) {
  if (!plan) return <RecommendationUnavailable kind="item" />;
  if (plan.itemPaths.length === 0) {
    return <div className="insufficient-card"><AlertTriangle size={17} /><div><strong>No supported item path</strong><p>The current sample does not support a path recommendation.</p></div></div>;
  }
  return (
    <div className="path-grid">
      {plan.itemPaths.slice(0, 3).map((path) => (
        <BuildPathCard
          key={path.id}
          path={path}
          patch={plan.patch}
          selected={selectedPathId === path.id}
          onSelect={() => onSelectPath(path.id)}
          checklist={checklist}
        />
      ))}
    </div>
  );
}

function PlanContext({
  plan,
  message,
  loading = false,
}: {
  plan?: FrozenRecommendationBundle;
  message?: string;
  loading?: boolean;
}) {
  if (!plan) {
    return (
      <div className="plan-context plan-context--unavailable" role="status">
        <Database size={16} aria-hidden="true" />
        <span>
          <strong>{loading ? "Loading exact-patch evidence" : "Recommendation source unavailable"}</strong>
          {` · ${message ?? "waiting for cached or backend aggregates"}`}
        </span>
      </div>
    );
  }
  return (
    <div className={`plan-context ${plan.dataStatus === "stale" ? "plan-context--stale" : ""}`.trim()} role="status">
      <Database size={16} aria-hidden="true" />
      <span><strong>Patch {plan.patch}</strong> · {plan.region} · {plan.queue.name} · {plan.map.name}</span>
      <span>{plan.dataStatus === "stale" ? "Cached exact-patch data" : "Data refreshed"} {formatTimestamp(plan.refreshedAt)}</span>
      {plan.dataNotice ? <em>{plan.dataNotice}</em> : null}
    </div>
  );
}

export function PreparedPlanSummary({
  plan,
  catalog,
  dataDragonVersion,
}: {
  plan: FrozenRecommendationBundle;
  catalog?: DataDragonCatalog;
  dataDragonVersion?: string;
}) {
  return (
    <section className="prepared-summary" aria-label="Prepared recommendation summary">
      <div>
        <ChampionAvatar
          name={plan.localChampion?.name ?? "Local champion"}
          championId={plan.localChampion?.id}
          assetKey={plan.localChampion ? catalog?.championAssetKeys?.[plan.localChampion.id] : undefined}
          dataDragonVersion={dataDragonVersion}
          size="large"
        />
        <span><small>Prepared for</small><strong>{plan.localChampion?.name ?? "Selected champion"} · {plan.role ? roleLabels[plan.role] : "Role pending"}</strong></span>
      </div>
      <dl>
        <div><dt>Rune pages</dt><dd>{plan.runePages.length}</dd></div>
        <div><dt>Spell pairs</dt><dd>{plan.spellPairs.length}</dd></div>
        <div><dt>Item paths</dt><dd>{plan.itemPaths.length}</dd></div>
        <div><dt>Patch</dt><dd>{plan.patch}</dd></div>
      </dl>
    </section>
  );
}

export function ChampionSelectView({
  snapshot,
  plan,
  recommendationMessage,
  recommendationsLoading,
  selectedPathId,
  onSelectPath,
}: {
  snapshot: LeagueSnapshot;
  plan?: FrozenRecommendationBundle;
  recommendationMessage?: string;
  recommendationsLoading?: boolean;
} & PathInteractionProps) {
  return (
    <main className="companion-main">
      <div className="companion-page-heading">
        <div>
          <span className="companion-kicker">Live, local draft context</span>
          <h1>Champion-select options</h1>
          <p>Multiple evidence-backed choices, with uncertainty beside every result.</p>
        </div>
        <span className="read-only-badge"><Lock size={14} aria-hidden="true" />Read-only MVP</span>
      </div>
      <PlanContext plan={plan} message={recommendationMessage} loading={recommendationsLoading} />
      <DraftBoard draft={snapshot.draft} />
      <CounterRecommendations plan={plan} />
      <LoadoutRecommendations plan={plan} />
      <Panel
        icon={<Layers3 size={18} />}
        eyebrow="Item paths"
        title="Several routes, not one command"
        detail="Starting items, first completion, boots, core, and situational alternatives remain distinct."
      >
        <BuildPaths plan={plan} selectedPathId={selectedPathId} onSelectPath={onSelectPath} />
      </Panel>
    </main>
  );
}

export function InGameOverlay({
  snapshot,
  plan,
  selectedPathId,
  onSelectPath,
  detectedOwnedItemIds,
  manualOwnedItemIds,
  onToggleManualItem,
  onOpenResearch,
  bridgeLabel,
  catalog,
  dataDragonVersion,
}: {
  snapshot: LeagueSnapshot;
  plan?: FrozenRecommendationBundle;
  detectedOwnedItemIds: ReadonlySet<number>;
  manualOwnedItemIds: ReadonlySet<number>;
  onToggleManualItem: (itemId: number) => void;
  onOpenResearch: () => void;
  bridgeLabel: string;
  catalog?: DataDragonCatalog;
  dataDragonVersion?: string;
} & PathInteractionProps) {
  const championName = plan?.localChampion?.name ?? snapshot.activeGame?.localChampion?.name ?? "Selected champion";
  return (
    <main className="companion-overlay" aria-label="Static in-game recommendation overlay">
      <header className="overlay-header">
        <div className="companion-brand">
          <span className="companion-brand__mark" aria-hidden="true"><Gamepad2 size={18} /></span>
          <span><strong>Static match plan</strong><small>{bridgeLabel}</small></span>
        </div>
        <div className="overlay-header__identity">
          <ChampionAvatar
            name={championName}
            championId={plan?.localChampion?.id ?? snapshot.activeGame?.localChampion?.id}
            assetKey={catalog?.championAssetKeys?.[plan?.localChampion?.id ?? snapshot.activeGame?.localChampion?.id ?? 0]}
            dataDragonVersion={dataDragonVersion}
            size="small"
          />
          <span><strong>{championName}</strong><small>{plan?.role ? roleLabels[plan.role] : "Role unavailable"}</small></span>
        </div>
        <button className="companion-research-link" type="button" onClick={onOpenResearch}>
          <BarChart3 size={14} /> Research
        </button>
      </header>

      <div className="static-plan-notice">
        <Lock size={15} aria-hidden="true" />
        <span>
          <strong>Prepared during champion select.</strong> Options remain static for this match and do not react to hidden or rapidly changing game state.
        </span>
        {plan ? <em>Patch {plan.patch} · frozen {formatTimestamp(plan.frozenAt)}</em> : null}
      </div>

      {!plan ? (
        <div className="overlay-unavailable">
          <Database size={24} aria-hidden="true" />
          <strong>No prepared recommendation bundle</strong>
          <p>The live overlay does not generate or substitute recommendations after the match begins.</p>
        </div>
      ) : (
        <div className="overlay-content">
          <section className="overlay-loadout" aria-label="Prepared runes and summoner spells">
            <div>
              <span className="companion-kicker">Runes</span>
              <RuneCards plan={plan} compact />
            </div>
            <div>
              <span className="companion-kicker">Summoner spells</span>
              <SpellCards plan={plan} compact />
            </div>
          </section>

          <section className="overlay-paths" aria-labelledby="overlay-paths-title">
            <header>
              <div>
                <span className="companion-kicker">Item checklist</span>
                <h2 id="overlay-paths-title">Prepared paths</h2>
              </div>
              <span>Detected ownership updates locally; manual marks stay on this device.</span>
            </header>
            <BuildPaths
              plan={plan}
              selectedPathId={selectedPathId}
              onSelectPath={onSelectPath}
              checklist={{ detectedOwnedItemIds, manualOwnedItemIds, onToggleManualItem }}
            />
          </section>
        </div>
      )}
    </main>
  );
}
