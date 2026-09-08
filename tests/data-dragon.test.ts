import { describe, expect, it } from "vitest";

import { readCachedDataDragonCatalog } from "../src/companion/dataDragon";
import type { StorageLike } from "../src/companion/recommendation-client";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe("Data Dragon cache", () => {
  it("preserves normalized rune rows when the catalog is reopened", () => {
    const version = "16.17.1";
    const storage = new MemoryStorage();
    storage.setItem(`challenger-lens:data-dragon:v3:${version}`, JSON.stringify({
      version,
      championNames: { 268: "Azir" },
      itemData: { 1056: { name: "Doran's Ring", tags: [], into: [], purchasable: true } },
      spellNames: { 4: "Flash" },
      runeStyles: [{
        id: 8200,
        name: "Sorcery",
        icon: "perk-images/Styles/7202_Sorcery.png",
        slots: [[{
          id: 8214,
          name: "Summon Aery",
          icon: "perk-images/Styles/Sorcery/SummonAery/SummonAery.png",
        }]],
      }],
    }));

    const catalog = readCachedDataDragonCatalog(version, storage);

    expect(catalog?.runeStyles?.[0]?.slots[0]?.[0]).toMatchObject({
      id: 8214,
      name: "Summon Aery",
    });
  });
});
