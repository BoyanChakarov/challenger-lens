import { describe, expect, it } from "vitest";

import { loadWorkerConfig } from "../src/worker/config";

describe("worker configuration", () => {
  it("defaults to a personal-key-safe request interval", () => {
    const config = loadWorkerConfig({
      RIOT_API_KEY: "RGAPI-a-valid-placeholder-key",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SECRET_KEY: "test-server-secret-placeholder-value",
    });

    expect(config.platforms).toEqual(["EUW1", "EUN1"]);
    expect(config.riotMinRequestIntervalMs).toBe(1_200);
  });

  it("rejects a browser-safe publishable key for server writes", () => {
    expect(() =>
      loadWorkerConfig({
        RIOT_API_KEY: "RGAPI-a-valid-placeholder-key",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SECRET_KEY: "sb_publishable_not-a-server-secret",
      }),
    ).toThrow(/server-side secret/i);
  });
});
