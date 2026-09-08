import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  Clock3,
  Database,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ChampionAvatar } from "../components/ChampionAvatar";
import type { DataDragonCatalog, DataDragonRuneStyle } from "./dataDragon";
import type {
  OpggBanAdvice,
  OpggCounterReference,
  OpggDraftGuide,
  OpggObservedEvidence,
} from "./opgg-client";
import type {
  ChampionRef,
  DraftSlot,
  EvidenceMetrics,
  FrozenRecommendationBundle,
  LeagueSnapshot,
  Role,
  RuneRecommendation,
} from "./types";

const roleLabels: Record<Role, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MID: "Mid",
  ADC: "Bot",
  SUPPORT: "Support",
};

const runeKindLabels: Record<RuneRecommendation["kind"], string> = {
  most_frequent: "Most played",
  highest_supported: "Highest support",
  matchup_alternative: "Matchup option",
  matchup_defensive_or_scaling: "Defensive / scaling",
};

const shardNames: Record<number, string> = {
  5001: "Scaling health",
  5002: "Armor",
  5003: "Magic resist",
  5005: "Attack speed",
  5007: "Ability haste",
  5008: "Adaptive force",
  5010: "Move speed",
  5011: "Health",
  5013: "Tenacity",
};

const fallbackStyleNames: Record<number, string> = {
  8000: "Precision",
  8100: "Domination",
  8200: "Sorcery",
  8300: "Inspiration",
  8400: "Resolve",
};

type Path = FrozenRecommendationBundle["itemPaths"][number];
type Rune = FrozenRecommendationBundle["runePages"][number];
type SpellPair = FrozenRecommendationBundle["spellPairs"][number];

interface DraftWorkspaceProps {
  snapshot: LeagueSnapshot;
  plan?: FrozenRecommendationBundle;
  catalog?: DataDragonCatalog;
  dataDragonVersion?: string;
  recommendationMessage?: string;
  recommendationsLoading?: boolean;
  opggGuide?: OpggDraftGuide;
  opggMessage?: string;
  opggLoading?: boolean;
  banAdvice?: OpggBanAdvice;
  banAdviceMessage?: string;
  banAdviceLoading?: boolean;
  selectedPathId?: string;
  onSelectPath: (pathId: string) => void;
  selectedRuneId?: string;
  onSelectRune: (runeId: string) => void;
  selectedSpellPairId?: string;
  onSelectSpellPair: (pairId: string) => void;
  plannedChampion?: ChampionRef;
  onPlanChampion: (champion: ChampionRef) => void;
  selectedOpponentId?: number;
  onSelectOpponent: (championId: number) => void;
  selectedRole?: Role;
  onSelectRole: (role: Role) => void;
  customGameTestMode: boolean;
  onCustomGameTestModeChange: (enabled: boolean) => void;
  previewControls: boolean;
}

function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatTimer(remainingMs?: number): string {
  const seconds = Math.max(Math.ceil((remainingMs ?? 0) / 1_000), 0);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function championName(champion: ChampionRef | undefined, catalog?: DataDragonCatalog): string {
  if (!champion) return "Not selected";
  return catalog?.championNames[champion.id] ?? champion.name;
}

function championFromId(id: number, catalog?: DataDragonCatalog): ChampionRef {
  return { id, name: catalog?.championNames[id] ?? `Champion ${id}` };
}

function Portrait({
  champion,
  catalog,
  version,
  size = "medium",
  muted = false,
}: {
  champion?: ChampionRef;
  catalog?: DataDragonCatalog;
  version?: string;
  size?: "small" | "medium" | "large";
  muted?: boolean;
}) {
  if (!champion) return <span className={`draft-empty-portrait draft-empty-portrait--${size}`}>?</span>;
  return (
    <ChampionAvatar
      name={championName(champion, catalog)}
      championId={champion.id}
      assetKey={catalog?.championAssetKeys?.[champion.id]}
      dataDragonVersion={version}
      size={size}
      muted={muted}
    />
  );
}

function BanAdvisor({
  advice,
  loading,
  message,
  catalog,
  version,
}: {
  advice?: OpggBanAdvice;
  loading: boolean;
  message?: string;
  catalog?: DataDragonCatalog;
  version?: string;
}) {
  const [primary, ...alternatives] = advice?.candidates ?? [];
  return (
    <section className="ban-advisor" aria-label="Recommended ban">
      <div className="ban-advisor__heading">
        <span><ShieldCheck size={12} />Suggested ban</span>
        {advice ? <small>OP.GG · 60% matchup / 40% meta</small> : null}
      </div>
      {loading ? (
        <div className="ban-advisor__empty"><span className="recommendation-status__spinner" />Checking meta…</div>
      ) : primary ? (
        <>
          <div className="ban-advisor__primary">
            <Portrait champion={primary.champion} catalog={catalog} version={version} size="small" />
            <span><strong>{championName(primary.champion, catalog)}</strong><small>{primary.score}/100 priority · {primary.evidenceLabel} evidence{primary.personalAdjustment ? ` · personal +${primary.personalAdjustment}` : ""}</small></span>
          </div>
          <dl className="ban-advisor__metrics">
            <div><dt>Vs you</dt><dd>{formatPercent(primary.counterWinRate, 0)}</dd></div>
            <div><dt>Matchup</dt><dd>{primary.matchupSampleSize.toLocaleString()} games</dd></div>
            <div><dt>Meta</dt><dd>Tier {primary.metaTier} · #{primary.metaRank}</dd></div>
            <div><dt>Presence</dt><dd>{formatPercent(primary.metaPickRate + primary.metaBanRate, 0)}</dd></div>
            {primary.personalGames ? <div><dt>Your recent</dt><dd>{primary.personalGames} games · {formatPercent(primary.personalLossRate ?? 0, 0)} losses</dd></div> : null}
          </dl>
          {alternatives.length > 0 ? (
            <div className="ban-advisor__alternatives" aria-label="Alternative bans">
              <small>Alternatives</small>
              {alternatives.map((candidate) => (
                <span key={candidate.champion.id} title={`${candidate.score}/100 · ${formatPercent(candidate.counterWinRate)} against your champion · Meta #${candidate.metaRank}`}>
                  <Portrait champion={candidate.champion} catalog={catalog} version={version} size="small" />
                  <b>{championName(candidate.champion, catalog)}</b>
                </span>
              ))}
            </div>
          ) : null}
          <details className="ban-advisor__method">
            <summary>Why this ban?<ChevronDown size={12} /></summary>
            <p>{championName(primary.champion, catalog)} wins {formatPercent(primary.counterWinRate)} of {primary.matchupSampleSize.toLocaleString()} observed games against {championName(advice?.champion, catalog)} (95% interval {formatPercent(primary.interval95.low)}–{formatPercent(primary.interval95.high)}), and is Tier {primary.metaTier}, rank #{primary.metaRank} in the current {roleLabels[advice!.role]} meta. The matchup rate is shrunk toward 50% before scoring.{primary.personalAdjustment ? ` Your recent history adds ${primary.personalAdjustment} points; this modifier is capped at 8.` : ""}</p>
          </details>
        </>
      ) : (
        <div className="ban-advisor__empty">{message ?? "Select your champion and role to compare counters with the current meta."}</div>
      )}
    </section>
  );
}

function AssetIcon({
  src,
  label,
  fallback,
}: {
  src?: string;
  label: string;
  fallback: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="loadout-asset" title={label}>
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <b>{fallback}</b>}
    </span>
  );
}

function Roster({
  title,
  slots,
  catalog,
  version,
  selectedOpponentId,
  onSelectOpponent,
}: {
  title: string;
  slots: readonly DraftSlot[];
  catalog?: DataDragonCatalog;
  version?: string;
  selectedOpponentId?: number;
  onSelectOpponent?: (championId: number) => void;
}) {
  const isEnemy = slots[0]?.team === "enemy";
  return (
    <aside className={`draft-roster draft-roster--${isEnemy ? "enemy" : "ally"}`} aria-label={title}>
      <header>
        <span>{title}</span>
        <small>{slots.filter((slot) => slot.champion).length}/5 visible</small>
      </header>
      <ol>
        {slots.map((slot) => {
          const name = championName(slot.champion, catalog);
          const selected = Boolean(isEnemy && slot.champion?.id === selectedOpponentId);
          const content = (
            <>
              <Portrait champion={slot.champion} catalog={catalog} version={version} muted={isEnemy} />
              <span className="draft-roster__copy">
                <strong>{slot.champion ? name : isEnemy ? "Hidden pick" : "Waiting"}</strong>
                <small>{slot.role ? roleLabels[slot.role] : slot.isLocal ? "You" : "Role pending"}</small>
              </span>
              {slot.selectionState === "locked" ? <Lock size={12} aria-label="Locked" /> : null}
            </>
          );
          return (
            <li
              key={`${slot.team}-${slot.slot}`}
              className={`${slot.isLocal ? "is-local" : ""} ${selected ? "is-opponent" : ""}`.trim()}
            >
              {isEnemy && slot.champion ? (
                <button type="button" onClick={() => onSelectOpponent?.(slot.champion!.id)} aria-pressed={selected}>
                  {content}
                </button>
              ) : <div>{content}</div>}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function EvidenceLine({ evidence }: { evidence: EvidenceMetrics }) {
  const lift = (evidence.adjustedWinRate - evidence.baselineWinRate) * 100;
  return (
    <div className="draft-evidence-line">
      <span className={`evidence-label evidence-label--${evidence.label}`}>{evidence.label}</span>
      <span><strong>{evidence.sampleSize.toLocaleString()}</strong> games</span>
      <span><strong>{formatPercent(evidence.adjustedWinRate)}</strong> adjusted WR</span>
      <span><strong>{lift > 0 ? "+" : ""}{lift.toFixed(1)} pp</strong> lift</span>
      <span>95% {formatPercent(evidence.interval95.low)}–{formatPercent(evidence.interval95.high)}</span>
    </div>
  );
}

function OpggEvidenceLine({ evidence }: { evidence: OpggObservedEvidence }) {
  return (
    <div className="draft-evidence-line draft-evidence-line--external">
      <span className="opgg-source-badge">OP.GG MCP</span>
      <span><strong>{evidence.sampleSize.toLocaleString()}</strong> games</span>
      <span><strong>{formatPercent(evidence.rawWinRate)}</strong> raw WR</span>
      {evidence.frequency === undefined ? null : <span><strong>{formatPercent(evidence.frequency)}</strong> played</span>}
      <span>95% {formatPercent(evidence.interval95.low)}–{formatPercent(evidence.interval95.high)}</span>
    </div>
  );
}

function ChampionSuggestions({
  plan,
  opponent,
  catalog,
  version,
  selectedChampion,
  externalSuggestions = [],
  onSelect,
  onOpenPicker,
}: {
  plan?: FrozenRecommendationBundle;
  opponent?: ChampionRef;
  catalog?: DataDragonCatalog;
  version?: string;
  selectedChampion?: ChampionRef;
  externalSuggestions?: readonly OpggCounterReference[];
  onSelect: (champion: ChampionRef) => void;
  onOpenPicker: () => void;
}) {
  const group = opponent
    ? plan?.counterGroups.find((candidateGroup) => candidateGroup.opponent.id === opponent.id)
    : plan?.counterGroups[0];
  const suggestions = group?.candidates.slice(0, 3) ?? [];
  const usingExternal = suggestions.length === 0 && externalSuggestions.length > 0;

  return (
    <section className="champion-suggestions" aria-label="Champion suggestions for the selected role and matchup">
      <div className="champion-suggestions__heading">
        <span><Sparkles size={14} /> Suggested for this matchup</span>
        <small>{opponent ? `${usingExternal ? "OP.GG global matchup reference into" : "Adjusted into"} ${championName(opponent, catalog)}` : "Waiting for a visible lane opponent"}</small>
      </div>
      <div className="champion-suggestions__list">
        {suggestions.length > 0 ? suggestions.map((candidate, index) => {
          const selected = selectedChampion?.id === candidate.champion.id;
          const lift = (candidate.evidence.adjustedWinRate - candidate.evidence.baselineWinRate) * 100;
          return (
            <button
              type="button"
              key={candidate.id}
              className={selected ? "suggested-champion is-selected" : "suggested-champion"}
              onClick={() => onSelect(candidate.champion)}
              aria-pressed={selected}
            >
              <span className="suggested-champion__rank">{index + 1}</span>
              <Portrait champion={candidate.champion} catalog={catalog} version={version} size="small" />
              <span><strong>{championName(candidate.champion, catalog)}</strong><small>{candidate.evidence.sampleSize} games · {lift > 0 ? "+" : ""}{lift.toFixed(1)} pp</small></span>
            </button>
          );
        }) : externalSuggestions.length > 0 ? externalSuggestions.slice(0, 3).map((candidate, index) => {
          const selected = selectedChampion?.id === candidate.champion.id;
          return (
            <button
              type="button"
              key={`opgg-${candidate.champion.id}`}
              className={selected ? "suggested-champion is-selected" : "suggested-champion"}
              onClick={() => onSelect(candidate.champion)}
              aria-pressed={selected}
            >
              <span className="suggested-champion__rank">{index + 1}</span>
              <Portrait champion={candidate.champion} catalog={catalog} version={version} size="small" />
              <span><strong>{championName(candidate.champion, catalog)}</strong><small>{candidate.sampleSize} games · {formatPercent(candidate.rawWinRate)} raw WR</small></span>
            </button>
          );
        }) : (
          <div className="suggestion-empty"><Database size={15} /><span>No candidate clears the evidence floor yet.</span></div>
        )}
        <button className="browse-champions" type="button" onClick={onOpenPicker}>
          <Search size={15} /> All champions
        </button>
      </div>
    </section>
  );
}

function itemUrl(version: string | undefined, id: number): string | undefined {
  return version ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${id}.png` : undefined;
}

function spellUrl(catalog: DataDragonCatalog | undefined, version: string | undefined, id: number): string | undefined {
  const key = catalog?.spellAssetKeys?.[id];
  return version && key ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${key}.png` : undefined;
}

function runeIconUrl(catalog: DataDragonCatalog | undefined, id: number): string | undefined {
  const path = catalog?.perkIcons?.[id] ?? catalog?.styleIcons?.[id];
  return path ? `https://ddragon.leagueoflegends.com/cdn/img/${path}` : undefined;
}

interface CustomRunePage {
  primaryStyleId: number;
  secondaryStyleId: number;
  selectedPerkIds: readonly number[];
  statShardIds: readonly number[];
}

const shardRows = [
  [5008, 5005, 5007],
  [5008, 5010, 5001],
  [5011, 5013, 5001],
] as const;

function defaultPrimaryPicks(style: DataDragonRuneStyle | undefined, current: readonly number[]): number[] {
  return style?.slots.map((slot) => slot.find((rune) => current.includes(rune.id))?.id ?? slot[0]?.id ?? 0).filter(Boolean) ?? [];
}

function defaultSecondaryPicks(style: DataDragonRuneStyle | undefined, current: readonly number[]): Record<number, number> {
  const result: Record<number, number> = {};
  style?.slots.forEach((slot, index) => {
    const selected = slot.find((rune) => current.includes(rune.id));
    if (selected && Object.keys(result).length < 2) result[index] = selected.id;
  });
  if (Object.keys(result).length < 2) {
    style?.slots.slice(1).forEach((slot, index) => {
      const slotIndex = index + 1;
      if (Object.keys(result).length < 2 && result[slotIndex] === undefined && slot[0]) result[slotIndex] = slot[0].id;
    });
  }
  return result;
}

function RuneEditor({
  catalog,
  initialPage,
  onSave,
  onClose,
}: {
  catalog: DataDragonCatalog;
  initialPage: CustomRunePage;
  onSave: (page: CustomRunePage) => void;
  onClose: () => void;
}) {
  const styles = catalog.runeStyles ?? [];
  const initialPrimary = styles.find((style) => style.id === initialPage.primaryStyleId) ?? styles[0];
  const initialSecondary = styles.find((style) => style.id === initialPage.secondaryStyleId && style.id !== initialPrimary?.id)
    ?? styles.find((style) => style.id !== initialPrimary?.id);
  const [primaryId, setPrimaryId] = useState(initialPrimary?.id ?? 0);
  const [secondaryId, setSecondaryId] = useState(initialSecondary?.id ?? 0);
  const [primaryPicks, setPrimaryPicks] = useState(() => defaultPrimaryPicks(initialPrimary, initialPage.selectedPerkIds));
  const [secondaryPicks, setSecondaryPicks] = useState<Record<number, number>>(() => defaultSecondaryPicks(initialSecondary, initialPage.selectedPerkIds));
  const [shards, setShards] = useState(() => shardRows.map((row, index) => initialPage.statShardIds[index] ?? row[0]));
  const primary = styles.find((style) => style.id === primaryId);
  const secondary = styles.find((style) => style.id === secondaryId);

  const choosePrimaryStyle = (style: DataDragonRuneStyle) => {
    setPrimaryId(style.id);
    setPrimaryPicks(defaultPrimaryPicks(style, []));
    if (secondaryId === style.id) {
      const next = styles.find((candidate) => candidate.id !== style.id);
      if (next) {
        setSecondaryId(next.id);
        setSecondaryPicks(defaultSecondaryPicks(next, []));
      }
    }
  };

  const chooseSecondaryStyle = (style: DataDragonRuneStyle) => {
    setSecondaryId(style.id);
    setSecondaryPicks(defaultSecondaryPicks(style, []));
  };

  const chooseSecondaryRune = (slotIndex: number, runeId: number) => {
    setSecondaryPicks((current) => {
      const next = { ...current };
      if (next[slotIndex] === runeId) {
        delete next[slotIndex];
        return next;
      }
      next[slotIndex] = runeId;
      const keys = Object.keys(next).map(Number);
      if (keys.length > 2) delete next[keys.find((key) => key !== slotIndex) ?? keys[0]!];
      return next;
    });
  };

  const canSave = primaryPicks.length === primary?.slots.length && Object.keys(secondaryPicks).length === 2;
  return (
    <div className="champion-picker-backdrop" role="presentation">
      <section className="rune-editor" role="dialog" aria-modal="true" aria-labelledby="rune-editor-title">
        <header>
          <div><span>Custom loadout</span><h2 id="rune-editor-title">Edit your rune page</h2><p>This is your choice, separate from the observed recommendations.</p></div>
          <button type="button" onClick={onClose} aria-label="Close rune editor"><X size={18} /></button>
        </header>
        <div className="rune-editor__body">
          <section>
            <h3>Primary tree</h3>
            <div className="rune-style-picker">
              {styles.map((style) => <button type="button" key={style.id} aria-pressed={style.id === primaryId} onClick={() => choosePrimaryStyle(style)}><AssetIcon src={runeIconUrl(catalog, style.id)} label={style.name} fallback="R" /><span>{style.name}</span></button>)}
            </div>
            <div className="rune-slot-picker rune-slot-picker--primary">
              {primary?.slots.map((slot, slotIndex) => (
                <div key={slotIndex}>{slot.map((rune) => <button type="button" key={rune.id} aria-pressed={primaryPicks[slotIndex] === rune.id} onClick={() => setPrimaryPicks((current) => current.map((value, index) => index === slotIndex ? rune.id : value))}><AssetIcon src={`https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`} label={rune.name} fallback="◆" /><span>{rune.name}</span></button>)}</div>
              ))}
            </div>
          </section>
          <section>
            <h3>Secondary tree</h3>
            <div className="rune-style-picker">
              {styles.filter((style) => style.id !== primaryId).map((style) => <button type="button" key={style.id} aria-pressed={style.id === secondaryId} onClick={() => chooseSecondaryStyle(style)}><AssetIcon src={runeIconUrl(catalog, style.id)} label={style.name} fallback="R" /><span>{style.name}</span></button>)}
            </div>
            <div className="rune-slot-picker rune-slot-picker--secondary">
              {secondary?.slots.slice(1).map((slot, index) => {
                const slotIndex = index + 1;
                return <div key={slotIndex}>{slot.map((rune) => <button type="button" key={rune.id} aria-pressed={secondaryPicks[slotIndex] === rune.id} onClick={() => chooseSecondaryRune(slotIndex, rune.id)}><AssetIcon src={`https://ddragon.leagueoflegends.com/cdn/img/${rune.icon}`} label={rune.name} fallback="◆" /><span>{rune.name}</span></button>)}</div>;
              })}
            </div>
            <h3>Stat shards</h3>
            <div className="shard-picker">
              {shardRows.map((row, rowIndex) => <div key={rowIndex}>{row.map((id) => <button type="button" key={id} aria-pressed={shards[rowIndex] === id} onClick={() => setShards((current) => current.map((value, index) => index === rowIndex ? id : value))}>{shardNames[id]}</button>)}</div>)}
            </div>
          </section>
        </div>
        <footer><span>{canSave ? "Rune page is complete." : "Choose one rune per primary row and two secondary rows."}</span><button type="button" disabled={!canSave} onClick={() => { if (!primary || !secondary) return; onSave({ primaryStyleId: primary.id, secondaryStyleId: secondary.id, selectedPerkIds: [...primaryPicks, ...Object.values(secondaryPicks)], statShardIds: shards }); onClose(); }}><Check size={15} />Use this page</button></footer>
      </section>
    </div>
  );
}

function BuildPlanner({
  paths,
  selectedPathId,
  onSelectPath,
  version,
}: {
  paths: readonly Path[];
  selectedPathId?: string;
  onSelectPath: (id: string) => void;
  version?: string;
}) {
  const selected = paths.find((path) => path.id === selectedPathId) ?? paths[0];
  if (!selected) {
    return <div className="draft-planner-empty"><Database size={18} /><span>No supported build variants yet.</span></div>;
  }
  const items = [
    ...selected.startingItems.map((item) => ({ item, label: "Start" })),
    { item: selected.firstCompletedItem, label: "First" },
    { item: selected.boots, label: "Boots" },
    ...selected.coreItems.filter((item) => item.id !== selected.firstCompletedItem.id).map((item) => ({ item, label: "Core" })),
  ].filter((entry, index, all) => all.findIndex((other) => other.item.id === entry.item.id) === index);

  return (
    <section className="build-planner" aria-labelledby="build-planner-title">
      <header className="planner-section-heading">
        <div><span>Build variant</span><h2 id="build-planner-title">Choose the plan that fits</h2></div>
        <span className="recommendation-only"><ShieldCheck size={12} /> Recommendation only</span>
      </header>
      <div className="build-tabs" role="tablist" aria-label="Build variants">
        {paths.slice(0, 3).map((path) => (
          <button
            key={path.id}
            type="button"
            role="tab"
            aria-selected={path.id === selected.id}
            onClick={() => onSelectPath(path.id)}
          >
            <span className={`path-kind path-kind--${path.kind}`}>{path.kind}</span>
            <strong>{path.title}</strong>
            <small>{formatPercent(path.evidence.frequency ?? 0)} played · {path.evidence.sampleSize} games</small>
          </button>
        ))}
      </div>
      <div className="selected-build">
        <div className="selected-build__why">
          <span>Useful when</span>
          <strong>{selected.title}</strong>
          <p>{selected.explanation}</p>
        </div>
        <ol className="selected-build__items">
          {items.map(({ item, label }) => (
            <li key={item.id}>
              <AssetIcon src={itemUrl(version, item.id)} label={item.name} fallback={item.name.slice(0, 1)} />
              <span><small>{label}</small><strong>{item.name}</strong></span>
            </li>
          ))}
        </ol>
        {selected.situationalOptions[0] ? (
          <div className="selected-build__situational">
            <span>{selected.situationalOptions[0].condition}</span>
            <strong>{selected.situationalOptions[0].items.map((item) => item.name).join(" + ")}</strong>
            <p>{selected.situationalOptions[0].explanation}</p>
          </div>
        ) : null}
      </div>
      <EvidenceLine evidence={selected.evidence} />
      <details className="draft-method-details">
        <summary>Uncertainty and item-bias note <ChevronDown size={13} /></summary>
        <p>{selected.biasWarning} Gold, CS, and XP at 15: {selected.evidence.deltas15.gold > 0 ? "+" : ""}{selected.evidence.deltas15.gold} gold, {selected.evidence.deltas15.cs > 0 ? "+" : ""}{selected.evidence.deltas15.cs.toFixed(1)} CS, {selected.evidence.deltas15.xp > 0 ? "+" : ""}{selected.evidence.deltas15.xp} XP.</p>
      </details>
    </section>
  );
}

function OpggBuildPlanner({ guide, version }: { guide: OpggDraftGuide; version?: string }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = guide.builds[selectedIndex] ?? guide.builds[0];
  if (!selected) return <div className="draft-planner-empty"><Database size={18} /><span>OP.GG returned no build variants.</span></div>;
  const start = guide.starters[0];
  const boots = guide.boots[Math.min(selectedIndex, guide.boots.length - 1)] ?? guide.boots[0];
  const entries = [
    ...(start?.ids.map((id, index) => ({ id, name: start.names[index] ?? `Item ${id}`, label: "Start" })) ?? []),
    ...selected.ids.map((id, index) => ({ id, name: selected.names[index] ?? `Item ${id}`, label: index === 0 ? "First" : "Core" })),
    ...(boots?.ids.map((id, index) => ({ id, name: boots.names[index] ?? `Item ${id}`, label: "Boots" })) ?? []),
  ].filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index);
  return (
    <section className="build-planner" aria-labelledby="opgg-build-title">
      <header className="planner-section-heading">
        <div><span>OP.GG build reference</span><h2 id="opgg-build-title">Choose an observed path</h2></div>
        <span className="recommendation-only"><ShieldCheck size={12} /> Recommendation only</span>
      </header>
      <div className="build-tabs" role="tablist" aria-label="OP.GG build variants">
        {guide.builds.slice(0, 3).map((build, index) => <button key={build.ids.join("-")} type="button" role="tab" aria-selected={index === selectedIndex} onClick={() => setSelectedIndex(index)}><span className="path-kind path-kind--situational">observed</span><strong>{build.names.join(" → ")}</strong><small>{formatPercent(build.frequency ?? 0)} played · {build.sampleSize} games</small></button>)}
      </div>
      <div className="selected-build">
        <div className="selected-build__why"><span>Reference context</span><strong>{championName(guide.champion)} into {championName(guide.opponent)}</strong><p>Global OP.GG observations. Compare the alternatives with the enemy damage mix and frontline before choosing.</p></div>
        <ol className="selected-build__items">{entries.map((entry) => <li key={entry.id}><AssetIcon src={itemUrl(version, entry.id)} label={entry.name} fallback={entry.name.slice(0, 1)} /><span><small>{entry.label}</small><strong>{entry.name}</strong></span></li>)}</ol>
      </div>
      <OpggEvidenceLine evidence={selected} />
      <details className="draft-method-details"><summary>Evidence limitations and item bias <ChevronDown size={13} /></summary><p>{guide.evidenceNotice} Completed-item win rates also contain affordability and win-more bias.</p></details>
    </section>
  );
}

function RunePlanner({
  runes,
  selectedRuneId,
  onSelectRune,
  catalog,
}: {
  runes: readonly Rune[];
  selectedRuneId?: string;
  onSelectRune: (id: string) => void;
  catalog?: DataDragonCatalog;
}) {
  const selected = runes.find((rune) => rune.id === selectedRuneId) ?? runes[0];
  const [customPage, setCustomPage] = useState<CustomRunePage>();
  const [customSelected, setCustomSelected] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  if (!selected) return <div className="draft-planner-empty"><Database size={18} /><span>No supported rune variants yet.</span></div>;
  const page = customSelected && customPage ? customPage : selected.page;
  const primaryName = catalog?.styleNames?.[page.primaryStyleId] ?? fallbackStyleNames[page.primaryStyleId] ?? "Primary tree";
  const secondaryName = catalog?.styleNames?.[page.secondaryStyleId] ?? fallbackStyleNames[page.secondaryStyleId] ?? "Secondary tree";

  return (
    <section className="rune-planner" aria-labelledby="rune-planner-title">
      <header className="planner-section-heading">
        <div><span>Exact rune page</span><h2 id="rune-planner-title">Runes for this plan</h2></div>
        <button className="edit-runes-button" type="button" disabled={!catalog?.runeStyles?.length} onClick={() => setEditorOpen(true)}>Edit your own</button>
      </header>
      <div className="rune-tabs" role="tablist" aria-label="Rune page variants">
        {runes.slice(0, 3).map((rune) => (
          <button key={rune.id} type="button" role="tab" aria-selected={!customSelected && rune.id === selected.id} onClick={() => { setCustomSelected(false); onSelectRune(rune.id); }}>
            <AssetIcon src={runeIconUrl(catalog, rune.page.primaryStyleId)} label={catalog?.styleNames?.[rune.page.primaryStyleId] ?? "Rune tree"} fallback="R" />
            <span><strong>{rune.title}</strong><small>{runeKindLabels[rune.kind]}</small></span>
          </button>
        ))}
      </div>
      <div className="rune-tree-heading">
        <span><AssetIcon src={runeIconUrl(catalog, page.primaryStyleId)} label={primaryName} fallback="P" /><strong>{primaryName}</strong></span>
        <i>+</i>
        <span><AssetIcon src={runeIconUrl(catalog, page.secondaryStyleId)} label={secondaryName} fallback="S" /><strong>{secondaryName}</strong></span>
        {customSelected ? <b className="custom-choice-label">Your page</b> : null}
      </div>
      <ol className="exact-runes">
        {page.selectedPerkIds.map((perkId, index) => (
          <li key={perkId} className={index === 0 ? "is-keystone" : ""}>
            <AssetIcon src={runeIconUrl(catalog, perkId)} label={catalog?.perkNames?.[perkId] ?? "Selected rune"} fallback="◆" />
            <span><small>{index === 0 ? "Keystone" : index < 4 ? "Primary" : "Secondary"}</small><strong>{catalog?.perkNames?.[perkId] ?? "Selected perk"}</strong></span>
          </li>
        ))}
      </ol>
      <div className="stat-shards" aria-label="Stat shards">
        {page.statShardIds.map((shardId) => <span key={shardId}>{shardNames[shardId] ?? "Stat shard"}</span>)}
      </div>
      <p className="rune-explanation">{customSelected ? "Your manual rune page. It is not presented as a statistical recommendation." : selected.explanation}</p>
      {customSelected ? <div className="custom-rune-note"><ShieldCheck size={12} /> Manual choice · no win-rate claim</div> : <EvidenceLine evidence={selected.evidence} />}
      {editorOpen && catalog ? (
        <RuneEditor
          catalog={catalog}
          initialPage={customPage ?? {
            primaryStyleId: selected.page.primaryStyleId,
            secondaryStyleId: selected.page.secondaryStyleId,
            selectedPerkIds: selected.page.selectedPerkIds,
            statShardIds: selected.page.statShardIds,
          }}
          onSave={(nextPage) => { setCustomPage(nextPage); setCustomSelected(true); }}
          onClose={() => setEditorOpen(false)}
        />
      ) : null}
    </section>
  );
}

function OpggRunePlanner({ guide, catalog }: { guide: OpggDraftGuide; catalog?: DataDragonCatalog }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [customPage, setCustomPage] = useState<CustomRunePage>();
  const [customSelected, setCustomSelected] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const selected = guide.runes[selectedIndex] ?? guide.runes[0];
  if (!selected) return <div className="draft-planner-empty"><Database size={18} /><span>OP.GG returned no rune variants.</span></div>;
  const page = customSelected && customPage ? customPage : {
    primaryStyleId: selected.primaryStyleId,
    secondaryStyleId: selected.secondaryStyleId,
    selectedPerkIds: selected.perkIds,
    statShardIds: selected.statShardIds,
  };
  return (
    <section className="rune-planner" aria-labelledby="opgg-rune-title">
      <header className="planner-section-heading"><div><span>OP.GG rune reference</span><h2 id="opgg-rune-title">Runes for this matchup</h2></div><button className="edit-runes-button" type="button" disabled={!catalog?.runeStyles?.length} onClick={() => setEditorOpen(true)}>Edit your own</button></header>
      <div className="rune-tabs" role="tablist" aria-label="OP.GG rune variants">{guide.runes.slice(0, 3).map((rune, index) => <button key={`${rune.primaryStyleId}-${rune.secondaryStyleId}-${index}`} type="button" role="tab" aria-selected={!customSelected && index === selectedIndex} onClick={() => { setSelectedIndex(index); setCustomSelected(false); }}><AssetIcon src={runeIconUrl(catalog, rune.primaryStyleId)} label={rune.primaryStyleName} fallback="R" /><span><strong>{index === 0 ? "Most observed" : index === 1 ? "Alternative" : "Defensive / scaling"}</strong><small>{rune.primaryStyleName} + {rune.secondaryStyleName}</small></span></button>)}</div>
      <div className="rune-tree-heading"><span><AssetIcon src={runeIconUrl(catalog, page.primaryStyleId)} label={selected.primaryStyleName} fallback="P" /><strong>{selected.primaryStyleName}</strong></span><i>+</i><span><AssetIcon src={runeIconUrl(catalog, page.secondaryStyleId)} label={selected.secondaryStyleName} fallback="S" /><strong>{selected.secondaryStyleName}</strong></span>{customSelected ? <b className="custom-choice-label">Your page</b> : null}</div>
      <ol className="exact-runes">{page.selectedPerkIds.map((perkId, index) => <li key={`${perkId}-${index}`} className={index === 0 ? "is-keystone" : ""}><AssetIcon src={runeIconUrl(catalog, perkId)} label={catalog?.perkNames?.[perkId] ?? selected.perkNames[index] ?? "Selected rune"} fallback="◆" /><span><small>{index === 0 ? "Keystone" : index < 4 ? "Primary" : "Secondary"}</small><strong>{catalog?.perkNames?.[perkId] ?? selected.perkNames[index] ?? "Selected perk"}</strong></span></li>)}</ol>
      <div className="stat-shards">{page.statShardIds.map((id, index) => <span key={`${id}-${index}`}>{shardNames[id] ?? "Stat shard"}</span>)}</div>
      {customSelected ? <div className="custom-rune-note"><ShieldCheck size={12} /> Manual choice · no win-rate claim</div> : <OpggEvidenceLine evidence={selected} />}
      {editorOpen && catalog ? <RuneEditor catalog={catalog} initialPage={page} onSave={(next) => { setCustomPage(next); setCustomSelected(true); }} onClose={() => setEditorOpen(false)} /> : null}
    </section>
  );
}

function OpggSpellPlanner({ guide, catalog, version }: { guide: OpggDraftGuide; catalog?: DataDragonCatalog; version?: string }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  if (guide.spells.length === 0) return null;
  return (
    <section className="spell-planner" aria-label="OP.GG summoner spell references">
      <span className="spell-planner__label">Summoner spells · OP.GG</span>
      {guide.spells.slice(0, 3).map((pair, index) => <button type="button" key={pair.ids.join("-")} aria-pressed={index === selectedIndex} onClick={() => setSelectedIndex(index)}>{pair.ids.map((id, itemIndex) => <AssetIcon key={`${id}-${itemIndex}`} src={spellUrl(catalog, version, id)} label={pair.names[itemIndex] ?? `Spell ${id}`} fallback={(pair.names[itemIndex] ?? "S").slice(0, 1)} />)}<span><strong>{pair.names.join(" + ")}</strong><small>{formatPercent(pair.frequency ?? 0)} played · {pair.sampleSize} games</small></span></button>)}
    </section>
  );
}

function SpellPlanner({
  pairs,
  selectedPairId,
  onSelect,
  catalog,
  version,
}: {
  pairs: readonly SpellPair[];
  selectedPairId?: string;
  onSelect: (id: string) => void;
  catalog?: DataDragonCatalog;
  version?: string;
}) {
  const firstPair = pairs[0];
  const spellOptions = Object.entries(catalog?.spellNames ?? {})
    .map(([id, name]) => ({ id: Number(id), name }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const [customFirst, setCustomFirst] = useState(firstPair?.spells[0]?.id ?? 4);
  const [customSecond, setCustomSecond] = useState(firstPair?.spells[1]?.id ?? 12);
  const customSelected = selectedPairId === "custom-spell-pair";
  if (!firstPair) return null;
  return (
    <section className="spell-planner" aria-label="Summoner spell recommendations">
      <span className="spell-planner__label">Summoner spells</span>
      {pairs.slice(0, 3).map((pair) => (
        <button type="button" key={pair.id} aria-pressed={(selectedPairId ?? pairs[0]?.id) === pair.id} onClick={() => onSelect(pair.id)}>
          {pair.spells.map((spell) => (
            <AssetIcon key={spell.id} src={spellUrl(catalog, version, spell.id)} label={catalog?.spellNames[spell.id] ?? spell.name} fallback={spell.name.slice(0, 1)} />
          ))}
          <span><strong>{pair.spells.map((spell) => catalog?.spellNames[spell.id] ?? spell.name).join(" + ")}</strong><small>{formatPercent(pair.evidence.frequency ?? 0)} played · {pair.evidence.sampleSize} games</small></span>
        </button>
      ))}
      <div className={customSelected ? "custom-spells is-selected" : "custom-spells"}>
        <span>My choice</span>
        <select aria-label="First custom summoner spell" value={customFirst} onChange={(event) => { setCustomFirst(Number(event.target.value)); onSelect("custom-spell-pair"); }}>
          {spellOptions.map((spell) => <option key={spell.id} value={spell.id} disabled={spell.id === customSecond}>{spell.name}</option>)}
        </select>
        <select aria-label="Second custom summoner spell" value={customSecond} onChange={(event) => { setCustomSecond(Number(event.target.value)); onSelect("custom-spell-pair"); }}>
          {spellOptions.map((spell) => <option key={spell.id} value={spell.id} disabled={spell.id === customFirst}>{spell.name}</option>)}
        </select>
      </div>
    </section>
  );
}

function ChampionPicker({
  catalog,
  version,
  onChoose,
  onClose,
}: {
  catalog?: DataDragonCatalog;
  version?: string;
  onChoose: (champion: ChampionRef) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const champions = useMemo(
    () => Object.entries(catalog?.championNames ?? {})
      .map(([id, name]) => ({ id: Number(id), name }))
      .filter((champion) => champion.name.toLowerCase().includes(query.trim().toLowerCase()))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [catalog?.championNames, query],
  );

  return (
    <div className="champion-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="champion-picker" role="dialog" aria-modal="true" aria-labelledby="champion-picker-title">
        <header><div><span>Champion pool</span><h2 id="champion-picker-title">Plan a champion</h2></div><button type="button" onClick={onClose} aria-label="Close champion picker"><X size={18} /></button></header>
        <label className="champion-search"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search champions" /></label>
        {champions.length > 0 ? (
          <div className="champion-picker__grid">
            {champions.map((champion) => (
              <button type="button" key={champion.id} onClick={() => { onChoose(champion); onClose(); }}>
                <Portrait champion={champion} catalog={catalog} version={version} size="small" />
                <span>{champion.name}</span>
              </button>
            ))}
          </div>
        ) : <div className="champion-picker__empty">Champion metadata is still loading.</div>}
      </section>
    </div>
  );
}

export function DraftWorkspace({
  snapshot,
  plan,
  catalog,
  dataDragonVersion,
  recommendationMessage,
  recommendationsLoading = false,
  opggGuide,
  opggMessage,
  opggLoading = false,
  banAdvice,
  banAdviceMessage,
  banAdviceLoading = false,
  selectedPathId,
  onSelectPath,
  selectedRuneId,
  onSelectRune,
  selectedSpellPairId,
  onSelectSpellPair,
  plannedChampion,
  onPlanChampion,
  selectedOpponentId,
  onSelectOpponent,
  selectedRole,
  onSelectRole,
  customGameTestMode,
  onCustomGameTestModeChange,
  previewControls,
}: DraftWorkspaceProps) {
  const [pickerMode, setPickerMode] = useState<"plan" | "ban">();
  const [previewLocked, setPreviewLocked] = useState(false);
  const [previewBan, setPreviewBan] = useState<ChampionRef>();
  const [previewLoadoutApplied, setPreviewLoadoutApplied] = useState(false);
  const draft = snapshot.draft;
  const enemySlots = draft?.enemies ?? [];
  const effectiveRole = draft?.assignedRole ?? selectedRole;
  const automaticOpponent = enemySlots.find((slot) => slot.role && slot.role === effectiveRole)?.champion;
  const chosenOpponent = enemySlots.find((slot) => slot.champion?.id === selectedOpponentId)?.champion
    ?? automaticOpponent
    ?? enemySlots.find((slot) => slot.champion)?.champion;
  const localChampion = plannedChampion ?? draft?.localChampion ?? plan?.localChampion;
  const roleName = effectiveRole ? roleLabels[effectiveRole] : "Role pending";
  const isCustomContext = snapshot.queue?.id !== 420;
  const loadoutMatchesChampion = !plan?.localChampion || !localChampion || plan.localChampion.id === localChampion.id;
  const paths = loadoutMatchesChampion ? plan?.itemPaths ?? [] : [];
  const runes = loadoutMatchesChampion ? plan?.runePages ?? [] : [];
  const pairs = loadoutMatchesChampion ? plan?.spellPairs ?? [] : [];
  const hasPrimaryLoadout = paths.length > 0 || runes.length > 0 || pairs.length > 0;
  const externalGuide = !hasPrimaryLoadout
    && opggGuide?.champion.id === localChampion?.id
    && opggGuide?.opponent.id === chosenOpponent?.id
    ? opggGuide
    : undefined;

  return (
    <main className="draft-workspace">
      <Roster title="Your team" slots={draft?.allies ?? []} catalog={catalog} version={dataDragonVersion} />

      <div className="draft-center">
        <header className="draft-center__status">
          <div className="matchup-lockup">
            <Portrait champion={localChampion} catalog={catalog} version={dataDragonVersion} size="small" />
            <span><small>{roleName}</small><strong>{championName(localChampion, catalog)}</strong></span>
            <i>VS</i>
            <Portrait champion={chosenOpponent} catalog={catalog} version={dataDragonVersion} size="small" muted />
            <span><small>Lane opponent</small><strong>{championName(chosenOpponent, catalog)}</strong></span>
          </div>
          <div className="draft-context-controls">
            {!draft?.assignedRole ? (
              <label className="draft-role-select">
                <span>Test role</span>
                <select value={selectedRole ?? ""} onChange={(event) => onSelectRole(event.target.value as Role)}>
                  <option value="" disabled>Choose role</option>
                  {(Object.keys(roleLabels) as Role[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                </select>
              </label>
            ) : null}
            {isCustomContext ? (
              <label className="ranked-evidence-toggle" title="Use Ranked Solo/Duo statistics only as a custom-game test harness.">
                <input type="checkbox" checked={customGameTestMode} onChange={(event) => onCustomGameTestModeChange(event.target.checked)} />
                <span>Ranked evidence test</span>
              </label>
            ) : null}
            <div className="draft-clock"><span>{draft?.timer?.phase ?? "planning"}</span><strong><Clock3 size={17} />{formatTimer(draft?.timer?.remainingMs)}</strong></div>
          </div>
        </header>

        <ChampionSuggestions
          plan={plan}
          opponent={chosenOpponent}
          catalog={catalog}
          version={dataDragonVersion}
          selectedChampion={localChampion}
          externalSuggestions={externalGuide?.matchupCandidates}
          onSelect={(champion) => { setPreviewLocked(false); setPreviewLoadoutApplied(false); onPlanChampion(champion); }}
          onOpenPicker={() => setPickerMode("plan")}
        />

        <div className="draft-center__plan">
          {externalGuide ? <OpggBuildPlanner guide={externalGuide} version={dataDragonVersion} /> : <BuildPlanner paths={paths} selectedPathId={selectedPathId} onSelectPath={onSelectPath} version={dataDragonVersion} />}
          {externalGuide ? <OpggRunePlanner guide={externalGuide} catalog={catalog} /> : <RunePlanner runes={runes} selectedRuneId={selectedRuneId} onSelectRune={onSelectRune} catalog={catalog} />}
        </div>

        {externalGuide ? <OpggSpellPlanner guide={externalGuide} catalog={catalog} version={dataDragonVersion} /> : <SpellPlanner pairs={pairs} selectedPairId={selectedSpellPairId} onSelect={onSelectSpellPair} catalog={catalog} version={dataDragonVersion} />}

        <footer className="draft-action-bar">
          <div className={previewControls ? "control-status control-status--preview" : "control-status"}>
            {previewControls ? <Sparkles size={14} /> : <Lock size={14} />}
            <span><strong>{previewControls ? "Interactive browser preview" : "Riot review gate"}</strong>{previewControls ? "These buttons change the mock draft only." : "Planning works here; client-writing actions remain disabled until the registered product is approved."}</span>
          </div>
          <div className="draft-action-bar__buttons">
            <button type="button" disabled={!previewControls || runes.length === 0 || pairs.length === 0} onClick={() => setPreviewLoadoutApplied(true)}><Sparkles size={14} />{previewLoadoutApplied ? "Loadout applied" : "Apply loadout"}</button>
            <button type="button" disabled={!previewControls} onClick={() => setPickerMode("ban")}><Ban size={14} />{previewBan ? `Banned ${championName(previewBan, catalog)}` : "Ban"}</button>
            <button type="button" disabled={!previewControls || !localChampion} onClick={() => setPreviewLocked(true)} className="lock-in-button"><Check size={15} />{previewLocked ? "Locked in" : "Lock in"}</button>
          </div>
        </footer>

        {!hasPrimaryLoadout && !externalGuide ? (
          <div className="recommendation-status" role="status">
            {recommendationsLoading || opggLoading ? <span className="recommendation-status__spinner" /> : <AlertTriangle size={15} />}
            <span><strong>{recommendationsLoading ? "Loading exact-matchup evidence" : "Recommendations waiting"}</strong> · {!loadoutMatchesChampion ? `No loadout for ${championName(localChampion, catalog)} is loaded yet.` : recommendationMessage ?? "Select a visible lane opponent and champion."}</span>
            {opggMessage ? <span className="opgg-status-detail">{opggMessage}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="enemy-rail">
        <Roster title="Enemy team" slots={enemySlots} catalog={catalog} version={dataDragonVersion} selectedOpponentId={chosenOpponent?.id} onSelectOpponent={onSelectOpponent} />
        <section className="ban-strip" aria-label="Ban information">
          <BanAdvisor advice={banAdvice} loading={banAdviceLoading} message={banAdviceMessage} catalog={catalog} version={dataDragonVersion} />
          <header><Ban size={13} /><span>Visible bans</span></header>
          <div className="visible-ban-list">{draft?.bans.filter((ban) => ban.champion).slice(0, 10).map((ban) => (
            <span key={`${ban.team}-${ban.slot}`} title={championName(ban.champion, catalog)}><Portrait champion={ban.champion} catalog={catalog} version={dataDragonVersion} size="small" muted /></span>
          ))}</div>
        </section>
      </div>

      {pickerMode ? (
        <ChampionPicker
          catalog={catalog}
          version={dataDragonVersion}
          onChoose={(champion) => {
            if (pickerMode === "ban") setPreviewBan(champion);
            else {
              setPreviewLocked(false);
              setPreviewLoadoutApplied(false);
              onPlanChampion(champion);
            }
          }}
          onClose={() => setPickerMode(undefined)}
        />
      ) : null}
    </main>
  );
}
