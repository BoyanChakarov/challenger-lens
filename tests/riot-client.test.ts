import { describe, expect, it, vi } from "vitest";

import { RiotClient, riotClientInternals } from "../src/worker/riot-client";

describe("Riot client", () => {
  it("parses both numeric and date Retry-After headers", () => {
    expect(riotClientInternals.parseRetryAfter("2")).toBe(2_000);
    expect(
      riotClientInternals.parseRetryAfter(
        "Thu, 01 Jan 1970 00:00:02 GMT",
        1_000,
      ),
    ).toBe(1_000);
  });

  it("retries a 429 without putting the key in the URL", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("{}", { status: 429, headers: { "Retry-After": "0" } }),
      )
      .mockResolvedValueOnce(new Response('["EUW1_123"]', { status: 200 }));
    const client = new RiotClient({
      apiKey: "RGAPI-a-valid-placeholder-key",
      concurrency: 1,
      maxAttempts: 2,
      fetchImplementation: fetchMock,
      sleepImplementation: async () => undefined,
      randomImplementation: () => 0,
    });

    await expect(client.getRecentMatchIds("player-puuid", 1)).resolves.toEqual([
      "EUW1_123",
    ]);
    const firstCall = fetchMock.mock.calls[0];
    const url = String(firstCall?.[0]);
    const headers = firstCall?.[1]?.headers as Record<string, string>;
    expect(url).not.toContain("RGAPI");
    expect(headers["X-Riot-Token"]).toBe("RGAPI-a-valid-placeholder-key");
  });

  it("reserves spaced request slots when calls begin concurrently", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const starts: number[] = [];
    const fetchMock = vi.fn<typeof fetch>(async () => {
      starts.push(Date.now());
      return new Response('[]', { status: 200 });
    });
    const client = new RiotClient({
      apiKey: "RGAPI-a-valid-placeholder-key",
      concurrency: 3,
      maxAttempts: 1,
      minimumRequestIntervalMs: 100,
      fetchImplementation: fetchMock,
    });

    try {
      const requests = Promise.all([
        client.getRecentMatchIds("player-one", 1),
        client.getRecentMatchIds("player-two", 1),
        client.getRecentMatchIds("player-three", 1),
      ]);
      await vi.advanceTimersByTimeAsync(0);
      expect(starts).toEqual([0]);
      await vi.advanceTimersByTimeAsync(100);
      expect(starts).toEqual([0, 100]);
      await vi.advanceTimersByTimeAsync(100);
      await requests;
      expect(starts).toEqual([0, 100, 200]);
    } finally {
      vi.useRealTimers();
    }
  });
});
