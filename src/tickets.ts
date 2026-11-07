import type { SupportTicket, TicketId } from "./types";

export const TICKETS: Readonly<Record<TicketId, SupportTicket>> = {
  high: {
    id: "high",
    label: "Critical business disruption",
    message:
      "Our entire team has been unable to log in since this morning. We have a client presentation in two hours and urgently need access.",
  },
  low: {
    id: "low",
    label: "Routine support request",
    message: "Where can I change the color theme in my account settings? No rush.",
  },
  ambiguous: {
    id: "ambiguous",
    label: "Partial service impairment",
    message: "The dashboard has been slow today. I can still use it, but it's affecting my workflow.",
  },
  // The tickets below sit on boundaries the policy doesn't resolve, so the models may disagree
  // or Jev may spread probability across labels.
  calm: {
    id: "calm",
    label: "Severe impact, calm tone",
    message:
      "No rush on this, but I noticed our CSV exports have been missing roughly 10% of rows since Tuesday. Everything else works fine. We only caught it because last week's totals didn't reconcile with finance.",
  },
  single: {
    id: "single",
    label: "One user fully blocked",
    message:
      "I'm the only person on my team who can't log in. Everyone else is fine. I've reset my password twice. I'm the account admin and I'm the one who approves payroll, which is due at 5pm today.",
  },
  security: {
    id: "security",
    label: "Possible account compromise",
    message:
      "Everything is working normally, but my login history shows a session from a country I've never been to, at 3am. I didn't share my password. Should I be worried?",
  },
  mixed: {
    id: "mixed",
    label: "Several issues in one ticket",
    message:
      "A few things: the logo on our invoices looks blurry, can you add a dark mode option, and also our payment webhook stopped firing about an hour ago so no orders are syncing to our warehouse. Thanks!",
  },
};

export const TICKET_IDS = Object.keys(TICKETS) as TicketId[];
