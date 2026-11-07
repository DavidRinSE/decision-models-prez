// Side-by-side comparison entry point: runs both integrations on the same ticket.

import { config } from "dotenv";
import { parseCli } from "./cli";
// Simple versions for the demo. To switch back to the robust ones, change these two imports to
//   import { describeError as describeJevError, runJev } from "./jev";
//   import { describeError as describeOpenAIError, runOpenAI } from "./llm";
// and the `describe…Error` arguments below back to describeOpenAIError / describeJevError.
import { runJev } from "./jev-simple";
import { runOpenAI } from "./llm-simple";
import { printComparison, printResult } from "./output";
import type { ModelResult } from "./types";

config({ quiet: true });

async function attempt(
  provider: string,
  run: () => Promise<ModelResult>,
  describe: (error: unknown) => string,
): Promise<ModelResult | undefined> {
  try {
    return await run();
  } catch (error) {
    console.error(`${provider} error: ${describe(error)}`);
    return undefined;
  }
}

const { ticket, raw } = parseCli("demo:compare");

// One after the other, so the two requests don't compete for the network and their latencies are comparable.
const describeError = (error: unknown) => String(error);
const openai = await attempt("OpenAI", () => runOpenAI(ticket), describeError);
const jev = await attempt("Jev", () => runJev(ticket), describeError);

if (openai && jev) {
  printComparison(openai, jev, { raw });
} else {
  // Show whichever one succeeded, but don't pretend there's a comparison.
  const succeeded = openai ?? jev;
  if (succeeded) printResult(succeeded, { raw });
  process.exit(1);
}
