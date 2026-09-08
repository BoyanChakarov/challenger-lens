import type { StorageLike } from "./recommendation-client";

const CACHE_PREFIX = "challenger-lens:data-dragon:v3";
const VERSION_CACHE_KEY = "challenger-lens:data-dragon:versions:v1";
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const PATCH_PATTERN = /^\d+\.\d+$/;
const REQUEST_TIMEOUT_MS = 1_500;

export interface DataDragonItem {
  name: string;
  tags: readonly string[];
  into: readonly number[];
  purchasable: boolean;
}

export interface DataDragonRune {
  id: number;
  name: string;
  icon: string;
}

export interface DataDragonRuneStyle {
  id: number;
  name: string;
  icon: string;
  slots: readonly (readonly DataDragonRune[])[];
}

export interface DataDragonCatalog {
  version: string;
  championNames: Readonly<Record<number, string>>;
  championAssetKeys?: Readonly<Record<number, string>>;
  itemData: Readonly<Record<number, DataDragonItem>>;
  spellNames: Readonly<Record<number, string>>;
  spellAssetKeys?: Readonly<Record<number, string>>;
  perkNames?: Readonly<Record<number, string>>;
  perkIcons?: Readonly<Record<number, string>>;
  styleNames?: Readonly<Record<number, string>>;
  styleIcons?: Readonly<Record<number, string>>;
  runeStyles?: readonly DataDragonRuneStyle[];
}

interface UnknownRecord {
  [key: string]: unknown;
}

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}

function storageKey(version: string): string {
  return `${CACHE_PREFIX}:${version}`;
}

function stringRecord(value: unknown): Record<number, string> {
  const source = record(value);
  if (!source) return {};
  const result: Record<number, string> = {};
  for (const [idText, entry] of Object.entries(source)) {
    const id = positiveInteger(idText);
    if (id && typeof entry === "string" && entry.trim()) result[id] = entry.trim();
  }
  return result;
}

function parseRuneStyles(value: unknown): DataDragonRuneStyle[] {
  return array(value).flatMap((styleValue) => {
    const style = record(styleValue);
    const id = positiveInteger(style?.id);
    if (!id || typeof style?.name !== "string" || typeof style?.icon !== "string") return [];
    const slots = array(style.slots).map((slotValue) =>
      // Riot's response wraps each row in { runes: [...] }, while our cache
      // stores the already-normalized row as an array. Accept both shapes so
      // reopening the app does not turn populated rune rows into empty ones.
      (Array.isArray(slotValue) ? slotValue : array(record(slotValue)?.runes)).flatMap((runeValue) => {
        const rune = record(runeValue);
        const runeId = positiveInteger(rune?.id);
        return runeId && typeof rune?.name === "string" && typeof rune?.icon === "string"
          ? [{ id: runeId, name: rune.name, icon: rune.icon }]
          : [];
      }),
    );
    return [{ id, name: style.name, icon: style.icon, slots }];
  });
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

function parseCatalog(value: unknown, expectedVersion: string): DataDragonCatalog | undefined {
  const raw = record(value);
  if (raw?.version !== expectedVersion) return undefined;
  const champions = record(raw.championNames);
  const items = record(raw.itemData);
  const spells = record(raw.spellNames);
  if (!champions || !items || !spells) return undefined;

  const championNames = stringRecord(champions);

  const itemData: Record<number, DataDragonItem> = {};
  for (const [idText, value] of Object.entries(items)) {
    const id = positiveInteger(idText);
    const item = record(value);
    if (!id || !item || typeof item.name !== "string" || !item.name.trim()) continue;
    itemData[id] = {
      name: item.name.trim(),
      tags: Array.isArray(item.tags)
        ? item.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      into: Array.isArray(item.into)
        ? item.into.map(positiveInteger).filter((next): next is number => next !== undefined)
        : [],
      purchasable: item.purchasable !== false,
    };
  }

  const spellNames = stringRecord(spells);

  return {
    version: expectedVersion,
    championNames,
    championAssetKeys: stringRecord(raw.championAssetKeys),
    itemData,
    spellNames,
    spellAssetKeys: stringRecord(raw.spellAssetKeys),
    perkNames: stringRecord(raw.perkNames),
    perkIcons: stringRecord(raw.perkIcons),
    styleNames: stringRecord(raw.styleNames),
    styleIcons: stringRecord(raw.styleIcons),
    runeStyles: parseRuneStyles(raw.runeStyles),
  };
}

export function readCachedDataDragonCatalog(
  version: string | undefined,
  storage: StorageLike | null = defaultStorage(),
): DataDragonCatalog | undefined {
  if (!version || !VERSION_PATTERN.test(version) || !storage) return undefined;
  try {
    const serialized = storage.getItem(storageKey(version));
    if (!serialized) return undefined;
    const parsed = parseCatalog(JSON.parse(serialized) as unknown, version);
    if (!parsed) storage.removeItem(storageKey(version));
    return parsed;
  } catch {
    return undefined;
  }
}

function extractCatalog(
  version: string,
  championsPayload: unknown,
  itemsPayload: unknown,
  spellsPayload: unknown,
  runesPayload: unknown,
): DataDragonCatalog | undefined {
  const championRows = record(record(championsPayload)?.data);
  const itemRows = record(record(itemsPayload)?.data);
  const spellRows = record(record(spellsPayload)?.data);
  if (!championRows || !itemRows || !spellRows) return undefined;

  const championNames: Record<number, string> = {};
  const championAssetKeys: Record<number, string> = {};
  for (const row of Object.values(championRows)) {
    const champion = record(row);
    const id = positiveInteger(champion?.key);
    if (id && typeof champion?.name === "string") championNames[id] = champion.name;
    if (id && typeof champion?.id === "string") championAssetKeys[id] = champion.id;
  }

  const itemData: Record<number, DataDragonItem> = {};
  for (const [idText, row] of Object.entries(itemRows)) {
    const id = positiveInteger(idText);
    const item = record(row);
    if (!id || !item || typeof item.name !== "string") continue;
    itemData[id] = {
      name: item.name,
      tags: Array.isArray(item.tags)
        ? item.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      into: Array.isArray(item.into)
        ? item.into.map(positiveInteger).filter((next): next is number => next !== undefined)
        : [],
      purchasable: record(item.gold)?.purchasable !== false,
    };
  }

  const spellNames: Record<number, string> = {};
  const spellAssetKeys: Record<number, string> = {};
  for (const row of Object.values(spellRows)) {
    const spell = record(row);
    const id = positiveInteger(spell?.key);
    if (id && typeof spell?.name === "string") spellNames[id] = spell.name;
    if (id && typeof spell?.id === "string") spellAssetKeys[id] = spell.id;
  }

  const perkNames: Record<number, string> = {};
  const perkIcons: Record<number, string> = {};
  const styleNames: Record<number, string> = {};
  const styleIcons: Record<number, string> = {};
  const runeStyles = parseRuneStyles(runesPayload);
  for (const styleValue of array(runesPayload)) {
    const style = record(styleValue);
    const styleId = positiveInteger(style?.id);
    if (!styleId) continue;
    if (typeof style?.name === "string") styleNames[styleId] = style.name;
    if (typeof style?.icon === "string") styleIcons[styleId] = style.icon;
    for (const slotValue of array(style?.slots)) {
      for (const runeValue of array(record(slotValue)?.runes)) {
        const rune = record(runeValue);
        const runeId = positiveInteger(rune?.id);
        if (!runeId) continue;
        if (typeof rune?.name === "string") perkNames[runeId] = rune.name;
        if (typeof rune?.icon === "string") perkIcons[runeId] = rune.icon;
      }
    }
  }

  return {
    version,
    championNames,
    championAssetKeys,
    itemData,
    spellNames,
    spellAssetKeys,
    perkNames,
    perkIcons,
    styleNames,
    styleIcons,
    runeStyles,
  };
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Resolve a League major.minor patch to the newest matching Data Dragon build. */
export async function resolveDataDragonVersion(
  patch: string | undefined,
  storage: StorageLike | null = defaultStorage(),
): Promise<string | undefined> {
  if (!patch) return undefined;
  if (VERSION_PATTERN.test(patch)) return patch;
  if (!PATCH_PATTERN.test(patch)) return undefined;

  try {
    const cached = storage?.getItem(VERSION_CACHE_KEY);
    if (cached) {
      const versions = JSON.parse(cached) as unknown;
      if (Array.isArray(versions)) {
        const match = versions.find(
          (version): version is string => typeof version === "string" && version.startsWith(`${patch}.`),
        );
        if (match) return match;
      }
    }
  } catch {
    // A missing or invalid cache falls through to the official version list.
  }

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", {
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) return undefined;
    const versions = payload.filter((version): version is string => typeof version === "string");
    try {
      storage?.setItem(VERSION_CACHE_KEY, JSON.stringify(versions));
    } catch {
      // Version caching is an optional performance optimization.
    }
    return versions.find((version) => version.startsWith(`${patch}.`));
  } catch {
    return undefined;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function loadDataDragonCatalog(
  version: string | undefined,
  storage: StorageLike | null = defaultStorage(),
): Promise<DataDragonCatalog | undefined> {
  if (!version || !VERSION_PATTERN.test(version)) return undefined;
  const cached = readCachedDataDragonCatalog(version, storage);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const base = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US`;
  try {
    const [champions, items, spells, runes] = await Promise.all([
      fetch(`${base}/champion.json`, { signal: controller.signal }),
      fetch(`${base}/item.json`, { signal: controller.signal }),
      fetch(`${base}/summoner.json`, { signal: controller.signal }),
      fetch(`${base}/runesReforged.json`, { signal: controller.signal }),
    ]);
    if (!champions.ok || !items.ok || !spells.ok || !runes.ok) return undefined;
    const catalog = extractCatalog(
      version,
      await champions.json(),
      await items.json(),
      await spells.json(),
      await runes.json(),
    );
    if (catalog && storage) {
      try {
        storage.setItem(storageKey(version), JSON.stringify(catalog));
      } catch {
        // Metadata enrichment is optional; aggregate evidence remains usable.
      }
    }
    return catalog;
  } catch {
    return undefined;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}
