---
title: "The Invariant-First Interview"
description: "A 45-minute reasoning framework for senior and staff system design conversations."
order: 2
tags: ["Interview", "Practice"]
---

The objective is a defensible design, not the maximum number of boxes. Build one correct critical path, then show how it behaves under concurrency, skew and partial failure.

## 0–5 minutes: define the promise

Ask what the representative action is and what must never go wrong. Separate hard correctness guarantees from desired latency, availability and freshness. State a failure model and distinguish assumptions from requirements.

For booking: “A seat cannot have two confirmed owners. Holds last five minutes under database time. Availability display may lag, but confirmation is authoritative.” Clarify whether groups of seats must be atomic and whether payments can finish after hold expiry.

For analytics: “Are duplicate clicks acceptable in a dashboard? Are these numbers used for billing? How late can mobile events arrive?” Those answers change the architecture more than picking Kafka early.

## 5–10 minutes: estimate only what changes a decision

Use explicit units and distinguish average from peak and skew. Useful quantities include read/write rate, bytes per operation, fan-out, hot-key load, retention and concurrent connections.

```text
Peak publishes/second × active followers/post = timeline writes/second
Concurrent viewers × bitrate = delivery bandwidth
Events/second × retention seconds × bytes/event = raw retained bytes
Arrival rate × average service time = average in-flight work
```

The last relation is Little’s law under stable conditions, not a license to extrapolate through an overloaded system. Check headroom, tail latency and failure capacity. Estimate enough to pick a boundary; avoid spending ten minutes multiplying arbitrary user counts.

## 10–18 minutes: start with one simple write and read

Use a client, an API and a database unless a concrete requirement already demands more. Sketch the data keys, uniqueness constraints and state transitions before adding caches or queues.

Walk a request end to end. State the **linearization/commit point** for the important decision: the conditional seat update, balanced journal commit, accepted message insert or manifest pointer swap. Identify which response is safe before and after that point.

Show one representative read path. Can it use a replica/cache, or must it observe the latest ownership/permission state? Mark derived data and its staleness contract explicitly.

## 18–30 minutes: break it and introduce justified mechanisms

Use three pressures:

1. **Concurrency:** two writers pass the same precondition. Show their interleaving and the atomic predicate/constraint that selects the outcome.
2. **Partial failure:** one side commits, the response is lost, the caller retries. Keep operation identity stable and describe recovery.
3. **Skew/overload:** one author, seat, tenant or aggregation key dominates. Explain why adding generic replicas does or does not help.

Pick three to five defining deep dives. For a feed, focus on fan-out, ranking, pagination and visibility. For a ledger, focus on posting identity, spendability, unknown outcomes and reconciliation. Do not replace this with a tour of every database you know.

## 30–38 minutes: prove recovery

Inject a failure immediately before and after each important boundary. Ask: what is durable, who retries, what identity is reused, and how does unfinished work become discoverable?

| Failure | Evidence needed | Mechanism to explain |
| --- | --- | --- |
| Commit response lost | Durable request/result identity | Retry same key and recover result |
| Crash before enqueue | Local business state plus task | Transactional outbox |
| Worker repeats task | Logical effect identity | Atomic dedup or idempotent sink |
| Lease holder pauses | New ownership generation | Fencing at protected resource |
| Projection disappears | Source snapshot and log coverage | Rebuild with exact cutoff |
| Provider outcome unknown | Attempt/provider reference | Query and reconcile |

Say when correctness remains intact but availability degrades. If a guarantee depends on synchronous replication, retention or provider idempotency, state that dependency. Never call a remote effect “exactly once” just because its queue has deduplication.

## 38–43 minutes: trade-offs and evolution

Offer one reasonable alternative and the condition under which it wins. Tie it to measured pressure rather than preference.

- “I would keep a relational authority until write/size limits justify partitioning; our current issue is repeated reads, so a cache addresses the measured bottleneck.”
- “I would pull celebrity posts because their fan-out dominates write work; ordinary authors remain pushed.”
- “I would permit stale feed ordering, but not stale permission checks.”

Explain the migration: backfill, catch-up boundary, validation, cutover and rollback. Staff-level discussion benefits from operational ownership, overload isolation and how to detect silently stuck workflows—not simply extra services.

## 43–45 minutes: close the loop

Return to the original invariants. Identify the mechanism that protects each one and the weakest dependency remaining. Name the most useful operational signals: conflict rate, oldest unfinished job, replication lag, cache miss QPS, unknown payment age or watermark lag.

If time runs out, prioritize one fully explained correctness path over an unfinished global diagram. A clear assumption is better than an unsupported promise.

## How to study this book

1. Read a family’s invariants and naive failure first. Close the page and reproduce the race timeline.
2. Draw the simplest correct path. Add a component only when you can name the failure it prevents.
3. Read the deep dives and work through the concrete study topics, including their failure scenarios.
4. Answer the 20 questions aloud before opening the answer section. Score explanations, not keyword matches.
5. Change one assumption: ten times the traffic, one hot key, an offline client, a lost ACK or a network partition.
6. Follow the [pattern index](../patterns/index.md) to another family using the same mechanism. Explain what changed and what stayed invariant.

A suggested loop is one chapter, one comparison and one failure injection per session. Revisit questions you could answer only after seeing the solution.

## Self-review rubric

| Check | A strong answer |
| --- | --- |
| Correctness | Names 2–6 important guarantees and their authorities |
| Mechanics | Shows a concrete predicate, transaction or state transition |
| Failure | Recovers ambiguous outcomes without inventing success/failure |
| Scale | Quantifies the actual bottleneck and accounts for skew |
| Trade-offs | States what becomes stale, slower, unavailable or more complex |
| Communication | Explains why each component earned its place |

Start with [read-heavy systems](../systems/01-read-heavy/index.md), or use the [decision trees](decision-trees.md) to practice unfamiliar prompts.

