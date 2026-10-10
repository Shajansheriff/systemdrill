---
title: "Cache Strategies"
description: "Trade origin load against staleness without making the cache an accidental authority."
order: 7
tags: ["Trade-offs", "Decision guide"]
---

## What problem are we solving?

Avoid repeated work while preserving the actual freshness and durability promises.

## How the options work

| Option | Mechanics | Best fit |
| --- | --- | --- |
| Cache-aside | Read cache, load authority on miss, fill with TTL/version. | Read-heavy data with an explicit stale-read allowance. |
| Write-through | The write path updates the cache synchronously under a chosen failure protocol. | Reads need warm state and the additional write latency is acceptable. |
| Write-behind | Buffer writes and persist later, using a durable buffer if acknowledged data cannot be lost. | Coalescible writes with explicitly engineered buffering and recovery. |

## When is each option better?

Cache-aside is a useful default for derived reads. Write-through can reduce misses but does not magically atomically couple DB and cache. Write-behind is appropriate only when its durability/failure model is explicit; an ordinary evictable cache must not become the sole copy of accepted money or inventory state.

## Concrete example

Cache destination metadata for ordinary redirects with bounded TTL. For immediately revoked access, consult a current authority or a provable revocation mechanism; merely reducing TTL does not mean immediate.

## Failure modes

Race: reader loads v7, writer commits v8 and invalidates, reader fills v7. Invalidation alone did not stop resurrection. Use version fences, authoritative checks for strict freshness or an honest bounded-staleness policy. Cache failure can stampede the DB; coalesce misses and cap origin concurrency.

## Scale implications

Estimate origin QPS as request rate × miss rate, then test cold-cache and hot-key conditions. TTL jitter spreads expirations; single-flight reduces concurrent work on one miss. Cache memory pressure and key popularity distribution matter more than a single average hit rate.

## Interview rule of thumb

> “What may be stale, for how long, and what happens when every key misses?” A cache should remain replaceable unless it was deliberately designed as a durable system.

## Apply it

[Read-heavy](../systems/01-read-heavy/index.md), [Feed](../systems/02-feed/index.md), [Geospatial](../systems/07-geospatial/index.md), [Streaming](../systems/10-streaming/index.md).

Before choosing, name the required guarantee, one failure window and the metric that would force you to revisit this decision.

