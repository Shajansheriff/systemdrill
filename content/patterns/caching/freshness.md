---
title: "Cache Freshness"
description: "An invalidation message is not a proof that no stale value can return."
order: 3
tags: ["Mechanics", "Cross-system"]
---

## Follow the race

```text
R reads origin version 7 but pauses before filling the cache.
W commits version 8 and invalidates the cache.
R resumes and fills version 7.
```

Deleting a key after a write did not prevent a stale fill. A version fence retained in the cache or authoritative store can reject older fills; its lifetime must exceed delayed/replayed work. Evicting that fence reopens the race. If immediate revocation is required, consult a current authority or use a protocol that can actually enforce it.

## Design the outage path

At 100,000 requests/second and 99% hit rate, the origin normally sees 1,000 requests/second. A total cache loss raises demand by 100 times. It is not reasonable to assume transparent fallback will work. Bound origin concurrency, coalesce hot misses, warm gradually and reject excess work deliberately.

Single-flight within each process reduces duplicate reads per process, not globally. TTL jitter spreads different keys’ refreshes; it does not by itself solve a single viral key. Serving stale values during refresh is a product correctness decision, especially for access control, balances and inventory.

## Freshness contract

Say exactly what can lag: display count for 30 seconds, public profile text for a minute, never the final ownership decision. A cache TTL is not identical to end-to-end staleness if replica lag, delayed fills and asynchronous updates also contribute.

Study [Read-heavy systems](../../systems/01-read-heavy/index.md) and [Feed visibility](../../systems/02-feed/index.md).

