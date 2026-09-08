import { invoke, isTauri } from "@tauri-apps/api/core";
import { browserDemoPhases, createBrowserDemoSnapshot } from "./demo";
import type {
  ChampionRef,
  DraftBan,
  DraftSelectionState,
  DraftSlot,
  DraftSnapshot,
  LeaguePhase,
  LeagueSnapshot,
  MapRef,
  QueueRef,
  Region,
  Role,
  RunePageRef,
  SpellRef,
} from "./types";

export const LEAGUE_SNAPSHOT_COMMAND = "get_league_snapshot";
export const OPGG_MATCHUP_GUIDE_COMMAND = "get_opgg_matchup_guide";
export const OPGG_BAN_ADVICE_COMMAND = "get_opgg_ban_advice";
export const LOCAL_PLAYER_PROFILE_COMMAND = "get_local_player_profile";
export const OPGG_PLAYER_PROFILE_COMMAND = "get_opgg_player_profile";
export const OPGG_MATCH_DETAIL_COMMAND = "get_opgg_match_detail";

export interface OpggMatchupRequest {
  position: "top" | "mid" | "jungle" | "adc" | "support";
  myChampion: string;
  opponentChampion: string;
}

export interface OpggBanAdviceRequest {
  position: "top" | "mid" | "jungle" | "adc" | "support";
  champion: string;
}

export interface LocalChampionMasteryRecord {
  championId: number;
  championLevel: number;
  championPoints: number;
  highestGrade: string;
  lastPlayTime: number;
}

export interface LocalPlayerProfileSeed {
  gameName: string;
  tagLine: string;
  region: string;
  summonerLevel: number;
  patch?: string;
  masteries: readonly LocalChampionMasteryRecord[];
}

export interface OpggPlayerProfileRequest {
  gameName: string;
  tagLine: string;
  region: string;
}

export interface OpggMatchDetailRequest {
  region: string;
  gameId: string;
  createdAt: string;
}

export type CompanionBridgeKind = "tauri" | "browser_demo";

export interface CompanionBridge {
  readonly kind: CompanionBridgeKind;
  readonly label: string;
  getSnapshot(): Promise<LeagueSnapshot>;
  getOpggMatchupGuide?(request: OpggMatchupRequest): Promise<unknown>;
  getOpggBanAdvice?(request: OpggBanAdviceRequest): Promise<unknown>;
  getLocalPlayerProfile?(): Promise<LocalPlayerProfileSeed>;
  getOpggPlayerProfile?(request: OpggPlayerProfileRequest): Promise<unknown>;
  getOpggMatchDetail?(request: OpggMatchDetailRequest): Promise<unknown>;
  setDemoPhase?(phase: LeaguePhase): void;
  subscribe?(listener: (snapshot: LeagueSnapshot) => void): () => void;
}

type UnknownRecord = Record<string, unknown>;

const championNames: Record<number, string> = {
  38: "Kassadin",
  55: "Katarina",
  58: "Renekton",
  61: "Orianna",
  69: "Cassiopeia",
  84: "Akali",
  91: "Talon",
  113: "Sejuani",
  134: "Syndra",
  163: "Taliyah",
  166: "Akshan",
  222: "Jinx",
  238: "Zed",
  517: "Sylas",
  526: "Rell",
};

const spellNames: Record<number, string> = {
  1: "Cleanse",
  3: "Exhaust",
  4: "Flash",
  6: "Ghost",
  7: "Heal",
  11: "Smite",
  12: "Teleport",
  14: "Ignite",
  21: "Barrier",
};

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function boolean(value: unknown): boolean {
  return value === true;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function championRef(value: unknown): ChampionRef | undefined {
  const id = number(value);
  if (!id || id <= 0) return undefined;
  return { id, name: championNames[id] ?? `Champion ${id}` };
}

function spellRef(value: unknown): SpellRef | undefined {
  const id = number(value);
  if (!id || id <= 0) return undefined;
  return { id, name: spellNames[id] ?? `Spell ${id}` };
}

function role(value: unknown): Role | undefined {
  const normalized = text(value)?.toUpperCase();
  if (normalized === "MIDDLE") return "MID";
  if (normalized === "BOTTOM" || normalized === "BOT") return "ADC";
  if (normalized === "UTILITY") return "SUPPORT";
  return normalized && ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"].includes(normalized)
    ? (normalized as Role)
    : undefined;
}

function region(value: unknown): Region | undefined {
  const normalized = text(value)?.toUpperCase();
  if (!normalized) return undefined;
  if (normalized === "EUW" || normalized === "EUW1") return "EUW";
  if (["EUNE", "EUN", "EUN1"].includes(normalized)) return "EUNE";
  return undefined;
}

function queueRef(value: unknown): QueueRef | undefined {
  const queue = record(value);
  const id = queue ? number(queue.id) : undefined;
  const name = queue ? text(queue.name) : undefined;
  return id !== undefined && name ? { id, name } : undefined;
}

function mapRef(value: unknown): MapRef | undefined {
  const map = record(value);
  const id = map ? number(map.id) : undefined;
  const name = map ? text(map.name) : undefined;
  return id !== undefined && name ? { id, name } : undefined;
}

function phase(value: unknown): LeaguePhase {
  switch (text(value)?.toLowerCase()) {
    case "client_idle":
    case "idle":
      return "idle";
    case "lobby":
    case "queue":
      return "lobby";
    case "champion_select":
      return "champion_select";
    case "loading":
      return "loading";
    case "active_game":
      return "active_game";
    case "post_game":
      return "post_game";
    default:
      return "client_closed";
  }
}

function selectionState(slot: UnknownRecord): DraftSelectionState {
  if (boolean(slot.lockedIn)) return "locked";
  if (championRef(slot.championId)) return "selected";
  if (championRef(slot.championPickIntent)) return "hovered";
  return "empty";
}

function sanitizeSlot(value: unknown, team: DraftSlot["team"], index: number): DraftSlot {
  const slot = record(value) ?? {};
  return {
    slot: index,
    team,
    champion: championRef(slot.championId) ?? championRef(slot.championPickIntent),
    role: role(slot.assignedRole),
    isLocal: team === "ally" && boolean(slot.isLocalPlayer),
    selectionState: selectionState(slot),
  };
}

function sanitizeRunePage(value: unknown): RunePageRef | undefined {
  const page = record(value);
  if (!page) return undefined;
  const selected = array(page.selectedPerkIds)
    .map(number)
    .filter((id): id is number => id !== undefined && id > 0);
  return {
    primaryStyleId: number(page.primaryStyleId) ?? 0,
    secondaryStyleId: number(page.subStyleId) ?? 0,
    selectedPerkIds: selected.filter((id) => id < 5000 || id >= 5100),
    statShardIds: selected.filter((id) => id >= 5000 && id < 5100),
  };
}

function timerPhase(value: unknown): NonNullable<DraftSnapshot["timer"]>["phase"] {
  const valueText = text(value)?.toLowerCase() ?? "";
  if (valueText.includes("ban")) return "ban";
  if (valueText.includes("pick")) return "pick";
  if (valueText.includes("final")) return "finalization";
  return "planning";
}

function sanitizeDraft(value: unknown): DraftSnapshot | undefined {
  const draft = record(value);
  if (!draft) return undefined;
  const timer = record(draft.timer);
  const allies = array(draft.allies).map((slot, index) => sanitizeSlot(slot, "ally", index));
  const enemies = array(draft.enemies).map((slot, index) => sanitizeSlot(slot, "enemy", index));
  const localSlot = allies.find((slot) => slot.isLocal);
  const allyBans = array(draft.allyBanIds);
  const enemyBans = array(draft.enemyBanIds);
  const bans: DraftBan[] = [
    ...allyBans.map((id, index) => ({ slot: index, team: "ally" as const, champion: championRef(id) })),
    ...enemyBans.map((id, index) => ({ slot: index, team: "enemy" as const, champion: championRef(id) })),
  ];
  const rawSpells = array(draft.currentSpellIds);
  const firstSpell = spellRef(rawSpells[0]);
  const secondSpell = spellRef(rawSpells[1]);

  return {
    timer: timer
      ? {
          phase: timerPhase(timer.phase),
          remainingMs: Math.max(number(timer.adjustedTimeLeftMs) ?? 0, 0),
        }
      : undefined,
    localChampion: championRef(draft.localChampionId) ?? localSlot?.champion,
    assignedRole: role(draft.assignedRole) ?? localSlot?.role,
    allies,
    enemies,
    bans,
    currentRunes: sanitizeRunePage(draft.currentRunePage),
    currentSpells: firstSpell && secondSpell ? [firstSpell, secondSpell] : undefined,
  };
}

/**
 * Converts the native payload to the UI contract by reconstructing only
 * explicitly allowed fields. Any unexpected identity fields are discarded.
 */
export function sanitizeNativeSnapshot(value: unknown): LeagueSnapshot {
  const raw = record(value) ?? {};
  const observedAtMs = number(raw.observedAtMs);
  const activeGame = record(raw.activeGame);
  const gameTimeSeconds = activeGame ? number(activeGame.gameTimeSeconds) ?? 0 : 0;
  const mapId = activeGame ? number(activeGame.mapNumber) : undefined;
  const mapName = activeGame ? text(activeGame.mapName) : undefined;
  const nativeMap = mapRef(raw.map);

  return {
    phase: phase(raw.state),
    observedAt: observedAtMs
      ? new Date(observedAtMs).toISOString()
      : new Date().toISOString(),
    patch: text(raw.patch),
    region: region(raw.region),
    queue: queueRef(raw.queue),
    map: nativeMap ?? (mapId !== undefined && mapName ? { id: mapId, name: mapName } : undefined),
    draft: sanitizeDraft(raw.championSelect),
    activeGame: activeGame
      ? {
          startedAt: new Date(Date.now() - Math.max(gameTimeSeconds, 0) * 1_000).toISOString(),
          ownedItemIds: array(activeGame.ownedItemIds)
            .map(number)
            .filter((id): id is number => id !== undefined && id > 0),
        }
      : undefined,
  };
}

export class TauriCompanionBridge implements CompanionBridge {
  readonly kind = "tauri" as const;
  readonly label = "Local League connector";

  async getSnapshot(): Promise<LeagueSnapshot> {
    const payload = await invoke<unknown>(LEAGUE_SNAPSHOT_COMMAND);
    return sanitizeNativeSnapshot(payload);
  }

  async getOpggMatchupGuide(request: OpggMatchupRequest): Promise<unknown> {
    return invoke<unknown>(OPGG_MATCHUP_GUIDE_COMMAND, {
      position: request.position,
      myChampion: request.myChampion,
      opponentChampion: request.opponentChampion,
    });
  }

  async getOpggBanAdvice(request: OpggBanAdviceRequest): Promise<unknown> {
    return invoke<unknown>(OPGG_BAN_ADVICE_COMMAND, {
      position: request.position,
      champion: request.champion,
    });
  }

  async getLocalPlayerProfile(): Promise<LocalPlayerProfileSeed> {
    return invoke<LocalPlayerProfileSeed>(LOCAL_PLAYER_PROFILE_COMMAND);
  }

  async getOpggPlayerProfile(request: OpggPlayerProfileRequest): Promise<unknown> {
    return invoke<unknown>(OPGG_PLAYER_PROFILE_COMMAND, {
      gameName: request.gameName,
      tagLine: request.tagLine,
      region: request.region,
    });
  }

  async getOpggMatchDetail(request: OpggMatchDetailRequest): Promise<unknown> {
    return invoke<unknown>(OPGG_MATCH_DETAIL_COMMAND, {
      region: request.region,
      gameId: request.gameId,
      createdAt: request.createdAt,
    });
  }
}

export class BrowserDemoCompanionBridge implements CompanionBridge {
  readonly kind = "browser_demo" as const;
  readonly label = "Browser demo — synthetic session";
  private currentPhase: LeaguePhase;
  private readonly listeners = new Set<(snapshot: LeagueSnapshot) => void>();

  constructor(initialPhase: LeaguePhase = "champion_select") {
    this.currentPhase = initialPhase;
  }

  async getSnapshot(): Promise<LeagueSnapshot> {
    return createBrowserDemoSnapshot(this.currentPhase);
  }

  async getLocalPlayerProfile(): Promise<LocalPlayerProfileSeed> {
    return {
      gameName: "Demo Player",
      tagLine: "DEMO",
      region: "EUW",
      summonerLevel: 143,
      patch: "16.17",
      masteries: [
        { championId: 134, championLevel: 18, championPoints: 284_300, highestGrade: "S+", lastPlayTime: Date.now() - 86_400_000 },
        { championId: 61, championLevel: 14, championPoints: 173_800, highestGrade: "S", lastPlayTime: Date.now() - 172_800_000 },
        { championId: 163, championLevel: 11, championPoints: 98_450, highestGrade: "S-", lastPlayTime: Date.now() - 604_800_000 },
      ],
    };
  }

  async getOpggPlayerProfile(request: OpggPlayerProfileRequest): Promise<unknown> {
    const now = new Date().toISOString();
    return {
      profile: `LolGetSummonerProfile(Data(Summoner("${request.gameName}","${request.tagLine}",null,null,143,"${now}",[LeagueStat("SOLORANKED",TierInfo("PLATINUM",3,62,null),38,27)],RankedMostChampions([MyChampionStat(134,31,19,12,"Syndra"),MyChampionStat(61,22,13,9,"Orianna"),MyChampionStat(163,12,5,7,"Taliyah")]))))`,
      matches: `LolListSummonerMatches(Data([GameHistory("demo-1","${now}","SOLORANKED",[Participant(134,"Syndra","MID",Stats(8,3,11,"WIN"))]),GameHistory("demo-2","${now}","SOLORANKED",[Participant(134,"Syndra","MID",Stats(4,7,5,"LOSE"))])]))`,
    };
  }

  async getOpggMatchDetail(request: OpggMatchDetailRequest): Promise<unknown> {
    const opponent = request.gameId === "demo-2" ? [7, "LeBlanc"] as const : [103, "Ahri"] as const;
    return `Team([Participant(false,134,"Syndra","BLUE","MID",Stats(0)),Participant(false,${opponent[0]},"${opponent[1]}","RED","MID",Stats(0))])`;
  }

  setDemoPhase(nextPhase: LeaguePhase): void {
    this.currentPhase = nextPhase;
    const snapshot = createBrowserDemoSnapshot(nextPhase);
    for (const listener of this.listeners) listener(snapshot);
  }

  subscribe(listener: (snapshot: LeagueSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export function createCompanionBridge(): CompanionBridge {
  if (isTauri()) return new TauriCompanionBridge();
  const location = (globalThis as { location?: { search?: string } }).location;
  const requestedPhase = new URLSearchParams(location?.search ?? "").get("phase") as LeaguePhase | null;
  const initialPhase = requestedPhase && browserDemoPhases.includes(requestedPhase)
    ? requestedPhase
    : "champion_select";
  return new BrowserDemoCompanionBridge(initialPhase);
}
