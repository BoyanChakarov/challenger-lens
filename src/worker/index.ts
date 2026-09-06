import { config as loadDotEnv } from "dotenv";

import { pathToFileURL } from "node:url";

import { loadWorkerConfig } from "./config";
import { runIngestion } from "./pipeline";

loadDotEnv({ path: [".env.local", ".env"], quiet: true });

export { loadWorkerConfig } from "./config";
export { runIngestion } from "./pipeline";

async function main(): Promise<void> {
  let cancellationRequested = false;
  const requestCancellation = () => {
    cancellationRequested = true;
  };
  process.once("SIGINT", requestCancellation);
  process.once("SIGTERM", requestCancellation);

  try {
    const summary = await runIngestion(loadWorkerConfig(), {
      isCancellationRequested: () => cancellationRequested,
    });
    if (summary.status === "failed" || summary.status === "cancelled") {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker error";
    console.error(message.replace(/RGAPI-[A-Za-z0-9_-]+/gi, "[redacted Riot key]"));
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", requestCancellation);
    process.removeListener("SIGTERM", requestCancellation);
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  await main();
}
