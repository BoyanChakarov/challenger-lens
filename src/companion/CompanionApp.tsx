import {
  BarChart3,
  ChevronRight,
  CircleCheck,
  Gamepad2,
  LoaderCircle,
  MonitorCheck,
  Radio,
  ShieldCheck,
  Swords,
  UserRound,
  Users,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  BrowserDemoCompanionBridge,
  createCompanionBridge,
  type CompanionBridge,
} from "./bridge";
import { browserDemoPhases } from "./demo";
import {
  InGameOverlay,
  PreparedPlanSummary,
} from "./CompanionViews";
import { DraftWorkspace } from "./DraftWorkspace";
import { PlayerProfilePanel } from "./PlayerProfilePanel";
import {
  loadDataDragonCatalog,
  resolveDataDragonVersion,
  type DataDragonCatalog,
} from "./dataDragon";
import { useCompanionRecommendations } from "./useRecommendations";
import { useOpggBanAdvice } from "./useOpggBanAdvice";
import { useOpggGuide } from "./useOpggGuide";
import { personalizeBanAdvice } from "./player-profile";
import { usePlayerProfile } from "./usePlayerProfile";
import type {
  ChampionRef,
  FrozenRecommendationBundle,
  LeaguePhase,
  LeagueSnapshot,
  Role,
} from "./types";

interface CompanionAppProps {
  onOpenResearch: () => void;
}

interface BridgeState {
  snapshot: LeagueSnapshot;
  isConnecting: boolean;
  error?: string;
}

const initialSnapshot: LeagueSnapshot = {
  phase: "client_closed",
  observedAt: new Date().toISOString(),
};

const FROZEN_PLAN_STORAGE_KEY = "challenger-lens:companion:frozen-plan:v1";
const FROZEN_PLAN_MAX_AGE_MS = 2 * 60 * 60 * 1_000;

function readStoredFrozenPlan(): FrozenRecommendationBundle | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(FROZEN_PLAN_STORAGE_KEY) ?? "null") as unknown;
    if (!value || typeof value !== "object") return undefined;
    const plan = value as Partial<FrozenRecommendationBundle>;
    const frozenAt = typeof plan.frozenAt === "string" ? Date.parse(plan.frozenAt) : Number.NaN;
    if (
      !Number.isFinite(frozenAt) ||
      Date.now() - frozenAt > FROZEN_PLAN_MAX_AGE_MS ||
      typeof plan.patch !== "string" ||
      !Array.isArray(plan.counterGroups) ||
      !Array.isArray(plan.runePages) ||
      !Array.isArray(plan.spellPairs) ||
      !Array.isArray(plan.itemPaths)
    ) {
      localStorage.removeItem(FROZEN_PLAN_STORAGE_KEY);
      return undefined;
    }
    return plan as FrozenRecommendationBundle;
  } catch {
    return undefined;
  }
}

function storeFrozenPlan(plan: FrozenRecommendationBundle | undefined): void {
  try {
    if (plan) localStorage.setItem(FROZEN_PLAN_STORAGE_KEY, JSON.stringify(plan));
    else localStorage.removeItem(FROZEN_PLAN_STORAGE_KEY);
  } catch {
    // A storage restriction must not interrupt local League state detection.
  }
}

const phaseLabels: Record<LeaguePhase, string> = {
  client_closed: "Client closed",
  idle: "Client idle",
  lobby: "Lobby or queue",
  champion_select: "Champion select",
  loading: "Loading screen",
  active_game: "Active game",
  post_game: "Post-game",
};

function useCompanionBridge(bridge: CompanionBridge): BridgeState {
  const [state, setState] = useState<BridgeState>({
    snapshot: initialSnapshot,
    isConnecting: true,
  });

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;

    const acceptSnapshot = (snapshot: LeagueSnapshot) => {
      if (!active) return;
      setState({ snapshot, isConnecting: false });
    };

    const poll = async () => {
      try {
        acceptSnapshot(await bridge.getSnapshot());
      } catch (error) {
        if (!active) return;
        setState((current) => ({
          snapshot: {
            phase: "client_closed",
            observedAt: new Date().toISOString(),
          },
          isConnecting: false,
          error: error instanceof Error ? error.message : "The local connector is unavailable.",
        }));
      } finally {
        if (active && bridge.kind === "tauri") {
          timeoutId = window.setTimeout(() => void poll(), 750);
        }
      }
    };

    const unsubscribe = bridge.subscribe?.(acceptSnapshot);
    void poll();

    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      unsubscribe?.();
    };
  }, [bridge]);

  return state;
}

function useFrozenPlan(
  snapshot: LeagueSnapshot,
  canReset: boolean,
): FrozenRecommendationBundle | undefined {
  const [plan, setPlan] = useState<FrozenRecommendationBundle | undefined>(
    snapshot.recommendations,
  );

  useEffect(() => {
    if (snapshot.phase === "champion_select" && snapshot.recommendations) {
      setPlan(snapshot.recommendations);
      storeFrozenPlan(snapshot.recommendations);
      return;
    }

    if ((snapshot.phase === "loading" || snapshot.phase === "active_game") && !plan) {
      const restored = snapshot.recommendations ?? readStoredFrozenPlan();
      if (restored) setPlan(restored);
      return;
    }

    if (canReset && ["client_closed", "idle", "lobby", "post_game"].includes(snapshot.phase)) {
      setPlan(undefined);
      storeFrozenPlan(undefined);
    }
  }, [canReset, plan, snapshot.phase, snapshot.recommendations]);

  return plan;
}

function StateMessage({
  icon,
  eyebrow,
  title,
  body,
  detail,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  detail?: string;
}) {
  return (
    <main className="companion-state" aria-labelledby="companion-state-title">
      <div className="companion-state__icon" aria-hidden="true">{icon}</div>
      <span className="companion-kicker">{eyebrow}</span>
      <h1 id="companion-state-title">{title}</h1>
      <p>{body}</p>
      {detail ? <span className="companion-state__detail">{detail}</span> : null}
    </main>
  );
}

function LoadingView({
  plan,
  catalog,
  dataDragonVersion,
}: {
  plan?: FrozenRecommendationBundle;
  catalog?: DataDragonCatalog;
  dataDragonVersion?: string;
}) {
  return (
    <div className="companion-lifecycle-page">
      <StateMessage
        icon={<LoaderCircle className="is-spinning" size={30} />}
        eyebrow="Loading screen detected"
        title="Your prepared plan is ready."
        body="The companion has stopped recalculating. The same pre-game options will carry into the match."
        detail="No player identities or hidden game state are used."
      />
      {plan ? <PreparedPlanSummary plan={plan} catalog={catalog} dataDragonVersion={dataDragonVersion} /> : null}
    </div>
  );
}

export function CompanionApp({ onOpenResearch }: CompanionAppProps) {
  const [bridge] = useState<CompanionBridge>(() => createCompanionBridge());
  const { snapshot, isConnecting, error } = useCompanionBridge(bridge);
  const playerProfile = usePlayerProfile(bridge);
  const [profileOpen, setProfileOpen] = useState(
    () => new URLSearchParams(window.location.search).get("profile") === "open",
  );
  const [plannedChampion, setPlannedChampion] = useState<ChampionRef>();
  const [selectedOpponentId, setSelectedOpponentId] = useState<number>();
  const [manualRole, setManualRole] = useState<Role>();
  const [customGameTestMode, setCustomGameTestMode] = useState(false);
  const effectiveRole = snapshot.draft?.assignedRole ?? manualRole;
  const automaticOpponent = snapshot.draft?.enemies.find(
    (slot) => slot.role && slot.role === effectiveRole,
  )?.champion ?? snapshot.draft?.enemies.find((slot) => slot.champion)?.champion;
  const liveRecommendations = useCompanionRecommendations(
    snapshot,
    bridge.kind === "tauri",
    {
      ...(selectedOpponentId ?? automaticOpponent?.id
        ? { opponentChampionId: selectedOpponentId ?? automaticOpponent?.id }
        : {}),
      ...(plannedChampion ? { localChampion: plannedChampion } : {}),
      ...(effectiveRole ? { role: effectiveRole } : {}),
      ...(customGameTestMode ? { useRankedEvidenceForCustom: true } : {}),
    },
  );
  const snapshotWithRecommendations = useMemo(
    () => liveRecommendations.bundle
      ? { ...snapshot, recommendations: liveRecommendations.bundle }
      : snapshot,
    [liveRecommendations.bundle, snapshot],
  );
  const frozenPlan = useFrozenPlan(snapshotWithRecommendations, !isConnecting);
  const [selectedPathId, setSelectedPathId] = useState<string>();
  const [selectedRuneId, setSelectedRuneId] = useState<string>();
  const [selectedSpellPairId, setSelectedSpellPairId] = useState<string>();
  const [dataDragonVersion, setDataDragonVersion] = useState<string>();
  const [catalog, setCatalog] = useState<DataDragonCatalog>();
  const [manualOwnedItemIds, setManualOwnedItemIds] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );
  const currentPlan = liveRecommendations.bundle ?? snapshot.recommendations ?? frozenPlan;
  const primaryPlanHasLoadout = Boolean(
    currentPlan && (
      currentPlan.runePages.length > 0 ||
      currentPlan.spellPairs.length > 0 ||
      currentPlan.itemPaths.length > 0
    ),
  );
  const chosenOpponent = snapshot.draft?.enemies.find(
    (slot) => slot.champion?.id === selectedOpponentId,
  )?.champion ?? automaticOpponent;
  const localChampionForOpgg = plannedChampion ?? snapshot.draft?.localChampion;
  const resolvedLocalChampion = localChampionForOpgg
    ? { ...localChampionForOpgg, name: catalog?.championNames[localChampionForOpgg.id] ?? localChampionForOpgg.name }
    : undefined;
  const resolvedOpponent = chosenOpponent
    ? { ...chosenOpponent, name: catalog?.championNames[chosenOpponent.id] ?? chosenOpponent.name }
    : undefined;
  const opgg = useOpggGuide(
    snapshot,
    bridge,
    effectiveRole,
    primaryPlanHasLoadout ? undefined : resolvedLocalChampion,
    primaryPlanHasLoadout ? undefined : resolvedOpponent,
  );
  const opggBan = useOpggBanAdvice(
    snapshot,
    bridge,
    effectiveRole,
    resolvedLocalChampion,
  );
  const personalizedBanAdvice = useMemo(
    () => personalizeBanAdvice(opggBan.advice, playerProfile.profile),
    [opggBan.advice, playerProfile.profile],
  );

  useEffect(() => {
    if (!frozenPlan?.itemPaths.some((path) => path.id === selectedPathId)) {
      setSelectedPathId(undefined);
    }
    if (!frozenPlan?.runePages.some((rune) => rune.id === selectedRuneId)) {
      setSelectedRuneId(undefined);
    }
    if (
      selectedSpellPairId !== "custom-spell-pair" &&
      !frozenPlan?.spellPairs.some((pair) => pair.id === selectedSpellPairId)
    ) {
      setSelectedSpellPairId(undefined);
    }
  }, [frozenPlan, selectedPathId, selectedRuneId, selectedSpellPairId]);

  useEffect(() => {
    let active = true;
    void resolveDataDragonVersion(snapshot.patch ?? playerProfile.local?.patch ?? frozenPlan?.patch)
      .then(async (version) => {
        if (!active || !version) return;
        const nextCatalog = await loadDataDragonCatalog(version);
        if (!active) return;
        setDataDragonVersion(version);
        if (nextCatalog) setCatalog(nextCatalog);
      });
    return () => { active = false; };
  }, [frozenPlan?.patch, playerProfile.local?.patch, snapshot.patch]);

  useEffect(() => {
    if (["client_closed", "idle", "lobby", "post_game"].includes(snapshot.phase)) {
      setManualOwnedItemIds(new Set<number>());
      setPlannedChampion(undefined);
      setSelectedOpponentId(undefined);
      setManualRole(undefined);
      setCustomGameTestMode(false);
    }
  }, [snapshot.phase]);

  const selectPath = (pathId: string) => {
    setSelectedPathId(pathId);
    const path = currentPlan?.itemPaths.find((candidate) => candidate.id === pathId);
    const desiredRuneKind = path?.kind === "standard"
      ? "most_frequent"
      : path?.kind === "defensive" || path?.kind === "situational"
        ? "matchup_defensive_or_scaling"
        : "highest_supported";
    const pairedRune = currentPlan?.runePages.find((rune) => rune.kind === desiredRuneKind);
    if (pairedRune) setSelectedRuneId(pairedRune.id);
  };

  const detectedOwnedItemIds = useMemo(
    () => new Set(snapshot.activeGame?.ownedItemIds ?? []),
    [snapshot.activeGame?.ownedItemIds],
  );

  const toggleManualItem = (itemId: number) => {
    setManualOwnedItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const showChrome = snapshot.phase !== "active_game";
  const isDemo = bridge instanceof BrowserDemoCompanionBridge;
  const isOverlayWindow = new URLSearchParams(window.location.search).get("window") === "overlay";

  return (
    <div
      className={`companion-shell companion-shell--${snapshot.phase} ${isOverlayWindow ? "companion-shell--overlay-window" : ""}`.trim()}
      data-bridge={bridge.kind}
    >
      {showChrome ? (
        <header className="companion-header">
          <div className="companion-brand">
            <span className="companion-brand__mark" aria-hidden="true"><Swords size={19} /></span>
            <span>
              <strong>Challenger Lens</strong>
              <small>Evidence-first draft room</small>
            </span>
          </div>

          <div className="companion-header__status" role="status" aria-live="polite">
            <span className={`connector-chip connector-chip--${isDemo ? "demo" : "local"}`}>
              <Radio size={13} aria-hidden="true" />
              {bridge.label}
            </span>
            <span className="phase-chip">{isConnecting ? "Connecting…" : phaseLabels[snapshot.phase]}</span>
          </div>

          <div className="companion-header__actions">
            {isDemo ? (
              <label className="demo-phase-control">
                <span>Preview state</span>
                <select
                  value={snapshot.phase}
                  onChange={(event) => bridge.setDemoPhase?.(event.target.value as LeaguePhase)}
                  aria-label="Preview companion state"
                >
                  {browserDemoPhases.map((phase) => (
                    <option key={phase} value={phase}>{phaseLabels[phase]}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <button className="companion-research-link companion-profile-button" type="button" onClick={() => setProfileOpen(true)}>
              <UserRound size={15} aria-hidden="true" />
              {playerProfile.connected ? "My profile" : "Connect profile"}
            </button>
            <button className="companion-research-link" type="button" onClick={onOpenResearch}>
              <BarChart3 size={15} aria-hidden="true" />
              Research
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </header>
      ) : null}

      {error && showChrome ? (
        <div className="connector-error" role="alert">
          <WifiOff size={16} aria-hidden="true" />
          <span><strong>Connector retrying.</strong> {error}</span>
        </div>
      ) : null}

      {snapshot.phase === "client_closed" ? (
        <StateMessage
          icon={<WifiOff size={30} />}
          eyebrow="Watching locally"
          title="League is not open yet."
          body="The companion will reconnect automatically when the League client starts or refreshes its local credentials."
          detail="Local authentication stays in memory and never leaves this computer."
        />
      ) : null}

      {snapshot.phase === "idle" ? (
        <StateMessage
          icon={<MonitorCheck size={30} />}
          eyebrow="Client connected"
          title="League is open and idle."
          body="You can leave the companion running. It will recognize the lobby, champion select, loading screen, and match transitions."
          detail="No champion-select or gameplay actions are automated."
        />
      ) : null}

      {snapshot.phase === "lobby" ? (
        <StateMessage
          icon={<Users size={30} />}
          eyebrow="Lobby or queue detected"
          title="Waiting for champion select."
          body="The local connector is ready. Recommendations appear only after visible draft context and a supported data slice are available."
          detail="Hidden player identities are never requested for the companion UI."
        />
      ) : null}

      {snapshot.phase === "champion_select" ? (
        <DraftWorkspace
          snapshot={snapshot}
          plan={currentPlan}
          catalog={catalog}
          dataDragonVersion={dataDragonVersion}
          recommendationMessage={liveRecommendations.message}
          recommendationsLoading={liveRecommendations.loading}
          opggGuide={opgg.guide}
          opggMessage={opgg.message}
          opggLoading={opgg.loading}
          banAdvice={personalizedBanAdvice}
          banAdviceMessage={opggBan.message}
          banAdviceLoading={opggBan.loading}
          selectedPathId={selectedPathId}
          onSelectPath={selectPath}
          selectedRuneId={selectedRuneId}
          onSelectRune={setSelectedRuneId}
          selectedSpellPairId={selectedSpellPairId}
          onSelectSpellPair={setSelectedSpellPairId}
          plannedChampion={plannedChampion}
          onPlanChampion={setPlannedChampion}
          selectedOpponentId={selectedOpponentId}
          onSelectOpponent={setSelectedOpponentId}
          selectedRole={effectiveRole}
          onSelectRole={setManualRole}
          customGameTestMode={customGameTestMode}
          onCustomGameTestModeChange={setCustomGameTestMode}
          previewControls={isDemo}
        />
      ) : null}

      {snapshot.phase === "loading" ? <LoadingView plan={frozenPlan} catalog={catalog} dataDragonVersion={dataDragonVersion} /> : null}

      {snapshot.phase === "active_game" ? (
        <InGameOverlay
          snapshot={snapshot}
          plan={frozenPlan}
          selectedPathId={selectedPathId}
          onSelectPath={selectPath}
          detectedOwnedItemIds={detectedOwnedItemIds}
          manualOwnedItemIds={manualOwnedItemIds}
          onToggleManualItem={toggleManualItem}
          onOpenResearch={onOpenResearch}
          bridgeLabel={bridge.label}
          catalog={catalog}
          dataDragonVersion={dataDragonVersion}
        />
      ) : null}

      {profileOpen && showChrome ? (
        <PlayerProfilePanel
          local={playerProfile.local}
          profile={playerProfile.profile}
          loading={playerProfile.loading}
          error={playerProfile.error}
          connected={playerProfile.connected}
          catalog={catalog}
          dataDragonVersion={dataDragonVersion}
          onConnect={(config) => void playerProfile.connect(config)}
          onRefresh={() => void playerProfile.refresh()}
          onDisconnect={playerProfile.disconnect}
          onClose={() => setProfileOpen(false)}
        />
      ) : null}

      {snapshot.phase === "post_game" ? (
        <StateMessage
          icon={<CircleCheck size={30} />}
          eyebrow="Post-game detected"
          title="The match overlay is hidden."
          body="The frozen match plan is no longer displayed. The companion will reset when the client returns to its next state."
          detail="No post-game outcome is used to rewrite the recommendations you saw before the match."
        />
      ) : null}

      {showChrome && snapshot.phase !== "champion_select" ? (
        <footer className="companion-footer">
          <span><ShieldCheck size={14} aria-hidden="true" /> Read-only local integration</span>
          <span><Gamepad2 size={14} aria-hidden="true" /> No injected or prescriptive coaching</span>
          <p>
            Challenger Lens Companion is not endorsed by Riot Games and does not reflect the views or
            opinions of Riot Games or anyone officially involved in producing or managing Riot
            Games properties. Riot Games and all associated properties are trademarks or
            registered trademarks of Riot Games, Inc.
          </p>
        </footer>
      ) : null}
    </div>
  );
}
