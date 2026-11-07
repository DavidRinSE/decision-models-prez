import { parseArgs } from "node:util";
import { TICKETS, TICKET_IDS } from "./tickets";
import type { SupportTicket, TicketId } from "./types";

export interface CliOptions {
  readonly ticket: SupportTicket;
  readonly raw: boolean;
}

function usage(script: string): string {
  return [
    `Usage: pnpm ${script} [--ticket <${TICKET_IDS.join("|")}>] [--raw]`,
    "",
    `  --ticket   Which example ticket to decide (default: high)`,
    `  --raw      Also print the full provider API response`,
    `  --help     Show this message`,
  ].join("\n");
}

/** Parse --ticket / --raw. Prints usage and exits on invalid input. */
export function parseCli(script: string, argv: string[] = process.argv.slice(2)): CliOptions {
  let values;
  try {
    ({ values } = parseArgs({
      // Older pnpm versions forward a literal "--" separator; ignore it.
      args: argv.filter((arg) => arg !== "--"),
      options: {
        ticket: { type: "string", short: "t", default: "high" },
        raw: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    console.error(`${(error as Error).message}\n\n${usage(script)}`);
    process.exit(1);
  }

  if (values.help) {
    console.log(usage(script));
    process.exit(0);
  }

  if (!TICKET_IDS.includes(values.ticket as TicketId)) {
    console.error(`Unknown ticket "${values.ticket}".\n\n${usage(script)}`);
    process.exit(1);
  }

  return { ticket: TICKETS[values.ticket as TicketId], raw: values.raw };
}
