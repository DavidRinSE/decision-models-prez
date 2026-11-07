import { styleText } from "node:util";
import type { ModelResult, NativeProbabilities, SupportTicket, UsageMetrics } from "./types";

const WIDTH = 60;
const RULE = "─".repeat(WIDTH);

const bold = (text: string) => styleText("bold", text);
const dim = (text: string) => styleText("dim", text);

function wrap(text: string, width = WIDTH - 2): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  return [...lines, line];
}

function row(label: string, value: string): string {
  return `  ${(label + ":").padEnd(Math.max(11, label.length + 2))}${value}`;
}

const yesNo = (value: boolean) => (value ? "YES" : "NO");
const percent = (p: number) => `${(p * 100).toFixed(1)}%`;

// One request costs fractions of a cent, so show 3 significant digits; per 1M tickets reads as normal money.
const perRequest = (usd: number | undefined) =>
  usd === undefined
    ? "N/A"
    : usd.toLocaleString("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 3 });
const perMillion = (usd: number | undefined) =>
  usd === undefined ? "N/A" : (usd * 1_000_000).toLocaleString("en-US", { style: "currency", currency: "USD" });

function formatUsage(usage: UsageMetrics | undefined): string[] {
  const entries = Object.entries(usage ?? {});
  if (entries.length === 0) return [row("Usage", "N/A")];
  return entries.map(([name, value]) => row(name, String(value)));
}

function formatNotes(notes: readonly string[]): string[] {
  return notes.flatMap((note) => wrap(note, WIDTH - 4).map((line, i) => `  ${i === 0 ? "•" : " "} ${line}`));
}

function formatProbabilities(probabilities: NativeProbabilities): string[] {
  return Object.entries(probabilities).flatMap(([field, options]) => [
    `  ${field}`,
    ...Object.entries(options).map(([option, p]) => `    ${option.padEnd(9)}${percent(p).padStart(6)}`),
  ]);
}

export function printHeader(ticket: SupportTicket): void {
  console.log();
  console.log(bold("CUSTOMER SUPPORT DECISION DEMO"));
  console.log(RULE);
  console.log();
  console.log(`${bold("TICKET:")} ${ticket.id.toUpperCase()} ${dim(`(${ticket.label})`)}`);
  const lines = wrap(ticket.message);
  lines.forEach((line, i) => {
    const open = i === 0 ? '"' : " ";
    const close = i === lines.length - 1 ? '"' : "";
    console.log(`${open}${line}${close}`);
  });
  console.log();
}

export function printFooter(): void {
  console.log(RULE);
  console.log();
}

function printRaw(result: ModelResult): void {
  console.log(bold(`RAW RESPONSE (${result.provider})`));
  const json = JSON.stringify(result.raw, null, 2);
  // Mark the properties that were left out, e.g. { ... "answers": {...} }.
  console.log(dim(result.rawTruncated ? json.replace("{\n", "{\n  ...\n") : json));
  console.log();
}

/** Print one provider's result. */
export function printResult(result: ModelResult, options: { raw: boolean }): void {
  printHeader(result.ticket);

  console.log(`${bold("MODEL:")} ${result.provider}${result.model ? dim(` (${result.model})`) : ""}`);
  console.log();

  console.log(bold("DECISION"));
  console.log(row("Escalate", yesNo(result.decision.escalate)));
  console.log(row("Priority", result.decision.priority.toUpperCase()));
  console.log();

  if (result.probabilities) {
    console.log(bold("NATIVE PROBABILITIES"));
    console.log(formatProbabilities(result.probabilities).join("\n"));
    console.log();
  }

  if (result.notes?.length) {
    console.log(bold("NOTES"));
    console.log(formatNotes(result.notes).join("\n"));
    console.log();
  }

  console.log(bold("METRICS"));
  console.log(row("Latency", `${Math.round(result.latencyMs)} ms`));
  console.log(row("Cost", perRequest(result.costUsd)));
  console.log(row("1M tickets", perMillion(result.costUsd)));
  console.log(formatUsage(result.usage).join("\n"));
  console.log();

  if (options.raw) printRaw(result);
  printFooter();
}

/** Print two providers' results side by side. */
export function printComparison(a: ModelResult, b: ModelResult, options: { raw: boolean }): void {
  printHeader(a.ticket);

  const COL = 18;
  const line = (label: string, left: string, right: string) =>
    `  ${label.padEnd(12)}${left.padEnd(COL)}${right}`;

  console.log(`  ${"".padEnd(12)}${bold(a.provider.padEnd(COL))}${bold(b.provider)}`);
  console.log();

  console.log(bold("DECISION"));
  console.log(line("Escalate", yesNo(a.decision.escalate), yesNo(b.decision.escalate)));
  console.log(line("Priority", a.decision.priority.toUpperCase(), b.decision.priority.toUpperCase()));
  const agree =
    a.decision.escalate === b.decision.escalate && a.decision.priority === b.decision.priority;
  console.log(`  Same decision: ${yesNo(agree)}`);
  console.log();

  console.log(bold("METRICS"));
  console.log(line("Latency", `${Math.round(a.latencyMs)} ms`, `${Math.round(b.latencyMs)} ms`));
  console.log(line("Cost", perRequest(a.costUsd), perRequest(b.costUsd)));
  console.log(line("1M tickets", perMillion(a.costUsd), perMillion(b.costUsd)));
  console.log(dim("  Cost = billed tokens × list prices in src/pricing.ts."));
  console.log();

  // Probabilities and usage are provider-native, so each provider gets its own block.
  for (const result of [a, b]) {
    console.log(bold(`${result.provider.toUpperCase()} — PROVIDER-NATIVE`));
    if (result.probabilities) {
      console.log(formatProbabilities(result.probabilities).join("\n"));
    } else {
      console.log(row("Probabilities", "N/A"));
    }
    if (result.notes?.length) console.log(formatNotes(result.notes).join("\n"));
    console.log(formatUsage(result.usage).join("\n"));
    console.log();
  }
  console.log(dim("  Usage is reported in each provider's own units and is not"));
  console.log(dim("  a measure of equivalent computational work."));
  console.log();

  if (options.raw) {
    printRaw(a);
    printRaw(b);
  }
  printFooter();
}
