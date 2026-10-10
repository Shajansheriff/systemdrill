---
title: "Search / Indexing / Crawling"
description: "Build a recoverable derived index while managing freshness, ranking, and crawl pressure."
order: 11
tags: ["Scale", "Indexing", "Freshness"]
---

## 1. Absolutely Important Invariants

### Primary invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Search results must not bypass source visibility. | A stale index can expose deleted or private documents. | Index ACL/deletion state lags the source of truth. | Filter against current authority for strict access; versioned tombstones and bounded freshness elsewhere. |
| Older updates cannot overwrite newer indexed state. | Replay and parallel ingestion can reorder events. | Version 9 arrives after version 10 and replaces it. | Source versions/external version checks, including deletion versions. |

### Supporting invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| The index is rebuildable from durable source data/events. | Corruption or schema changes must not destroy the only copy. | Search engine is the sole store with no replay/snapshot. | Canonical store plus snapshot/change-log rebuild protocol. |
| Crawling obeys per-origin budgets and scope. | Unbounded discovery can overload sites or consume all capacity. | Crawler recursively follows traps and floods one host. | Normalized frontier, dedup, per-host pacing, robots policy and fetch limits. |

## 2. Why the Naive Design Fails

Start with `Client → API → PostgreSQL`, running `LIKE '%term%'` over every document.

```text
A query scans 10 million bodies to find 20 matches.
100 simultaneous queries repeat those scans.
Meanwhile, index workers apply product version 11, then delayed version 10.
Search shows an old price and may revive a deleted item.
```

Scanning fails latency/capacity; an inverted index changes the retrieval structure. Reordered ingestion is a distinct correctness problem: versioned writes and tombstones prevent regression. The search index stays derived; checkout still checks authoritative price/inventory.

## 3. Core Deep Dives

### Inverted retrieval and ranking

**Problem:** Retrieve relevant candidates without scanning every body.

**Naive approach and why it fails:** Full table scan and sort every document per query.

**Common solution:** Tokenize documents into posting lists; retrieve candidates with term statistics, then rank a bounded set.

**Trade-off:** Language analysis and ranking choices change recall/precision.

**Failure to probe:** Analyzer changes make old and new documents incomparable.

**Interviewer follow-up:** How do you migrate an index schema without a partial cutover?

### Fresh indexing and rebuild

**Problem:** Apply updates/deletes safely while allowing replay.

**Naive approach and why it fails:** Fire-and-forget dual writes to DB and index.

**Common solution:** Outbox/CDC, source versions, tombstones, snapshot plus change-log catch-up, atomic alias cutover.

**Trade-off:** Freshness is delayed; rebuild needs retained log coverage and extra capacity.

**Failure to probe:** Snapshot runs while updates continue and misses their boundary.

**Interviewer follow-up:** Which watermark joins the snapshot to the change log?

### Crawl frontier and autocomplete

**Problem:** Bound discovery and user-facing latency.

**Naive approach and why it fails:** Follow every URL repeatedly and query full search for each keystroke.

**Common solution:** Normalize/deduplicate frontier; per-host budgets; prefix/suggestion indexes with short deadlines.

**Trade-off:** Normalization can merge distinct URLs; suggestions trade freshness for speed.

**Failure to probe:** Infinite calendar URLs consume the frontier.

**Interviewer follow-up:** How would you prevent one domain from starving the crawl?

## 4. Canonical Solution Patterns

| Pattern | When to use it / problem it solves |
| --- | --- |
| Inverted index | Map terms to candidate documents instead of scanning all content. |
| Versioned indexing | Reject stale update/delete events during replay. |
| Outbox / CDC | Recover the source-to-index update stream. |
| Shadow index + alias swap | Build a new schema and switch after catch-up validation. |
| Per-host crawl queue | Enforce politeness and isolate pathological origins. |

See the [cross-system pattern index](../../patterns/index.md) for the same mechanisms in other families.

## 5. Study Topics

### Posting lists and ranking

#### What problem does it solve?

Narrow candidate retrieval before expensive scoring.

#### How does it work?

For each normalized term, maintain a list of document IDs and useful statistics/positions. Intersect/union postings as query semantics require; rank with lexical signals, then optionally rerank a small candidate set.

#### Example

Documents D1 “red shoes”, D2 “blue shoes”, D3 “red coat” yield red→{D1,D3}, shoes→{D1,D2}. An AND query intersects to D1. Phrase search additionally needs positional information.

#### Failure scenario

Aggressive stemming collapses words users consider different, while no normalization misses variants. Evaluate analyzers by language and query class.

#### Trade-offs

More positions/features improve relevance but grow index size and update cost. Reranking cannot recover documents excluded by candidate retrieval.

#### When would I use it?

Text search where scans exceed latency/cost targets.

#### Interview questions around this topic

How does autocomplete differ from searching complete words?

### Versioned updates and tombstones

#### What problem does it solve?

Keep out-of-order delivery from regressing the index.

#### How does it work?

Give each source entity a monotonic version. Apply an event only if its version exceeds the indexed version, with idempotent equality handling. Deletion retains its version long enough to reject older replay.

#### Example

Product P receives update v10, delete v11, then delayed update v9. After v11, reject v9. If deletion erases version metadata immediately, replay can recreate P.

#### Failure scenario

Versions from independent writers are not comparable unless they share an authority or a defined conflict order. Wall-clock timestamps alone can regress under skew.

#### Trade-offs

Version retention adds metadata; long replay horizons extend tombstone lifetime. Read-time access checks remain necessary when deletion/ACL freshness must be strict.

#### When would I use it?

Any asynchronously maintained search projection.

#### Interview questions around this topic

When may a delete tombstone safely expire?

### Rebuild while writes continue

#### What problem does it solve?

Replace an index without losing changes made during the build.

#### How does it work?

Take a source snapshot tied to a log position, bulk index it, replay changes after that position, then verify lag and switch an alias. Use versions to make overlap safe. Keep old index for rollback where retention permits.

#### Example

Snapshot at log position 800 includes source state through that boundary. Build B, apply 801 onward, catch up to a chosen watermark, validate counts/samples, then route queries to B.

#### Failure scenario

CDC retention expires while a large rebuild is running. There is now an unrecoverable gap for that snapshot; restart with a new snapshot or restore the missing log, not a blind alias swap.

#### Trade-offs

Shadow indexes need extra disk and ingestion capacity; a consistent snapshot boundary may be costly.

#### When would I use it?

Analyzer, schema or ranking-feature migrations and recovery from index corruption.

#### Interview questions around this topic

How do you verify freshness rather than only document count?

## 6. Quiz

Write or say your reasoning before opening the answers. Name the invariant, the failure window, and the recovery mechanism.

### Conceptual questions

1. Why an inverted index?

2. What is a posting list?

3. Why separate retrieval from ranking?

4. What does source-of-truth mean for search?

5. Why attach entity versions?

6. Why version deletions too?

7. What does CDC solve?

8. Why normalize crawl URLs carefully?

9. Why per-host pacing?

10. Why is autocomplete a separate workload?

### Scenario questions

11. v11 delete arrives before v10 update. What happens?

12. The DB commits but index publishing fails. Recover.

13. A rebuild outlives log retention. Cut over?

14. A crawler finds endless date URLs. Respond.

15. A private document remains in the index. Can it be shown?

### Trade-off questions

16. SQL text search or separate search engine?

17. Batch indexing or near-real-time?

18. Strict access filtering or index-only ACLs?

19. Prefix index or query-time wildcard search?

20. Large candidate set or tight retrieval budget?

<details>
<summary>Reveal all 20 answers and reasoning</summary>

**1.** It retrieves documents by terms directly instead of scanning every document body.

**2.** The documents, and optionally positions/statistics, associated with a normalized term.

**3.** Retrieval bounds work; ranking spends more computation on a manageable candidate set.

**4.** Canonical documents and permissions live elsewhere; the search projection can be rebuilt and may lag.

**5.** They let consumers reject stale events despite retries or reordered delivery.

**6.** An old update must not resurrect an entity after its deletion.

**7.** It exposes committed source changes for downstream indexing, avoiding fragile application dual-write gaps.

**8.** Dedup reduces repeated fetches, but over-normalization can collapse semantically different resources.

**9.** Global concurrency alone can still overwhelm a single origin and starve other hosts.

**10.** It has partial queries, high request frequency and tight latency budgets; suggestion indexes can avoid full document search on each keypress.

**11.** Keep the v11 tombstone and reject v10 by version; an absent document without a version fence is unsafe.

**12.** Replay a durable outbox/CDC event. Best-effort dual writes alone leave missing search updates.

**13.** No. The snapshot/change-log chain has a gap. Obtain a new consistent snapshot or restore missing history and verify catch-up.

**14.** Bound crawl depth/query shapes and per-origin budgets, deduplicate normalized URLs and prioritize useful content rather than unbounded discovery.

**15.** Not to unauthorized users. Check current permissions on sensitive results; index cleanup can follow asynchronously.

**16.** SQL search can suffice at moderate scale and simpler relevance needs. A separate engine earns its cost with specialized retrieval/ranking or independent scale.

**17.** Batching lowers write cost but extends visible staleness. Near-real-time reduces delay at more refresh/merge overhead.

**18.** Index-only checks are faster but inherit ACL lag. Strict revocation requires a current authority or a provable freshness protocol.

**19.** Prefix structures make frequent autocomplete cheap; wildcard scans may be simpler for small datasets but expensive at scale.

**20.** Large sets improve potential recall but increase ranking latency; small sets are fast but can exclude the best answer before ranking.

</details>

## End-to-End Request Walkthrough

Canonical document transaction commits → CDC/outbox emits versioned update → indexer tokenizes and conditionally applies version → query retrieves posting candidates → rank bounded set → enforce current visibility → return results with a pagination policy. Crawler discoveries enter a deduplicated, per-origin paced frontier before becoming canonical documents.

## What If This Fails?

| Injected failure | Correctness and availability | Recovery |
| --- | --- | --- |
| Indexer stops | Search becomes stale; canonical writes remain durable. | Resume from durable offset and monitor oldest lag. |
| Duplicate/reordered event | Could regress state without versions. | Reject lower versions and make equal-version delivery idempotent. |
| Search shard unavailable | Some or all retrieval degrades; do not silently claim complete results. | Use replicas or explicit partial-result policy and restore shard. |
| Source ACL service unavailable | Returning unverified restricted hits risks leakage. | Fail closed for uncertain permissions or serve only provably public data. |

## What Should Trigger In My Head?

**Search →** posting lists · candidate recall · versioned projection · tombstones · snapshot/log boundary · crawl budget.
