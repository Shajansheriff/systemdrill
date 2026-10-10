---
title: "Cross-System Pattern Index"
description: "Reusable mechanisms, the failures they address, and the system families where they belong."
order: 1
tags: ["Reference", "Cross-system"]
---

Start with the invariant you need to protect. Each entry says why the mechanism exists and links to a concrete family where it is taught. These are decision aids, not a mandatory architecture checklist.

## Database

### Transactions

Commit a set of local writes as one unit. Use for seat + booking, journal entries, or state + outbox. A transaction does not include a remote provider call.

**Study it in:** [Booking](../systems/04-booking/index.md), [Payments](../systems/05-payments/index.md), [E-commerce](../systems/06-ecommerce/index.md).

### Isolation levels

Choose which concurrent anomalies are forbidden. Read Committed does not make an ordinary read-then-unconditional-write safe; Serializable can abort transactions that must be retried.

**Study it in:** [Booking](../systems/04-booking/index.md), [Payments](../systems/05-payments/index.md), [E-commerce](../systems/06-ecommerce/index.md).

### Optimistic locking

Write only if the stored version/state still matches the one read. Check affected rows; retry or report conflict. Best when conflicts are infrequent.

**Study it in:** [Booking](../systems/04-booking/index.md), [Geospatial](../systems/07-geospatial/index.md), [File storage](../systems/08-file-storage/index.md).

### Pessimistic locking

Lock the contested rows, recheck and change them in a short transaction. Acquire multiple locks in a fixed order; keep network calls outside.

**Study it in:** [Booking](../systems/04-booking/index.md), [Payments](../systems/05-payments/index.md), [E-commerce](../systems/06-ecommerce/index.md).

### MVCC

Readers observe snapshots while writers create new versions. It reduces read/write blocking but is not automatically serializable and needs version cleanup.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Booking](../systems/04-booking/index.md), [Payments](../systems/05-payments/index.md).

### Indexing

Maintain a structure matching access paths so queries avoid scans. Extra indexes cost write work and storage; verify selectivity and query plans.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Geospatial](../systems/07-geospatial/index.md), [Search](../systems/11-search/index.md).

### Replication

Maintain copies for reads/recovery. State when writes are acknowledged and which failovers preserve them; asynchronous replicas can be stale.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Messaging](../systems/03-messaging/index.md), [Payments](../systems/05-payments/index.md).

### Partitioning

Split rows or data ranges by a useful key. Distinguish partitioning inside one DB from sharding across authorities; cross-partition transactions complicate invariants.

**Study it in:** [Messaging](../systems/03-messaging/index.md), [Geospatial](../systems/07-geospatial/index.md), [Analytics](../systems/13-analytics/index.md).

### Connection pooling

Bound active DB work instead of letting every request create a connection. A full pool should queue briefly or reject, not grow indefinitely.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Booking](../systems/04-booking/index.md), [E-commerce](../systems/06-ecommerce/index.md).

## Cache

### Cache-aside

On miss, load from the authority and populate a disposable cache. Guard hot misses and define what can be stale.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Feed](../systems/02-feed/index.md), [Geospatial](../systems/07-geospatial/index.md).

### Write-through

Update the authoritative write path and cache synchronously under a defined protocol. Two independent writes are still not atomic.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Feed](../systems/02-feed/index.md).

### Write-behind

Accept/cache writes and flush later only with a durable buffer if loss is unacceptable. Faster writes shift durability and recovery obligations into the buffering layer.

**Study it in:** [Analytics](../systems/13-analytics/index.md), [Geospatial](../systems/07-geospatial/index.md).

### TTL

Bound how long a cached observation is reused. Expiration does not prove freshness if readers race fills, and does not stop an old lease holder from executing.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Booking](../systems/04-booking/index.md), [Notifications](../systems/12-notifications/index.md).

### Invalidation

Remove or supersede derived state after a change. Version events so a late fill cannot revive older data; authorization may require a current read.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Feed](../systems/02-feed/index.md), [Search](../systems/11-search/index.md).

### Cache stampede

Many misses request the same origin work at once. Use single-flight, TTL jitter and bounded origin concurrency; define safe stale-serving rules.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Streaming](../systems/10-streaming/index.md).

### Hot keys

One key dominates traffic despite evenly distributed key counts. Replicate cache reads, coalesce loads or split mergeable counters; arbitrary sharding does not split one key.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Booking](../systems/04-booking/index.md), [Analytics](../systems/13-analytics/index.md).

## Async Processing

### Queues

Transfer durable work for one consumer group to complete. Delivery may repeat; choose retention, acknowledgement and retry semantics explicitly.

**Study it in:** [E-commerce](../systems/06-ecommerce/index.md), [Streaming](../systems/10-streaming/index.md), [Notifications](../systems/12-notifications/index.md).

### Workers

Execute bounded jobs independently of request lifetimes. Track ownership/lease and durable progress; one worker process is not the job record.

**Study it in:** [File storage](../systems/08-file-storage/index.md), [Streaming](../systems/10-streaming/index.md), [Notifications](../systems/12-notifications/index.md).

### Retries

Repeat transiently failed or uncertain work with the same logical identity. Distinguish unknown outcomes from verified failure.

**Study it in:** [Booking](../systems/04-booking/index.md), [Payments](../systems/05-payments/index.md), [Notifications](../systems/12-notifications/index.md).

### Acknowledgement

Report a specific boundary: durable acceptance, completed job or device delivery. ACK only after the state implied by that contract is durable.

**Study it in:** [Messaging](../systems/03-messaging/index.md), [Notifications](../systems/12-notifications/index.md), [Analytics](../systems/13-analytics/index.md).

### Visibility timeout

Temporarily hide claimed work so a crashed worker can be replaced. A slow worker may overlap with its replacement; consumers still need idempotency/fencing.

**Study it in:** [E-commerce](../systems/06-ecommerce/index.md), [Streaming](../systems/10-streaming/index.md), [Notifications](../systems/12-notifications/index.md).

### DLQ

Retain poison/exhausted work with error context and a replay path. A DLQ is observable failure handling, not successful processing.

**Study it in:** [E-commerce](../systems/06-ecommerce/index.md), [Notifications](../systems/12-notifications/index.md).

### Backpressure

Slow or reject producers when downstream capacity is full. Bound memory/queues and decide which work may expire rather than hiding overload.

**Study it in:** [Messaging](../systems/03-messaging/index.md), [Notifications](../systems/12-notifications/index.md), [Analytics](../systems/13-analytics/index.md).

## Event Systems

### Kafka / retained log

Keep ordered partition logs for independently progressing consumers and replay. It earns its cost when multiple readers/history are needed, not merely because work is asynchronous.

**Study it in:** [Feed](../systems/02-feed/index.md), [Search](../systems/11-search/index.md), [Analytics](../systems/13-analytics/index.md).

### Partitions

Choose the order and parallelism unit. A single key usually remains serial; adding partitions changes routing and can disrupt order during migration.

**Study it in:** [Messaging](../systems/03-messaging/index.md), [Search](../systems/11-search/index.md), [Analytics](../systems/13-analytics/index.md).

### Consumer groups

Let a group share partition processing while independent groups each observe the log. Adding workers beyond partition capacity does not create more per-partition parallelism.

**Study it in:** [Search](../systems/11-search/index.md), [Analytics](../systems/13-analytics/index.md).

### Ordering

Define the scope and the authority. Partition order is not global order, and parallel consumers may reorder external effects unless coordinated.

**Study it in:** [Messaging](../systems/03-messaging/index.md), [Collaboration](../systems/09-collaboration/index.md), [Notifications](../systems/12-notifications/index.md).

### Replay

Read retained history to rebuild projections or recover. Idempotent/versioned sinks and complete retention coverage are prerequisites.

**Study it in:** [Feed](../systems/02-feed/index.md), [Search](../systems/11-search/index.md), [Analytics](../systems/13-analytics/index.md).

### Offsets

Record a reader’s position in a partition. An offset is not proof that an external side effect committed atomically.

**Study it in:** [Search](../systems/11-search/index.md), [Analytics](../systems/13-analytics/index.md).

### At-least-once delivery

Expect redelivery after uncertain acknowledgement. Combine stable event IDs with atomic deduplication/effects or versioned replacement.

**Study it in:** [Messaging](../systems/03-messaging/index.md), [Notifications](../systems/12-notifications/index.md), [Analytics](../systems/13-analytics/index.md).

## Distributed Correctness

### Idempotency

Make repeating one logical operation produce no additional business effect. Scope a key, bind its parameters and persist state/results across retries.

**Study it in:** [Booking](../systems/04-booking/index.md), [Payments](../systems/05-payments/index.md), [E-commerce](../systems/06-ecommerce/index.md), [Notifications](../systems/12-notifications/index.md).

### Deduplication

Recognize repeated identity within a retention window. Dedup and the protected effect must share a transaction or a recoverable protocol.

**Study it in:** [Messaging](../systems/03-messaging/index.md), [Collaboration](../systems/09-collaboration/index.md), [Notifications](../systems/12-notifications/index.md), [Analytics](../systems/13-analytics/index.md).

### Transactional outbox

Commit business state and an outgoing event in one DB transaction; relay later. Relay delivery can repeat, so consumers remain idempotent.

**Study it in:** [Feed](../systems/02-feed/index.md), [Booking](../systems/04-booking/index.md), [E-commerce](../systems/06-ecommerce/index.md), [Search](../systems/11-search/index.md), [Notifications](../systems/12-notifications/index.md).

### Saga

Persist a workflow across independent authorities with explicit forward and compensating actions. Compensation is a new business action and may fail.

**Study it in:** [Booking](../systems/04-booking/index.md), [Payments](../systems/05-payments/index.md), [E-commerce](../systems/06-ecommerce/index.md).

### Reconciliation

Compare independent authorities to resolve lost events and unknown outcomes. Use durable references, amount/version checks and an audited exception path.

**Study it in:** [Booking](../systems/04-booking/index.md), [Payments](../systems/05-payments/index.md), [E-commerce](../systems/06-ecommerce/index.md).

### Leases

Grant ownership until an authority-defined deadline. Every protected transition checks current ownership; a TTL does not pause the old process.

**Study it in:** [Booking](../systems/04-booking/index.md), [Geospatial](../systems/07-geospatial/index.md), [File storage](../systems/08-file-storage/index.md).

### Fencing tokens

Give each ownership generation a monotonically increasing token; the protected resource rejects stale tokens. Tokens only work when the actual write authority validates them.

**Study it in:** [Booking](../systems/04-booking/index.md), [Geospatial](../systems/07-geospatial/index.md), [File storage](../systems/08-file-storage/index.md).

### Version numbers

Reject operations based on stale state and order derived updates. Versions must be comparable within the entity/authority that assigns them.

**Study it in:** [File storage](../systems/08-file-storage/index.md), [Collaboration](../systems/09-collaboration/index.md), [Search](../systems/11-search/index.md).

## Scaling

### Horizontal scaling

Add replicas for independent work. It does not remove a shared hot row, global lock or downstream bottleneck.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Messaging](../systems/03-messaging/index.md), [Notifications](../systems/12-notifications/index.md).

### Sharding

Route different keys to different storage authorities. Choose a key that preserves the common invariant/access path and plan migration and cross-shard work.

**Study it in:** [Messaging](../systems/03-messaging/index.md), [Geospatial](../systems/07-geospatial/index.md), [Analytics](../systems/13-analytics/index.md).

### Read replicas

Offload read queries that tolerate replica lag. Read-after-write and ownership decisions may still need the primary or a known applied watermark.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Feed](../systems/02-feed/index.md).

### Consistent hashing

Reduce key movement when cache/storage nodes change. Virtual nodes help balance keys, but a hot key still requires special handling.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [File storage](../systems/08-file-storage/index.md).

### Load balancing

Spread independent requests/connections and remove unhealthy targets. Stateful sessions need routing/reconnect semantics; balancing is not durable storage.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [Messaging](../systems/03-messaging/index.md), [Streaming](../systems/10-streaming/index.md).

### Rate limiting

Bound rate at a tenant/user/destination scope; distinguish burst, sustained rate and concurrency. Distributed enforcement requires coordinated state or explicit quotas.

**Study it in:** [Booking](../systems/04-booking/index.md), [E-commerce](../systems/06-ecommerce/index.md), [Notifications](../systems/12-notifications/index.md).

## Storage

### Object storage

Store large immutable bytes separately from transactional metadata. Upload completion and metadata publication need a recovery protocol.

**Study it in:** [File storage](../systems/08-file-storage/index.md), [Streaming](../systems/10-streaming/index.md).

### Multipart upload

Resume and validate pieces of a large object. Persist upload session identity, complete only verified parts and clean up abandoned sessions safely.

**Study it in:** [File storage](../systems/08-file-storage/index.md), [Streaming](../systems/10-streaming/index.md).

### Content hashing

Identify/verify bytes and optionally deduplicate. A hash is neither access control nor sufficient proof of publication completeness.

**Study it in:** [File storage](../systems/08-file-storage/index.md), [Streaming](../systems/10-streaming/index.md).

### CDN

Cache reusable bytes near readers. Define cache identity, authorization, invalidation and origin-miss behavior.

**Study it in:** [Read-heavy](../systems/01-read-heavy/index.md), [File storage](../systems/08-file-storage/index.md), [Streaming](../systems/10-streaming/index.md).

## Real Time

### WebSocket

Persistent bidirectional channel for frequent updates. Bound buffers, authenticate actions and resume from durable state after reconnect.

**Study it in:** [Messaging](../systems/03-messaging/index.md), [Collaboration](../systems/09-collaboration/index.md).

### SSE

HTTP server-to-client event stream with reconnect support. Persist/replay IDs if gaps matter; sending back uses separate HTTP requests.

**Study it in:** [Feed](../systems/02-feed/index.md), [Notifications](../systems/12-notifications/index.md).

### Long polling

Hold a request until data/deadline and then reconnect. Simpler infrastructure can cost more connections/requests under high churn.

**Study it in:** [Messaging](../systems/03-messaging/index.md), [Notifications](../systems/12-notifications/index.md).

### Presence

Approximate current connectivity using heartbeats/leases. Do not use it as proof of durable delivery or exclusive assignment.

**Study it in:** [Messaging](../systems/03-messaging/index.md), [Geospatial](../systems/07-geospatial/index.md), [Collaboration](../systems/09-collaboration/index.md).

## Search

### Inverted index

Map normalized terms to documents, with positions/statistics when needed. Candidate retrieval determines what ranking can possibly return.

**Study it in:** [Search](../systems/11-search/index.md).

### Indexing pipeline

Transform committed source changes into versioned search state. Handle deletes, replay, lag and snapshot boundaries.

**Study it in:** [Feed](../systems/02-feed/index.md), [Search](../systems/11-search/index.md).

### Ranking

Order a bounded candidate set using relevance signals under a latency budget. Define fallbacks and stable pagination/session semantics.

**Study it in:** [Feed](../systems/02-feed/index.md), [Search](../systems/11-search/index.md).

### Autocomplete

Use prefix/suggestion-oriented structures for partial queries at high request rates. Debounce/cancel obsolete requests and cap query work.

**Study it in:** [Search](../systems/11-search/index.md).

## Geo

### Geohash

Encode a location into a hierarchical cell key. Search neighboring/intersecting cells and filter exact distance; prefixes alone do not define nearest neighbors.

**Study it in:** [Geospatial](../systems/07-geospatial/index.md).

### Quadtrees

Subdivide space into four child regions adaptively. Dense areas can use finer cells, trading index maintenance for reduced candidate scans.

**Study it in:** [Geospatial](../systems/07-geospatial/index.md).

### Spatial indexing

Use spatial database/index structures to prune by bounding region before exact geometry/ETA checks. Coordinate reference systems and boundary handling matter.

**Study it in:** [Geospatial](../systems/07-geospatial/index.md).

### Nearest-neighbor queries

Expand candidate search and evaluate distance or road ETA until the requested eligible results are found under a latency budget.

**Study it in:** [Geospatial](../systems/07-geospatial/index.md).

## Deeper mechanics

- [Database concurrency](database/concurrency.md)
- [Cache freshness](caching/freshness.md)
- [Durable delivery](messaging/delivery.md)
- [Outbox, leases and reconciliation](distributed-correctness/recovery.md)
- [Atomic blob publication](storage/publication.md)
- [Connection and overload budgets](networking/overload.md)

## Primary references

Use these to verify vendor-specific guarantees; the book’s examples are design exercises, not copied product architectures.

- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html) and [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).
- [Apache Kafka design and delivery semantics](https://kafka.apache.org/41/design/design/).
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).
- [Redis distributed locks and fencing guidance](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/).

