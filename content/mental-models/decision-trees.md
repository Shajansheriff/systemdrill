---
title: "Architecture Decision Trees"
description: "Start from the pressure on the system. Add a mechanism only when its branch applies."
order: 1
tags: ["Reasoning", "Decision guide"]
---

A decision tree narrows the next question; it does not prove a design correct. At each leaf, name the failure mode that still remains.

## Need async work?

```text
Does the user need the result before the response?
├─ Yes → keep the critical path synchronous; set deadlines.
└─ No → persist a job and return its durable identity.
   ├─ One group must complete a task → durable queue + workers.
   ├─ Independent readers need history → retained event log.
   ├─ Business write and enqueue must agree → transactional outbox.
   ├─ Attempts may repeat → idempotent consumer/effect boundary.
   └─ Producer can outrun consumers → backpressure + admission.
```

A queue does not create processing capacity. Estimate arrival rate versus sustainable service rate, then bound backlog age and retention. A job taking 2 seconds with 50 workers has at most roughly 25 jobs/second of capacity before overhead; a 100/second arrival rate grows backlog by about 75/second.

Study: [Notifications](../systems/12-notifications/index.md), [Queue vs. Kafka](../comparisons/queue-vs-kafka.md).

## Multiple users modifying the same resource?

```text
What must change atomically?
├─ One row / key
│  ├─ Conflicts rare → versioned conditional update.
│  └─ Contention high → short serialization + bounded admission.
├─ Several rows in one DB → transaction, constraints, ordered locks.
├─ Cross-row predicate → appropriate locking or Serializable + retry.
└─ Independent services → explicit saga and reconciliation.
   Temporary ownership? → lease + token checked by the resource.
```

“Use a lock” is incomplete. State who owns it, when it expires, what a paused former owner can still do, and where stale writes are rejected. A five-minute TTL is not a five-minute process lifetime.

Study: [Booking](../systems/04-booking/index.md), [Concurrency comparison](../comparisons/optimistic-vs-pessimistic-locking.md).

## Reads are too slow?

```text
Measure the slow path first.
├─ Query scans too much → index / narrower query / bounded result.
├─ Same data requested repeatedly → derived cache.
│  ├─ Cold/hot miss burst → coalescing + origin concurrency cap.
│  └─ Mutable data → freshness contract + invalidation/versioning.
├─ Stale reads allowed and primary saturated → read replicas.
├─ Large immutable bytes → object storage + CDN when egress warrants.
└─ One node truly exceeds capacity → partition by access/invariant key.
```

Do not add a cache to hide an unbounded query without understanding it. Test the cache-miss path and identify whether stale values are merely inconvenient or violate authorization/ownership.

Study: [Read-heavy](../systems/01-read-heavy/index.md), [Cache strategies](../comparisons/cache-strategies.md).

## A remote call timed out?

```text
Can the remote side already have committed?
├─ No, verified rejection → fix/retry according to error class.
└─ Yes or unknown → record UNKNOWN, keep logical operation identity.
   ├─ Idempotent provider API → retry the same scoped key.
   ├─ Queryable operation reference → query status/reconcile.
   └─ Neither → retain evidence and escalate ambiguous outcomes.
Need to undo a verified effect? → new idempotent compensation.
```

Timeout is an observation about your wait, not proof about remote state. Retrying with a new payment/shipment key can duplicate an irreversible effect.

Study: [Payments](../systems/05-payments/index.md), [Orders](../systems/06-ecommerce/index.md).

## Need live updates?

```text
Which direction and frequency?
├─ Frequent bidirectional edits/messages → WebSocket.
├─ Server-only event stream → SSE.
└─ Rare updates / simple compatibility → polling or long polling.
For all choices:
├─ Lost updates matter → durable history + stable cursor.
├─ Slow client → bounded buffer + resumable disconnect.
├─ Reconnect storm → jitter + authentication/catch-up budgets.
└─ Permission changes → reauthorize actions, not just connections.
```

Transport improves latency. Durable acceptance, delivery and read receipts remain distinct application-level guarantees.

Study: [Messaging](../systems/03-messaging/index.md), [Transport comparison](../comparisons/websocket-vs-sse-vs-polling.md).

## Data is derived from another authority?

```text
Could source and projection diverge?
├─ Local state + publication gap → outbox or CDC.
├─ Duplicate events → stable IDs / idempotent replacement.
├─ Reordered events → entity versions + deletion tombstones.
├─ Projection destroyed → snapshot + retained change-log rebuild.
└─ Strict permission/ownership decision → consult current authority.
```

The rebuild plan needs a boundary: which source snapshot, which log position, and enough retention to bridge them. “Replay Kafka” is incomplete if the needed records expired.

Study: [Search](../systems/11-search/index.md), [Analytics](../systems/13-analytics/index.md).

## Need regional availability?

```text
Can concurrent regional decisions conflict?
├─ No / independently owned keys → regional partitions with safe handoff.
├─ Mergeable observations → define conflict/merge and staleness policy.
└─ Yes, scarce ownership or spend limit → coordinated authority/quorum.
During a partition:
├─ Correctness requires one winner → some writes wait or fail.
└─ Stale projection is acceptable → serve it with explicit bounds.
```

Replication is not a promise by itself. Specify acknowledgement policy, failover fencing, maximum data-loss window and restore time. Do not claim that independent writers can both stay available and protect one seat without coordination.

Study: [Consistency levels](../comparisons/consistency-levels.md).

## Is this component justified?

For every box, finish this sentence: **“Without this, the system fails when ___, violating ___.”**

If the answer is only “for scale,” name the measured quantity: hot-key QPS, bytes/second, transaction duration, fan-out amplification, retained state or recovery time. If no pressure justifies the box, keep the simpler design and describe the trigger for adding it.

