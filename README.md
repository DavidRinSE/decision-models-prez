# Decision Model Demo

A small CLI for a live technical presentation. It compares **two model architectures solving the same decision problem**:

- **OpenAI**: a traditional autoregressive LLM that generates a decision token by token.
- **Jev**: a purpose-built decision model that returns a decision directly.

The demo isn't about whether a model can return structured JSON. Both can. It's about how each architecture arrives at a decision, what it can tell you about that decision, and how fast it does it. Both models get the same tickets, the same policy and the same output format.

## Install

Requires Node.js 22+ and pnpm.

```bash
pnpm install
```

## Configure

```bash
cp .env.example .env
```

| Variable         | Used by | Purpose                     |
| ---------------- | ------- | --------------------------- |
| `OPENAI_API_KEY` | OpenAI  | API key                     |
| `OPENAI_MODEL`   | OpenAI  | Model name                  |
| `JEV_API_KEY`    | Jev     | TypeSafe API key (from [console.typesafe.ai](https://console.typesafe.ai)) |
| `JEV_MODEL`      | Jev     | Optional. Defaults to `jev-latest`. Pin e.g. `jev-1.14.0` for repeatable runs |
| `JEV_BASE_URL`   | Jev     | Optional. Defaults to `https://api.typesafe.ai` |

`.env` is git-ignored.

## Run

```bash
pnpm demo:llm --ticket high       # OpenAI
pnpm demo:jev --ticket high       # Jev
pnpm demo:compare --ticket high   # both, side by side
```

- `--ticket high|low|ambiguous` picks the example ticket. The default is `high`.
- `--raw` also prints the full provider API response. `demo:compare` shows only the decision part of each response (`output_parsed` for OpenAI, `answers` for Jev), with `...` marking the rest.
- `--help` shows usage.

```bash
pnpm typecheck
```

## The tickets

Defined once in `src/tickets.ts`:

| ID          | Label                         | Message |
| ----------- | ----------------------------- | ------- |
| `high`      | Critical business disruption  | "Our entire team has been unable to log in since this morning. We have a client presentation in two hours and urgently need access." |
| `low`       | Routine support request       | "Where can I change the color theme in my account settings? No rush." |
| `ambiguous` | Partial service impairment    | "The dashboard has been slow today. I can still use it, but it's affecting my workflow." |

## The decision policy

Defined once in `src/policy.ts` and shared by both integrations. Each model must decide:

- `escalate` (boolean): whether the ticket needs **immediate human attention**. This is different from assigning a priority. Generally, critical incidents are escalated and routine requests aren't.
- `priority` (`low` | `medium` | `high`):
  - **HIGH**: critical business disruption, widespread outage, or complete inability to use a core service.
  - **MEDIUM**: material impairment of functionality without a complete outage or immediate critical business impact.
  - **LOW**: routine questions, cosmetic issues, or minor inconveniences.

Each integration may translate these descriptions into its own API format, such as a prompt and JSON schema for OpenAI or decision definitions for Jev, but must keep the same meaning. `policyText()` renders the whole policy as plain text for providers that take prose instructions. No keyword matching or hardcoded rules decide the outcome. The models do.

## Project layout

```text
src/
├── types.ts     Shared types: SupportTicket, TicketDecision, ModelResult, ...
├── tickets.ts   The three example tickets
├── policy.ts    The shared decision policy
├── cli.ts       --ticket / --raw parsing and usage text
├── output.ts    Terminal formatting: printResult, printComparison
├── pricing.ts   List prices used to estimate cost per request
├── llm.ts       OpenAI entry point (Responses API + strict structured output)
├── jev.ts       Jev entry point      (TypeSafe System One API, typed questions)
└── compare.ts   Comparison entry point (runs both on one ticket, then printComparison)
```

## The OpenAI integration

`src/llm.ts` reads top to bottom in four sections:

1. **The request.** `policyText()` becomes the `instructions`, the ticket message becomes the `input`, and `DECISION_SCHEMA` (built from `DECISION_FIELDS` and `PRIORITY_LEVELS`) is sent as a **strict JSON schema** (`text.format.type = "json_schema"`, `strict: true`). The API constrains generation to that schema, so the reply contains exactly `escalate` and `priority` and nothing else. The model isn't asked for a confidence score.
2. **The API call: `callOpenAI()`.** This is the one call to `client.responses.parse(...)` and the only place the model runs. It's timed with `performance.now()`. It sends `temperature: 0`; if the model rejects that parameter (reasoning models do), it retries once without it. `--raw` shows which `temperature` was used. Only the successful request is timed, and SDK auto-retries are off, so the latency is a single request.
3. **The decision: `toDecision()`.** Application code, not the model, decides whether the output is usable. It rejects incomplete responses, refusals, and anything that doesn't match `TicketDecision`, then returns the decision.
4. **`runOpenAI(ticket)`.** Combines the steps into a `ModelResult`. It's exported so `compare.ts` can reuse it.

The output shows the ticket, model, decision, latency, and token usage (`inputTokens`, `outputTokens`, `reasoningTokens`, `totalTokens`). Add `--raw` to also print the full API response. The SDK adds its parsed fields (`output_parsed`, `parsed`) to the object it shows.

Errors exit with code 1 and a one-line explanation. Covered cases: missing `OPENAI_API_KEY`/`OPENAI_MODEL`, a rejected key, an unknown model, rate limits, network failures, refusals, and incomplete output.

`OPENAI_MODEL` must support structured outputs on the Responses API, for example `gpt-4.1-mini` or `gpt-4o`.

## The Jev integration

### Which API contract

Jev is made by **TypeSafe AI**. `src/jev.ts` follows TypeSafe's official contract only: the [System One API reference](https://docs.typesafe.ai/api/system-one) and its [OpenAPI spec](https://api.typesafe.ai/openapi.json), checked on 2026-11-06.

jev-ai.org also documents a Jev API. It is a separate service that describes itself as sitting on an "upstream" and accepts `typesafe/jev-1.13` as an alias. Its contract is different (`/api/v1/systemone/`, `sk-glm5-` keys, `jev-1.13` IDs, extra response fields such as `latency_ms` and `charged_tokens`, a different error envelope), so nothing from it is used here. A jev-ai.org key won't work with this script.

| | Official contract |
| --- | --- |
| Endpoint | `POST https://api.typesafe.ai/v1/systemone` |
| Auth | `Authorization: Bearer <key>` |
| Model | `model` is required. `jev-latest` (alias, currently `jev-1.14.0`), or a pinned ID like `jev-1.14.0` / `jev-1.13.0`. The response's `model` field gives the versioned ID that answered. |
| Request | `{ model, state, questions: { <id>: { type, instructions, criteria? } } }` |
| Noul answer | `{ type: "noul", noul }`: `noul` is the probability that the answer is yes. There is no `confidence` field. |
| Choice answer | `{ type: "choice", choice, confidence, probabilities }`: `choice` is the highest-probability label, and `probabilities` holds one value per label, summing to about 1. |
| Usage | `{ input_tokens, output_tokens }`. Only input tokens are billed. |
| Errors | 400, 401, 413, 415, 422 (validation detail), 429, 529 (overloaded) |

### How `src/jev.ts` works

`src/jev.ts` has the same four sections as `llm.ts`:

1. **The request.** The ticket message is sent as the `state`. Two questions go in the same request, both built from `policy.ts`:
   - `escalate`: a `noul` question. Its `instructions` ask whether the ticket requires immediate human escalation and include `ESCALATION_POLICY` word for word.
   - `priority`: a `choice` question. Its `criteria` map `low`, `medium` and `high` to the `PRIORITY_POLICY` descriptions word for word.
2. **The API call: `callJev()`.** One `fetch`, with no retries and a 30 s timeout, timed with `performance.now()`.
3. **The decision.** `readAnswers()` checks both answers against the documented schema and rejects anything malformed. `toDecision()` takes the more probable outcome for each field: `escalate` is `noul >= 0.5`, and `priority` is Jev's `choice`. The result is the same `{ escalate, priority }` shape that the OpenAI script returns.
4. **`runJev(ticket)`.** Returns a `ModelResult` and is exported for `compare.ts`.

The output also shows:

- **Native probabilities**, exactly as returned: `escalate.yes` (the Noul value) and the `priority` distribution. P(no) isn't shown because the API doesn't return it as a separate value.
- **Notes**, which include:
  - the Choice `confidence`, labeled as a measure of how concentrated the distribution is. It is not the probability that the chosen label is correct.
  - an **UNCERTAIN** flag when `noul` falls between 0.3 and 0.7, or when the chosen priority's probability is below 0.7. The decision still shows the more probable outcome, but the flag says it shouldn't be acted on automatically.
- **Metrics**: wall-clock latency and token usage. Add `--raw` to also print the full response.

Errors exit with code 1 and a one-line explanation. Covered cases: missing key, each documented HTTP status (with the API's error body), timeouts, network failures, non-JSON bodies, and answers that don't match the schema.

### Probabilities, confidence and thresholds

- **A Noul value is a probability. A Choice `confidence` is not.** TypeSafe computes `confidence` from the shape of the distribution: 1 when all the probability is on one label, 0 when it's spread evenly. It means different things for different numbers of options. For example, a confidence of 0.5 means a top probability of 0.67 with 3 options, but 0.55 with 10. When the decision depends on one label, read that label's probability.
- **The 0.3 / 0.7 thresholds are this demo's review policy.** They're the starting points TypeSafe's docs suggest, not values tuned on data. TypeSafe describes Jev as trained to return calibrated probabilities, but this demo doesn't verify calibration on support tickets. A probability above 0.7 is not evidence that the real-world risk of a wrong escalation is under 30%. Calibration for a specific use case has to be measured on that use case's own labeled data.
- **`jev-latest` can move.** When a new release ships, the alias points to it and its answers can change. Pin `JEV_MODEL` to a versioned ID if you need runs to stay repeatable.

## Typed decision questions vs. an LLM's structured JSON

Both scripts end up with the same `{ escalate, priority }` object, but they get there differently.

| | OpenAI (`llm.ts`) | Jev (`jev.ts`) |
| --- | --- | --- |
| What you send | Prose instructions plus a JSON Schema for the reply | A `state` plus typed questions (`noul`, `choice`) |
| What the model does | Generates tokens. Constrained decoding keeps them inside the schema. | Returns an answer per question. The question's type fixes the answer's shape. |
| What comes back | A JSON document with one value per field | For each question, a value **and** a probability distribution over the possible answers |
| Uncertainty | None in the reply. A schema-valid `"medium"` looks the same whether the model was sure or not, and the demo deliberately doesn't ask the model to describe its own confidence. | Part of every answer: P(yes) for a Noul, a per-label distribution and `confidence` for a Choice |
| Policy encoding | The whole policy in one prompt | Each policy piece sits next to the decision it governs: the escalation rule in the Noul's instructions, each priority description as that label's criterion |
| Who decides | The generated value *is* the decision | Application code turns probabilities into a decision and decides when a person should review it |

A strict JSON schema guarantees the **format** of an LLM's answer, not how certain the model was. Jev's typed questions return a distribution, so your code can treat a 0.52 and a 0.99 differently.

## The comparison

`src/compare.ts` runs `runOpenAI()` and then `runJev()` on the same ticket. The calls run one after the other so they don't share network bandwidth. It then prints:

- both decisions and whether they agree
- both latencies
- both costs, per request and per 1M tickets
- each provider's own probabilities, usage and notes

If either call fails, it prints that provider's error and the other provider's result on its own, then exits with code 1. It never prints a comparison with one side missing.

## Cost

`src/pricing.ts` holds the list prices, in USD per 1M tokens. They're set by hand, not fetched from either provider.

| Provider | Model | Input | Output |
| --- | --- | --- | --- |
| OpenAI | `gpt-6-luna` | $0.10 | $0.50 |
| Jev | any | $0.042 | not billed |

Cost is each response's billed token counts times these prices. OpenAI reasoning tokens are part of `output_tokens` and are billed as output. OpenAI prices are looked up by the exact `OPENAI_MODEL` value, so any other model shows cost as `N/A`. Add it to `OPENAI_PRICES` to price it. The output shows the cost of one request and the same cost scaled to 1M tickets.

## How results are normalized

Every provider's response is reduced to one `ModelResult` (`src/types.ts`):

| Field           | Required | Meaning |
| --------------- | -------- | ------- |
| `provider`      | yes      | Display name, e.g. `OpenAI` |
| `model`         | no       | Model identifier |
| `ticket`        | yes      | The ticket that was decided |
| `decision`      | yes      | `{ escalate, priority }`: the only part compared directly |
| `latencyMs`     | yes      | Wall-clock request time |
| `probabilities` | no       | Decision probabilities **as returned natively by the provider** |
| `usage`         | no       | Usage metrics in the provider's own units and names |
| `costUsd`       | no       | USD cost of the request at the list prices in `src/pricing.ts` |
| `notes`         | no       | Provider-specific remarks, e.g. confidence and uncertainty flags |
| `raw`           | yes      | Full API response, shown with `--raw` |
| `rawTruncated`  | no       | `true` when `raw` keeps only some properties; `--raw` marks the rest with `...` |

Rules:

- **Only `decision`, `latencyMs` and `costUsd` are compared side by side.** Tokens aren't comparable across providers, but dollars are.
- **`probabilities` are provider-native.** Don't fill them in for a provider that doesn't return decision probabilities, and don't derive look-alike values from something else.
- **`usage` isn't comparable across providers.** Tokens from one architecture aren't the same unit of work as another's, so the comparison view shows usage per provider with a note, never as a head-to-head number.
- **Missing metrics show `N/A`.** Nothing is estimated or invented.
