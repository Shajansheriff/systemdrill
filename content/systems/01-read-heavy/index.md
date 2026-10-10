---
title: "Read-heavy / Key-Value Systems"
description: "Fast lookups are easy. Correct mappings, hot keys, and stale reads are the real design problem."
order: 1
tags: ["Scale", "Caching", "URL shortener"]
---

## 1. Absolutely Important Invariants

### Primary invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| One key identifies one intended object. | A short link must never silently redirect to another owner’s content. | Two creators choose the same key and overwrite each other. | Unique key constraint; retry collisions; avoid reusing retired keys. |
| Acknowledged mappings survive the declared failure model. | Users publish links immediately after creation. | A server acknowledges before durable commit or fails over to a lagging replica. | Commit before success; choose replication acknowledgement and recovery objectives explicitly. |

### Supporting invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Revocation follows a stated freshness bound. | A deleted or abusive destination must stop being served. | CDN or cache retains an old positive entry. | Bounded TTL plus invalidation; authoritative checks for strict revocation. |
| A hot key cannot exhaust the origin. | One viral URL can dominate otherwise cheap reads. | Cache expiry causes every request to query the database. | Request coalescing, TTL jitter, per-key admission control. |

## 2. Why the Naive Design Fails

Start with `Client → API → PostgreSQL`, with `key` as a primary key. An indexed lookup is a good baseline; a cache is not required on day one.

```text
10:00:00  Link K receives 80,000 requests/second.
10:00:01  Every API request opens a database connection.
10:00:02  The pool fills; requests queue, time out, and retry.
10:00:03  Retries consume the remaining capacity.
```

The mapping may still be correct, but the latency and availability requirement fails: the database is doing identical work repeatedly. A cache removes repeated reads; a bounded connection pool and admission control prevent collapse when that cache fails.

A separate correctness race: A and B both generate `abc123`, both check that it is absent, then both insert. A preflight check cannot reserve the key. A unique constraint decides the winner atomically; the loser generates another key. Never implement collision handling as an upsert that overwrites the existing destination.

## 3. Core Deep Dives

### Key allocation and collision handling

**Problem:** Allocate short stable identifiers under concurrent writes.

**Naive approach and why it fails:** Check-then-insert has a race; random identifiers are not mathematically collision-free.

**Common solution:** Enforce uniqueness in storage and retry random-key collisions; use allocated numeric ranges if predictable IDs are acceptable.

**Trade-off:** Random keys cost collision retries; sequential IDs reveal volume and allow enumeration.

**Failure to probe:** Two allocators reuse an overlapping range after failover.

**Interviewer follow-up:** How would custom aliases change your allocation path?

### Caching and hot keys

**Problem:** Keep popular reads off the origin without losing control of freshness.

**Naive approach and why it fails:** A single global TTL makes many cache entries expire together, causing stampedes.

**Common solution:** Cache-aside with bounded TTL, jitter and single-flight misses; shard capacity by traffic, not just key count.

**Trade-off:** Stale reads and invalidation complexity buy lower latency.

**Failure to probe:** A cache outage suddenly restores the full origin QPS.

**Interviewer follow-up:** Can the database survive the uncached workload?

### Read-after-write and revocation

**Problem:** Define which reads must reflect the latest mapping.

**Naive approach and why it fails:** Read a lagging replica immediately after creation and return 404; cache that 404 for minutes.

**Common solution:** Route fresh writes’ reads to the leader or use a version/watermark; keep negative TTL short; enforce security-sensitive revocation at the authority.

**Trade-off:** Leader reads cost latency and concentrate load.

**Failure to probe:** A late cache fill resurrects a destination after deletion.

**Interviewer follow-up:** What is the maximum acceptable revocation delay?

## 4. Canonical Solution Patterns

| Pattern | When to use it / problem it solves |
| --- | --- |
| Unique constraints | Arbitrate concurrent key allocation at the authoritative store. |
| Cache-aside + single-flight | Serve repeated reads and coalesce concurrent misses for the same key. |
| TTL jitter | Spread refresh work rather than synchronize expirations. |
| Versioned values / tombstones | Reject stale fills and distinguish deletion from a never-created key. |
| Read replicas | Offload reads only when replica lag fits the freshness contract. |

See the [cross-system pattern index](../../patterns/index.md) for the same mechanisms in other families.

## 5. Study Topics

### Atomic key creation

#### What problem does it solve?

Prevent two owners from sharing a key.

#### How does it work?

Let the database serialize the uniqueness decision; application-side existence checks are only hints.

#### Example

```sql
INSERT INTO links (key, destination, owner_id)
VALUES ('abc123', 'https://example.com/report', 42)
ON CONFLICT (key) DO NOTHING
RETURNING key;
```
One returned row means creation succeeded. Zero rows means collision: retry with a different random key, or reject a requested alias.

#### Failure scenario

The commit succeeds but its response is lost. A client retry could create another link. If creation must be idempotent, store a request key and its result in the same transaction.

#### Trade-offs

Longer keys reduce collisions but hurt memorability. Uniqueness still needs enforcement.

#### When would I use it?

Any mutable mapping with concurrent creators, including metadata keys and custom aliases.

#### Interview questions around this topic

Why is a random UUID not a replacement for an ownership constraint?

### Cache-aside without a stampede

#### What problem does it solve?

Prevent a popular cache miss from becoming thousands of identical database reads.

#### How does it work?

Read cache; on miss, elect one loader per key within the desired coordination scope. Other requests wait briefly or use an allowed stale value. Bound wait time and database concurrency.

#### Example

At 20,000 reads/second and a 50 ms origin read, about 1,000 requests can overlap a single miss. Single-flight collapses them toward one load per application instance, not necessarily one globally.

#### Failure scenario

The elected loader hangs. Waiting indefinitely turns coalescing into an outage; give the load a deadline and allow controlled retries.

#### Trade-offs

Serving stale content improves availability only where the freshness contract permits it. Per-process coalescing still sends one read per process.

#### When would I use it?

A high hit-rate lookup workload with an expensive origin or strongly skewed popularity.

#### Interview questions around this topic

What happens if all cache nodes restart at once?

### Bounded staleness and deletion

#### What problem does it solve?

Keep deleted mappings from reappearing through cache races.

#### How does it work?

Attach monotonically increasing versions; retain a tombstone long enough to outlive delayed fills, replicas and negative caches. Check freshness at the authoritative path when revocation must be immediate.

#### Example

Reader fetches version 7. Writer deletes at version 8. Reader tries to fill version 7. A cache compare-and-set against retained version 8 rejects the older value.

#### Failure scenario

If eviction removes both value and version fence, an old loader may install version 7. A finite TTL alone bounds staleness but cannot prove immediate revocation.

#### Trade-offs

Persistent version fences consume memory/storage; strict checks reduce the cache’s ability to serve independently.

#### When would I use it?

Links with abuse removal, tenant access changes or mutable metadata.

#### Interview questions around this topic

Is invalidating the cache after a database write sufficient? Why not?

## 6. Quiz

Write or say your reasoning before opening the answers. Name the invariant, the failure window, and the recovery mechanism.

### Conceptual questions

1. What is the authoritative state in a URL lookup?

2. Why does checking a key before insertion not guarantee uniqueness?

3. Why must a collision not use a destination-overwriting upsert?

4. What does a negative cache entry represent?

5. Why can a read replica return 404 after successful creation?

6. What problem does TTL jitter solve?

7. Why does single-flight need a timeout?

8. Does hashing keys evenly guarantee balanced traffic?

9. What must be true before acknowledging a newly created mapping?

10. Why is immediate revocation harder than ordinary freshness?

### Scenario questions

11. A viral key expires and 1,000 requests reach the origin. What changes?

12. The cache fails completely. How do you keep the database alive?

13. An old reader fills the cache after deletion. How do you stop resurrection?

14. Two region-local generators allocate key 123. Who wins?

15. A create response is lost and the client retries. What is the correct response?

### Trade-off questions

16. Random keys or sequential keys?

17. Permanent redirect or temporary redirect?

18. Long TTL or short TTL?

19. One global database or regional replicas?

20. When should this system shard?

<details>
<summary>Reveal all 20 answers and reasoning</summary>

**1.** The durable key-to-destination mapping. A cache is a derived copy and cannot define ownership after it is evicted.

**2.** Another transaction can insert between the check and write. A unique constraint makes the competing writes arbitrate at one authority.

**3.** It would redirect an existing owner’s link to a new destination, violating stable identity.

**4.** A recent observation that the key was absent. It is not proof that it remains absent after a concurrent creation.

**5.** Asynchronous replication may not have applied the committed insert. Read-after-write requires a leader or a replica that has passed the write watermark.

**6.** It spreads expiration work over time. It does not prevent one extremely hot key from stampeding by itself.

**7.** A failed loader otherwise strands every waiting read; a deadline bounds failure amplification.

**8.** No. One key can receive most requests. Key distribution and request distribution are different.

**9.** The write must meet the promised durability policy; an in-memory enqueue is insufficient if process failure is within the failure model.

**10.** A stale destination is now a correctness or access-control failure. Serving old data during partitions may be forbidden.

**11.** Coalesce misses, bound concurrent origin requests, and use allowed stale data while refreshing. A bigger connection pool alone moves the overload into the database.

**12.** Apply admission control and bounded pools, shed optional work, and warm popular keys gradually. Full-rate fallback can turn a partial outage into a total one.

**13.** Compare versions against a retained fence or tombstone; for immediate revocation consult the authority. A delete-only invalidation can race the fill.

**14.** A common uniqueness authority must arbitrate, or allocation ranges must be disjoint by construction. Independent local success cannot guarantee global uniqueness.

**15.** Look up a persisted idempotency result if one-link-per-operation is promised; return that mapping. A new key is acceptable only if duplicate creations are explicitly allowed.

**16.** Choose random keys for harder enumeration, sequences for compact allocation. Neither removes authorization checks; sequences also need safe allocation across writers.

**17.** Permanent redirects allow aggressive client caching and reduce load, but make later edits/revocation harder. Mutable destinations usually need a more controllable cache policy.

**18.** Long TTL improves hit rate and origin protection; short TTL reduces stale exposure but increases refresh traffic. Pick from the freshness contract and measured load.

**19.** Replicas reduce read latency but add lag. Keep ownership writes coordinated or define conflict semantics before accepting multi-region writes.

**20.** When measured storage/write throughput or operational limits exceed one authority’s capacity. Sharding a low-write lookup service early adds routing and migration work without fixing hot-key traffic.

</details>

## End-to-End Request Walkthrough

Create a link: validate the URL and ownership → insert a unique key and optional request-key result in one transaction → commit under the durability policy → return the short URL. Resolve it: apply abuse/access rules → read a fresh-enough cache entry → coalesce a miss → fetch the mapping → cache its version with a bounded TTL → redirect. The database protects identity; the cache only earns its place by absorbing repeated reads.

## What If This Fails?

| Injected failure | Correctness and availability | Recovery |
| --- | --- | --- |
| Cache disappears | Mappings remain correct; latency rises and origin load spikes. | Bound origin concurrency, shed excess requests and warm gradually. |
| Primary fails after acknowledgement | Durability depends on the replication acknowledgement policy. | Fence the old writer; promote only a sufficiently durable replica or report the RPO honestly. |
| Invalidation event is duplicated | Deleting the same derived entry twice is safe; an old event must not erase a newer version incorrectly. | Version invalidations; allow safe cache misses. |
| Network timeout on create | Outcome is unknown, not necessarily failed. | Retry the same request key and return the committed result. |

## What Should Trigger In My Head?

**Short link / metadata lookup →** stable identity · hot keys · cache misses · explicit freshness · revocation · collision handling.
