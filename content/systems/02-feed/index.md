---
title: "Social Feed / Timeline Systems"
description: "Balance fan-out cost, fresh ranking, stable pagination, and the celebrity problem."
order: 2
tags: ["Scale", "Fan-out", "Ranking"]
---

## 1. Absolutely Important Invariants

### Primary invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Never expose posts the viewer cannot access. | Privacy is stronger than feed freshness. | A cached timeline retains a private or blocked author’s post. | Recheck visibility at hydration; propagate deletions and policy versions. |
| A committed post remains recoverable even if fan-out fails. | A queue failure must not erase the author’s content. | Database commit succeeds but publishing the event fails. | Durable post plus transactional outbox; rebuild derived timelines. |

### Supporting invariants

| Must remain true | Why it matters | What violates it | Enforcement |
| --- | --- | --- | --- |
| Pagination obeys a declared duplicate/omission policy. | A shifting ranked feed can repeat or skip items. | Offset pagination over changing results. | Stable cursor, tie-breaker, snapshot/ranking session when required. |
| One author cannot starve everyone else’s feed work. | Follower counts are heavily skewed. | Fan-out to 100 million followers blocks the worker pool. | Hybrid fan-out, work partitioning and per-author budgets. |

## 2. Why the Naive Design Fails

Start with `Client → API → PostgreSQL`: fetch posts by followed authors, sort by creation time, return 20.

```text
A viewer follows 3,000 active authors.
Each request merges many author ranges and checks permissions.
10,000 viewers refresh together; the same candidates are read repeatedly.
One author publishes to 100 million followers.
Switching everything to push creates 100 million timeline writes at once.
```

Pull-only fails the latency target as read amplification grows. Push-only fails the bounded-work invariant for celebrity authors. Materialized timelines help common reads; pulling selected high-fan-out authors avoids enormous write bursts. Neither cache nor fan-out replaces read-time authorization.

## 3. Core Deep Dives

### Hybrid fan-out

**Problem:** Control read and write amplification.

**Naive approach and why it fails:** Push every post to every follower; a single celebrity monopolizes workers.

**Common solution:** Push ordinary authors into active viewers’ timeline indexes; pull high-fan-out authors at read time.

**Trade-off:** More merge logic and eventual visibility in pushed timelines.

**Failure to probe:** A worker retries a batch and duplicates references.

**Interviewer follow-up:** What measurements choose the celebrity threshold?

### Candidate generation and ranking

**Problem:** Rank relevant items within a latency budget.

**Naive approach and why it fails:** Score every historical post on every request.

**Common solution:** Retrieve a bounded candidate set, hydrate authorized posts, then rank; degrade to a simpler ranker on timeout.

**Trade-off:** Candidate pruning can hide the best item; freshness competes with relevance.

**Failure to probe:** A feature service times out and the entire feed fails.

**Interviewer follow-up:** What safe fallback still meets the latency SLO?

### Pagination and invalidation

**Problem:** Maintain a usable session as content changes.

**Naive approach and why it fails:** OFFSET 20 shifts when new posts arrive; cached deleted posts remain visible.

**Common solution:** Use keyset cursors for chronological feeds; snapshot IDs and rank positions for stable ranked sessions; enforce visibility during reads.

**Trade-off:** Session state costs storage; snapshots age.

**Failure to probe:** A score changes between pages and moves an unseen item above the cursor.

**Interviewer follow-up:** Do you promise freshness, stable traversal, or both?

## 4. Canonical Solution Patterns

| Pattern | When to use it / problem it solves |
| --- | --- |
| Fan-out-on-write | Precompute cheap reads for ordinary authors and active followers. |
| Fan-out-on-read | Avoid writes to enormous or mostly inactive audiences. |
| Transactional outbox | Recover post-to-fan-out publication after a process crash. |
| Idempotent timeline insert | Use a unique viewer/post pair so retries do not repeat a post. |
| Keyset pagination | Use a stable total ordering rather than mutable offsets. |

See the [cross-system pattern index](../../patterns/index.md) for the same mechanisms in other families.

## 5. Study Topics

### Measure fan-out before choosing it

#### What problem does it solve?

Choose push/pull from actual work, not a product name.

#### How does it work?

Estimate posts per second × active followers for push, versus refresh rate × followed authors for pull. Consider skew and worker catch-up time.

#### Example

At 10,000 posts/second and 200 active followers each, push creates 2 million references/second. One 100-million-follower author alone can add 100 million references for one post.

#### Failure scenario

A job with millions of followers is placed on one worker. Split into checkpointed ranges and isolate large authors so ordinary feeds keep moving.

#### Trade-offs

Pull saves storage and write work but adds read merges. Push pays for users who may never return.

#### When would I use it?

A feed with repeated reads and a wide follower-count distribution.

#### Interview questions around this topic

How do inactive users change the push economics?

### Stable pagination

#### What problem does it solve?

Avoid shifting pages under concurrent insertions.

#### How does it work?

Order by a total key and return the last key as an opaque cursor. For a ranked session, persist a candidate snapshot or ranking generation so score changes cannot rewrite the traversal.

#### Example

```sql
SELECT id, created_at FROM posts
WHERE (created_at, id) < (:last_time, :last_id)
ORDER BY created_at DESC, id DESC LIMIT 20;
```
The ID breaks timestamp ties. This describes chronological ordering; do not apply it to mutable ranking scores without a session policy.

#### Failure scenario

A deleted item disappears from a snapshot. Skip it at hydration and fetch extra candidates; never resurrect it just to fill the page.

#### Trade-offs

Stable sessions may omit new posts until refresh. Stateless fresh ranking can repeat or omit items unless it tracks seen IDs.

#### When would I use it?

Infinite scrolling where users expect a coherent traversal.

#### Interview questions around this topic

What does your cursor encode, and what happens when the ranking model changes?

### Derived timelines and permission gates

#### What problem does it solve?

Keep asynchronous feed materialization from becoming a privacy authority.

#### How does it work?

Store post references in timeline indexes. Fetch current visibility and content when serving them; fan-out and removal events improve freshness but do not grant access.

#### Example

A public post is pushed at 09:00. At 09:01 the author makes it private. At 09:02 the cached reference still exists; hydration rejects it for a non-follower.

#### Failure scenario

If the authorization service is unavailable, serving cached public status can leak content. Fail closed for restricted content or use a policy with a proven freshness guarantee.

#### Trade-offs

Authorization checks add read cost. Batched checks and versioned policy caches can reduce cost without assuming old permission is forever valid.

#### When would I use it?

Feeds containing private groups, block lists or moderated content.

#### Interview questions around this topic

Can deletion be eventual while access revocation is immediate?

## 6. Quiz

Write or say your reasoning before opening the answers. Name the invariant, the failure window, and the recovery mechanism.

### Conceptual questions

1. What is fan-out amplification?

2. Why retain a canonical post store?

3. Why push references instead of full posts?

4. Why is a celebrity special?

5. What does eventual feed consistency mean here?

6. What makes offset pagination unstable?

7. Why does keyset ordering need a tie-breaker?

8. What is candidate generation?

9. Why is ranking not the authorization layer?

10. What must a fan-out checkpoint track?

### Scenario questions

11. A worker crashes halfway through fan-out. Recover.

12. A post is deleted while cached in a million feeds. What prevents exposure?

13. A 100-million-follower account posts during peak traffic. What changes?

14. A ranker times out. Should the feed fail?

15. New posts arrive between pages. Can the user see everything exactly once?

### Trade-off questions

16. Push or pull for inactive followers?

17. Rank fresh every page or pin a session?

18. Store full feed objects or references?

19. One queue or separate work budgets?

20. Should every feed action use strong consistency?

<details>
<summary>Reveal all 20 answers and reasoning</summary>

**1.** The number of downstream timeline writes per published post; follower skew makes the average misleading.

**2.** Timelines are rebuildable indexes. Canonical posts preserve content when fan-out workers fail.

**3.** References reduce duplicated payload and simplify edits; hydration adds a read but can enforce current visibility.

**4.** One write produces enormous work; it is the distribution of followers rather than merely total users that changes the design.

**5.** A committed post may appear in a follower’s derived timeline later. It must not imply that revoked access remains allowed indefinitely.

**6.** Inserts or rank changes shift item positions between requests, so the same numeric offset refers to different items.

**7.** Multiple posts may share a timestamp. A unique second key makes the order deterministic.

**8.** A bounded retrieval stage before expensive ranking; it trades recall against latency.

**9.** A relevance score does not prove visibility. Unauthorized candidates must be removed independently.

**10.** The post and completed follower ranges; retries must be safe through unique viewer/post insertion.

**11.** Replay from a durable checkpoint, allowing overlap. Unique viewer/post keys prevent repeated references while completing unfinished ranges.

**12.** Read-time visibility/tombstone filtering protects correctness; asynchronous removal reduces wasted reads and stale placeholders.

**13.** Pull that author’s candidates at read time or isolate bounded push batches. Do not let its work consume the shared ordinary-author budget.

**14.** Use an approved chronological or cached-score fallback with the same authorization checks; reduced relevance is often better than unavailability.

**15.** Only under a specified snapshot/session traversal model. A continuously reranked infinite stream cannot promise that trivially.

**16.** Pull usually avoids precomputing unused work; a return visit can rebuild or merge recent candidates.

**17.** Fresh ranking tracks new signals but destabilizes pagination. A pinned generation gives coherent traversal at a freshness/storage cost.

**18.** Objects reduce hydration reads but amplify edits and deletion work; references keep canonical content centralized.

**19.** Separate budgets isolate celebrity or backfill work. More queues add operations, but one FIFO can produce severe head-of-line blocking.

**20.** Use strong enough checks for authorization and canonical writes; derived ordering and counts can lag if the product defines that delay.

</details>

## End-to-End Request Walkthrough

Author publishes → transaction commits the post and outbox record → relay retries publication → bounded fan-out jobs insert unique viewer/post references. Viewer opens the feed → merge pushed references with pulled celebrity candidates → hydrate and check current access → rank within a deadline → return a session/cursor. Canonical durability lives at commit; privacy lives at read-time filtering.

## What If This Fails?

| Injected failure | Correctness and availability | Recovery |
| --- | --- | --- |
| Fan-out queue down | Posts remain durable; follower visibility is delayed. | Drain the outbox after recovery; measure oldest unprocessed age. |
| Duplicate fan-out event | No extra logical post if inserts are unique. | Upsert the reference without duplicating membership. |
| Timeline cache lost | Latency degrades; canonical content is intact. | Rebuild from posts and follow relationships with bounded concurrency. |
| Visibility dependency down | Privacy must remain intact; some reads become unavailable. | Fail closed for uncertain permissions; retry and invalidate obsolete policy caches. |

## What Should Trigger In My Head?

**Timeline →** graph skew · hybrid fan-out · candidate budget · ranking session · cursor · visibility at read time.
