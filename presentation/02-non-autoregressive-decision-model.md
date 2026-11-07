# Non-Autoregressive Decision Model — Direct Probabilities

A **conceptual transformer-based decision model**, drawn deliberately like the LLM diagram. Instead of generating tokens, it scores a predefined answer space and returns a typed probability distribution.

```mermaid
flowchart LR
    A[State + question + options] --> B[Tokenize + embed]
    B --> C[Transformer layers]
    C --> D[Decision scores / logits]
    D --> E[Probabilities over options]
    E --> F[Typed decision output]

    classDef transformer fill:#dceaff,stroke:#527fb9,color:#142f52,stroke-width:2px;
    classDef output fill:#e1f5ed,stroke:#329977,color:#174b3d;
    class C transformer;
    class D,E,F output;
```

**Example output:** `Approve: 0.85 · Reject: 0.15` (illustrative, not a model prediction).

## How to read it

1. **Tokenize + embed:** Encode the state, decision question, and possible answers.
2. **Transformer layers:** Build representations that account for the supplied information. This may use a decoder-only, encoder-style, or other transformer-based design.
3. **Decision scores:** A task-specific scoring mechanism produces logits for each valid option. For a mutually exclusive choice, softmax can turn these scores into probabilities; binary questions may use sigmoid or a two-option softmax.
4. **Typed output:** Return the answer and probability distribution directly, without sampling and appending text tokens in an autoregressive loop.

**Presentation takeaway:** The model can produce a decision distribution without serially generating an answer string. Multiple decisions over a shared state can potentially be scored together.

> Important nuance: This is an *illustrative model architecture*, **not a verified internal diagram of Jev**. TypeSafe says Jev produces typed probabilities in parallel and uses its own architecture/training, but has not publicly disclosed the exact backbone, scoring head, or detailed computational graph. A decision model need not have precisely the same transformer layers or attention configuration as an LLM.

## Comparison point

**Both models can produce probabilities.** The distinctions are (1) the output space—vocabulary tokens versus defined choices—and (2) the inference behavior—autoregressive token generation versus a direct, non-autoregressive decision readout. **Calibration** is another, independent question: outputting a number called a probability does not guarantee that number accurately reflects real-world correctness.

## Further reading

- [TypeSafe AI — Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- [Aman's AI Journal — Jev primer](https://aman.ai/primers/jev/)
