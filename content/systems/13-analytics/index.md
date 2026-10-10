---
title: "Analytics / Counters / Stream Processing"
description: "Define what a number means before choosing how to count, window, replay, or approximate it."
order: 13
tags: ["Scale", "Event time", "Aggregation"]
---

## 1. Absolutely Important Invariants

### Primary invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Each aggregate states its duplicate and lateness semantics. | A dashboard total is meaningless without knowing what events it includes. | Retries counted twice or late events silently ignored. | Stable event identity, defined dedup horizon, event-time windows and correction policy. |
| Acknowledged input remains replayable within the recovery contract. | A failed processor must not erase the source of a metric. | Only aggregated counters survive; raw events are discarded too early. | Durable retained input/log or canonical archive with checkpoint coverage. |

### Supporting invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Checkpoint and output form a recoverable boundary. | A crash can otherwise skip or repeat increments. | Advance offset before effect, or effect before offset without dedup. | Transactional stream boundary or idempotent sink keyed by event/window version. |
| One hot key cannot block all progress. | A popular campaign can dominate a partition. | Every click increments one database row or one stream key. | Partial aggregation, salting and second-stage merge where the metric is decomposable. |

## 2. Why the Naive Design Fails

Start with `Client → API → PostgreSQL`, incrementing a campaign counter for every click.

```text
Worker reads event E42, increments counter, then crashes before recording progress.
Worker restarts from its last checkpoint and reads E42 again.
Counter increments twice for one logical click.
```

Moving the checkpoint first instead loses E42 when the worker crashes before increment. Neither ordering alone gives exactly one effect. Couple sink state and processed identity atomically, use transactional stream processing within its actual boundary, or write an idempotent replacement result.

At 100,000 clicks/second for one campaign, a single row or partition becomes a hot serialization point. Partial aggregates reduce write frequency, but late events and replay still need well-defined semantics.

## 3. Core Deep Dives

### Duplicate handling and replay

**Problem:** Count logical events according to a clear contract.

**Naive approach and why it fails:** Assume a queue delivers each event once.

**Common solution:** Stable event IDs, dedup state and idempotent/transactional sink; retain input for backfills.

**Trade-off:** Dedup memory grows with event rate and retention.

**Failure to probe:** A replay exceeds the dedup horizon.

**Interviewer follow-up:** Are these totals approximate telemetry or billable money?

### Event time, watermarks and lateness

**Problem:** Assign events to the time they happened, despite delay.

**Naive approach and why it fails:** Use processing clock and close windows immediately.

**Common solution:** Event-time windows, progress watermarks, allowed lateness and updatable/retracted results.

**Trade-off:** More lateness tolerance means more state and slower finality.

**Failure to probe:** One idle partition holds back the watermark forever.

**Interviewer follow-up:** What exactly does “final” mean when a device reconnects a day later?

### Hot keys and approximate structures

**Problem:** Scale aggregation while respecting error bounds.

**Naive approach and why it fails:** Increment one counter row for every event and store all unique IDs forever.

**Common solution:** Local/partial combining, salted keys for decomposable metrics, approximate sketches where error is allowed.

**Trade-off:** Global merges cost latency; approximate results cannot substitute for exact billing.

**Failure to probe:** Distinct counts from shards are added despite overlapping users.

**Interviewer follow-up:** Which aggregates are safely mergeable?

## 4. Canonical Solution Patterns

| Pattern | When to use it / problem it solves |
| --- | --- |
| Idempotent sink / transactional inbox | Prevent replays from repeating durable aggregate effects. |
| Event-time window + watermark | Define aggregation boundaries under out-of-order input. |
| Partial aggregation | Reduce per-event writes to hot downstream keys. |
| Replayable log | Recover processors and recompute under new logic. |
| Mergeable sketch | Estimate high-cardinality metrics with a stated error budget. |
| Backpressure | Keep ingestion/processing memory bounded when the sink slows. |

See the [cross-system pattern index](../../patterns/index.md) for the same mechanisms in other families.

## 5. Study Topics

### The effect/checkpoint gap

#### What problem does it solve?

Avoid both lost events and duplicate increments.

#### How does it work?

For a database sink, atomically insert the event ID and apply its effect. Commit, then advance stream progress. If commit outcome is unknown, replay sees the ID and skips the already applied effect.

#### Example

```text
BEGIN
  INSERT processed(event_id) ON CONFLICT DO NOTHING
  if inserted: UPDATE counters SET value = value + 1
COMMIT
then record/ack stream progress
```
This protects that database effect. A separate external HTTP call is outside the transaction and needs its own identity protocol.

#### Failure scenario

Dedup records expire before a historical backfill. Replaying old events against live counters adds them again. Rebuild into a separate versioned result or retain sufficient identity history.

#### Trade-offs

Per-event dedup writes can dominate throughput. Windowed replacement outputs reduce writes but need versions and deterministic recomputation.

#### When would I use it?

Exact logical-event aggregates written to a transactional database.

#### Interview questions around this topic

Which boundary does Kafka’s transactional processing cover, and does it include your external database?

### Watermarks are progress estimates

#### What problem does it solve?

Distinguish late data from absent data without waiting forever.

#### How does it work?

Use event timestamps for windows. A watermark expresses a processor’s estimate/contract of event-time progress; close or emit windows under a configured lateness policy. Late events may update results, enter a side stream or be rejected explicitly.

#### Example

For a 12:00–12:01 window with two-minute allowed lateness, a click at 12:00:50 arriving at 12:02 can correct the window. A click arriving the next day follows the documented late-data/backfill policy.

#### Failure scenario

A producer’s clock jumps far into the future. A naive max-timestamp watermark can prematurely close valid windows; validate timestamp ranges and handle partition progress/idle sources carefully.

#### Trade-offs

Longer allowed lateness grows state and postpones finality. “Real time” and “final” should be separate output labels.

#### When would I use it?

Mobile telemetry, click streams and network-delayed observations.

#### Interview questions around this topic

How do you handle an idle partition without losing its future late events?

### Decompose hot aggregates carefully

#### What problem does it solve?

Spread work without changing the meaning of the result.

#### How does it work?

Compute per-shard partial sums/counts and merge. For averages merge sum and count, not unweighted averages. For distinct users use exact set union or a compatible mergeable sketch, not addition.

#### Example

Shard A has 100 clicks from 10 users; B has 200 clicks from 15 users, five shared. Click total is 300; distinct users are 20, not 25. A compatible sketch estimates the union without retaining every ID.

#### Failure scenario

A partial aggregate is sent twice and blindly added twice. Use unique batch IDs or versioned replacement for each partial/window, then merge deterministically.

#### Trade-offs

Salting a hot key improves throughput but delays final merging and complicates updates/retractions. Some order-sensitive computations cannot be decomposed this way.

#### When would I use it?

High-rate counters, campaign metrics and approximate dashboards with explicit accuracy requirements.

#### Interview questions around this topic

How do deletions or corrections propagate through your aggregation hierarchy?

## 6. Quiz

Write or say your reasoning before opening the answers. Name the invariant, the failure window, and the recovery mechanism.

### Conceptual questions

1. What does event time mean?

2. Why does at-least-once input overcount naive counters?

3. Why is checkpoint-before-effect unsafe?

4. Why is effect-before-checkpoint also unsafe alone?

5. What is a watermark?

6. What is allowed lateness?

7. Why keep raw input?

8. What makes a hot key?

9. Can you add shard distinct counts?

10. Does Kafka exactly-once mean exactly one external HTTP charge?

### Scenario questions

11. Counter commit succeeds; offset commit fails. Recover.

12. An event arrives a day late. What happens?

13. One campaign overwhelms a partition. Scale it.

14. A backfill exceeds dedup retention. Can it target live counters?

15. One producer sends timestamps in the future. Protect windows.

### Trade-off questions

16. Exact counters or approximate sketches?

17. Processing-time or event-time windows?

18. Short or long lateness window?

19. Incremental updates or recompute windows?

20. One hot total or sharded partials?

<details>
<summary>Reveal all 20 answers and reasoning</summary>

**1.** When the event occurred according to the accepted timestamp contract, distinct from when a worker processed it.

**2.** A replay repeats the increment unless its logical event identity is tracked or the output is idempotent.

**3.** A crash after checkpoint but before effect causes restart to skip an event whose contribution was never applied.

**4.** A crash after effect but before checkpoint replays the event and repeats its contribution.

**5.** A progress estimate/contract in event time used to decide when windows can emit or close; it is not proof that no older event can ever arrive.

**6.** The policy window during which delayed events can still update an aggregate after normal window progress.

**7.** It enables replay, debugging and recomputation when logic changes or derived state is lost, within retention limits.

**8.** One aggregation key receives enough traffic to saturate its serial processing path even when other shards are idle.

**9.** No, shared users are counted repeatedly. Use set union or compatible mergeable sketches.

**10.** No. Its transactional guarantees cover specified Kafka processing boundaries; external effects require their own coordination/idempotency.

**11.** Replay the event, find its processed identity or replace the same versioned output, then advance progress without reapplying the increment.

**12.** Apply the stated late-data policy: correction/backfill, side output or explicit exclusion. Do not silently label an incomplete count exact.

**13.** Use local combining or salted partial aggregates and a merge stage if the computation permits decomposition; preserve dedup and version semantics.

**14.** Not safely with additive replay. Rebuild into separate versioned results or provide a complete dedup/history strategy before merging.

**15.** Validate/limit timestamp skew and prevent a single bad source from advancing global progress; quarantine invalid data and handle per-source watermarks.

**16.** Exactness is necessary for contractual/billing totals; sketches suit large analytical sets when error bounds are explicit and acceptable.

**17.** Processing time is simpler and reflects ingestion load; event time reflects user activity but needs late/reordered-event handling.

**18.** Short windows finalize quickly with more excluded/corrected late data; long windows retain state and delay finality.

**19.** Incremental updates are fast but corrections/dedup are complex; recomputation is simpler to reason about when retained input and compute budget suffice.

**20.** One total is simple but serializes every event. Partials scale decomposable aggregates at the cost of merge delay and versioned correction handling.

</details>

## End-to-End Request Walkthrough

Producer assigns stable event ID and timestamp → durable ingest ACK → partitioned processor deduplicates/updates event-time state → checkpoint coordinates with the permitted output boundary → sink stores idempotent window/partial version → query merges results and labels provisional versus final. Late events follow correction policy; replay uses the same identities or a separate result generation.

## What If This Fails?

| Injected failure | Correctness and availability | Recovery |
| --- | --- | --- |
| Processor crashes after sink commit | Replay is likely; naive additive sinks double count. | Deduplicate the event or replace the same versioned output. |
| Input partition idle | Watermark may stop; window availability lags. | Apply an idle-source policy and still classify later arrivals correctly. |
| Sink slows down | Backlog grows; unbounded buffering risks process failure. | Backpressure, durable retention and lag alerts. |
| Raw log expires before recovery | Exact rebuild may be impossible. | Restore an archive/checkpoint with full coverage or disclose the data gap; do not fabricate totals. |

## What Should Trigger In My Head?

**Analytics →** define the number · event identity · effect/checkpoint boundary · event time · lateness · hot-key decomposition · error budget.
